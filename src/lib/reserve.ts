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

/** Soonest-expiry usable lot reference for a FarmProductOffer, or null. */
async function usableOfferLotReference(
  db: PrismaClient,
  offerId: string,
): Promise<string | null> {
  const lot = await db.lot.findFirst({
    where: {
      farmProductOfferId: offerId,
      isWithdrawn: false,
      isTest: false,
      units: { gt: 0 },
    },
    orderBy: { expiryDate: "asc" },
    select: { reference: true },
  });
  return lot?.reference ?? null;
}

interface ResolvedReserveItem {
  /** Legacy Product id when available; otherwise the offer/pack id (snapshot). */
  productId: string;
  name: string;
  priceCents: number;
  /** "" means no lot needed; null means a required lot was unavailable. */
  lotReference: string | null;
}

/**
 * Resolve a reserve line id to an authoritative, server-priced snapshot. Tries,
 * in order: legacy Product, FarmProductOffer (M8 offer-model path), V2 Pack.
 * Returns null when the id resolves to nothing publicly reservable.
 */
async function resolveReserveItem(
  db: PrismaClient,
  id: string,
): Promise<ResolvedReserveItem | null> {
  // 1) Legacy Product (cut or pack).
  const product = await db.product.findFirst({
    where: {
      id,
      isApproved: true,
      isActive: true,
      farm: { isApproved: true, isActive: true },
    },
  });
  if (product) {
    if (product.kind === "cut") {
      const lotRef = await usableLotReference(db, product.id);
      return {
        productId: product.id,
        name: product.name,
        priceCents: product.basePriceCents,
        lotReference: lotRef,
      };
    }
    // Legacy pack: representative lot from one of its cuts; all cuts must be usable.
    const packItems = await db.packItem.findMany({
      where: { packProductId: product.id },
      select: { cutProductId: true },
    });
    let lotRef: string | null = null;
    for (const pi of packItems) {
      const ref = await usableLotReference(db, pi.cutProductId);
      if (ref && !lotRef) lotRef = ref;
      if (!ref) {
        return {
          productId: product.id,
          name: product.name,
          priceCents: product.basePriceCents,
          lotReference: null,
        };
      }
    }
    return {
      productId: product.id,
      name: product.name,
      priceCents: product.basePriceCents,
      lotReference: lotRef,
    };
  }

  // 2) FarmProductOffer (offer-model read path / M8).
  const offer = await db.farmProductOffer.findFirst({
    where: {
      id,
      isApproved: true,
      isActive: true,
      isTest: false,
      archivedAt: null,
      farm: { isApproved: true, isActive: true, isTest: false },
    },
  });
  if (offer) {
    const lotRef = await usableOfferLotReference(db, offer.id);
    return {
      productId: offer.id,
      name: offer.publicName,
      priceCents: offer.priceAmountCents,
      lotReference: lotRef,
    };
  }

  // 3) V2 Pack (single- or multi-farm). Multi-farm requires all farms accepted.
  const pack = await db.pack.findFirst({
    where: { id, isApproved: true, isActive: true, isTest: false },
    include: { items: { include: { offer: true } }, acceptances: true },
  });
  if (pack && pack.items.length > 0) {
    if (pack.isMultiFarm) {
      const allAccepted =
        pack.acceptances.length > 0 && pack.acceptances.every((a) => a.accepted);
      if (!allAccepted) {
        return {
          productId: pack.id,
          name: pack.publicName,
          priceCents: pack.priceAmountCents,
          lotReference: null,
        };
      }
    }
    let lotRef: string | null = null;
    for (const item of pack.items) {
      if (!item.offer?.isApproved || !item.offer?.isActive) {
        return {
          productId: pack.id,
          name: pack.publicName,
          priceCents: pack.priceAmountCents,
          lotReference: null,
        };
      }
      const ref = await usableOfferLotReference(db, item.farmProductOfferId);
      if (ref && !lotRef) lotRef = ref;
      if (!ref) {
        return {
          productId: pack.id,
          name: pack.publicName,
          priceCents: pack.priceAmountCents,
          lotReference: null,
        };
      }
    }
    return {
      productId: pack.id,
      name: pack.publicName,
      priceCents: pack.priceAmountCents,
      lotReference: lotRef,
    };
  }

  return null;
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
    // Resolve the line id against, in order: a legacy Product, a FarmProductOffer
    // (offer-model read path / M8), or a V2 Pack. The client only ever supplies
    // an id; prices are always recomputed server-side from the resolved record.
    const resolved = await resolveReserveItem(db, it.productId);
    if (!resolved) {
      return {
        ok: false,
        code: "PRODUCT_UNAVAILABLE",
        message: `Product ${it.productId} is not available.`,
      };
    }
    if (resolved.lotReference === null) {
      return {
        ok: false,
        code: "PRODUCT_UNAVAILABLE",
        message: `${resolved.name} has no available lot.`,
      };
    }

    snapshots.push({
      productId: resolved.productId,
      name: resolved.name,
      priceCentsSnapshot: resolved.priceCents,
      lotReferenceSnapshot: resolved.lotReference,
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
