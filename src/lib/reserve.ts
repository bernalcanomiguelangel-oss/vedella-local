/**
 * Reservation server logic. Kept as a plain function (separate from the HTTP
 * route) so integration tests can exercise it directly against a real SQLite db,
 * including concurrent/looped no-oversell attempts.
 *
 * Guarantees:
 *  - Binds the order to the single active ReservationCycle (R18).
 *  - Decrements freePlaces ATOMICALLY and rejects when the cycle is full — never
 *    oversells. The decrement is a single conditional updateMany (freePlaces > 0);
 *    if zero rows are affected, the cycle was full. A DB CHECK (freePlaces >= 0)
 *    is the final backstop.
 *  - Recomputes prices server-side from the DB via pricing.ts. The client never
 *    supplies prices (ai-guardrails + integrity: prices are deterministic).
 *  - Creates immutable Order + OrderItem snapshots (name, price, lot reference)
 *    so historical orders survive product/lot changes (R14).
 *  - Routes payment through the PaymentGateway seam (pay-on-delivery, no charge).
 */
import type { PrismaClient } from "@prisma/client";
import { priceBasket } from "./pricing";
import { getPaymentGateway } from "./payment/gateway";

export interface ReserveLineInput {
  productId: string;
  quantity: number;
}

export interface ReserveInput {
  items: ReserveLineInput[];
  customerName?: string;
  customerEmail?: string;
}

export type ReserveOutcome =
  | {
      ok: true;
      orderId: string;
      lotReference: string;
      subtotalCents: number;
      discountCents: number;
      deliveryFeeCents: number;
      totalCents: number;
      cycleName: string;
      deliveryDate: Date;
      items: {
        name: string;
        quantity: number;
        priceCentsSnapshot: number;
        lotReferenceSnapshot: string;
      }[];
      payment: { provider: string; charged: boolean; status: string };
    }
  | { ok: false; code: ReserveErrorCode; message: string };

export type ReserveErrorCode =
  | "EMPTY_BASKET"
  | "NO_ACTIVE_CYCLE"
  | "CYCLE_FULL"
  | "PRODUCT_UNAVAILABLE"
  | "BAD_QUANTITY";

/**
 * Pick a representative, publicly usable lot reference for a product: a
 * non-withdrawn, non-test lot with units > 0, soonest expiry first. Returns null
 * if none.
 */
async function usableLotReference(
  db: PrismaClient,
  productId: string,
): Promise<string | null> {
  const lot = await db.lot.findFirst({
    // Public offering excludes withdrawn (R13) and test/demo (R15) lots.
    where: { productId, isWithdrawn: false, isTest: false, units: { gt: 0 } },
    orderBy: { expiryDate: "asc" },
    select: { reference: true },
  });
  return lot?.reference ?? null;
}

export async function reserve(
  db: PrismaClient,
  input: ReserveInput,
): Promise<ReserveOutcome> {
  const items = input.items ?? [];
  if (items.length === 0) {
    return { ok: false, code: "EMPTY_BASKET", message: "Basket is empty." };
  }
  for (const it of items) {
    if (!Number.isInteger(it.quantity) || it.quantity < 1) {
      return {
        ok: false,
        code: "BAD_QUANTITY",
        message: `Invalid quantity for product ${it.productId}.`,
      };
    }
  }

  const cycle = await db.reservationCycle.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: "desc" },
  });
  if (!cycle) {
    return {
      ok: false,
      code: "NO_ACTIVE_CYCLE",
      message: "No active reservation cycle.",
    };
  }

  // Resolve every product server-side: it must be approved+active, from an
  // approved+active farm, and backed by a usable lot. Build price snapshots.
  const snapshots: {
    productId: string;
    name: string;
    priceCentsSnapshot: number;
    lotReferenceSnapshot: string;
    quantity: number;
  }[] = [];

  for (const it of items) {
    const product = await db.product.findFirst({
      where: {
        id: it.productId,
        isApproved: true,
        isActive: true,
        farm: { isApproved: true, isActive: true },
      },
    });
    if (!product) {
      return {
        ok: false,
        code: "PRODUCT_UNAVAILABLE",
        message: `Product ${it.productId} is not available.`,
      };
    }

    // Lot reference for traceability. A cut needs its own usable lot; a pack
    // uses a representative lot from one of its included cuts.
    let lotRef: string | null = null;
    if (product.kind === "cut") {
      lotRef = await usableLotReference(db, product.id);
      if (!lotRef) {
        return {
          ok: false,
          code: "PRODUCT_UNAVAILABLE",
          message: `Product ${product.name} has no available lot.`,
        };
      }
    } else {
      const packItems = await db.packItem.findMany({
        where: { packProductId: product.id },
        select: { cutProductId: true },
      });
      for (const pi of packItems) {
        const ref = await usableLotReference(db, pi.cutProductId);
        if (ref && !lotRef) lotRef = ref;
        if (!ref) {
          return {
            ok: false,
            code: "PRODUCT_UNAVAILABLE",
            message: `Pack ${product.name} has an unavailable cut.`,
          };
        }
      }
    }

    snapshots.push({
      productId: product.id,
      name: product.name,
      priceCentsSnapshot: product.basePriceCents,
      lotReferenceSnapshot: lotRef ?? "",
      quantity: it.quantity,
    });
  }

  // Authoritative pricing from server-side snapshots.
  const pricing = priceBasket(
    snapshots.map((s) => ({
      unitPriceCents: s.priceCentsSnapshot,
      quantity: s.quantity,
    })),
  );

  const representativeLot =
    snapshots.find((s) => s.lotReferenceSnapshot)?.lotReferenceSnapshot ?? "";

  // Reserve the place with a SINGLE atomic statement — the guard against
  // oversell. updateMany with `freePlaces > 0` compiles to one UPDATE ... WHERE,
  // which the database applies atomically; only one caller can win the last
  // place no matter how many race. Using a single statement (not an interactive
  // transaction) also avoids SQLite write-lock contention under concurrency.
  // The DB CHECK (freePlaces >= 0) is the final backstop.
  const decremented = await db.reservationCycle.updateMany({
    where: { id: cycle.id, freePlaces: { gt: 0 } },
    data: { freePlaces: { decrement: 1 } },
  });
  if (decremented.count === 0) {
    return { ok: false, code: "CYCLE_FULL", message: "The active cycle is full." };
  }

  // The place is now held. Create the order snapshot. If this unexpectedly
  // fails, release the held place so it is not leaked.
  let order;
  try {
    order = await db.order.create({
      data: {
        cycleId: cycle.id,
        lotReferenceSnapshot: representativeLot,
        status: "reserved",
        subtotalCents: pricing.subtotalCents,
        discountCents: pricing.discountCents,
        deliveryFeeCents: pricing.deliveryFeeCents,
        totalCents: pricing.totalCents,
        items: {
          create: snapshots.map((s) => ({
            productId: s.productId,
            nameSnapshot: s.name,
            priceCentsSnapshot: s.priceCentsSnapshot,
            lotReferenceSnapshot: s.lotReferenceSnapshot,
            quantity: s.quantity,
          })),
        },
      },
    });
  } catch (err) {
    // Compensate: give the place back so the counter stays consistent.
    await db.reservationCycle.update({
      where: { id: cycle.id },
      data: { freePlaces: { increment: 1 } },
    });
    throw err;
  }

  const gateway = getPaymentGateway();
  const intent = await gateway.createReservation({
    orderId: order.id,
    amountCents: pricing.totalCents,
    description: "Reserva ara, paga a l'entrega",
  });

  return {
    ok: true,
    orderId: order.id,
    lotReference: representativeLot,
    subtotalCents: pricing.subtotalCents,
    discountCents: pricing.discountCents,
    deliveryFeeCents: pricing.deliveryFeeCents,
    totalCents: pricing.totalCents,
    cycleName: cycle.name,
    deliveryDate: cycle.deliveryDate,
    items: snapshots.map((s) => ({
      name: s.name,
      quantity: s.quantity,
      priceCentsSnapshot: s.priceCentsSnapshot,
      lotReferenceSnapshot: s.lotReferenceSnapshot,
    })),
    payment: {
      provider: intent.provider,
      charged: intent.charged,
      status: intent.status,
    },
  };
}
