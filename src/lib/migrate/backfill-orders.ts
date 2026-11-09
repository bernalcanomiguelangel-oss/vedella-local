/**
 * Order enrichment backfill (migration M5, FEAT-004).
 *
 * SAFE + HISTORICAL-PRESERVING:
 *  - OPEN orders (status reserved/confirmed/fulfilling) get their new OrderItem
 *    FKs (farmProductOfferId / farmId / productDefinitionId) populated from the
 *    legacy productId snapshot where we can resolve it, and a FulfilmentGroup
 *    per participating farm so each farm sees only its slice.
 *  - HISTORICAL fulfilled/cancelled orders are left UNTOUCHED: their text
 *    snapshots stay, the new FKs stay null (R14). We never rewrite them.
 *  - Order totals are NEVER modified by this backfill (M5 gate).
 *
 * This is pure data logic, invoked from the seed and exercised in tests.
 */
import type { PrismaClient } from "@prisma/client";

/** Statuses considered "open" (still fulfillable) and thus safe to backfill. */
export const OPEN_ORDER_STATUSES = ["reserved", "confirmed", "fulfilling"];

export interface OrderBackfillResult {
  openOrders: number;
  itemsLinked: number;
  fulfilmentGroups: number;
  historicalUntouched: number;
}

/**
 * Resolve the offer that corresponds to a legacy product id: the legacy cut
 * Product shares a canonical name with a ProductDefinition; the backfill-offers
 * step created one FarmProductOffer per cut Product on the same farm. We map a
 * legacy OrderItem.productId -> the offer for the SAME farm + canonical name.
 */
async function resolveOfferForProduct(
  db: PrismaClient,
  productId: string,
): Promise<{
  offerId: string;
  farmId: string;
  productDefinitionId: string;
  farmName: string;
  definitionName: string;
} | null> {
  const product = await db.product.findUnique({
    where: { id: productId },
    include: { farm: true },
  });
  if (!product) return null;
  const offer = await db.farmProductOffer.findFirst({
    where: { farmId: product.farmId, publicName: product.name },
    include: { farm: true, productDefinition: true },
  });
  if (!offer) return null;
  return {
    offerId: offer.id,
    farmId: offer.farmId,
    productDefinitionId: offer.productDefinitionId,
    farmName: offer.farm.name,
    definitionName: offer.productDefinition.canonicalName,
  };
}

export async function backfillOrders(
  db: PrismaClient,
): Promise<OrderBackfillResult> {
  const orders = await db.order.findMany({ include: { items: true } });
  let openOrders = 0;
  let itemsLinked = 0;
  let fulfilmentGroups = 0;
  let historicalUntouched = 0;

  for (const order of orders) {
    const isOpen = OPEN_ORDER_STATUSES.includes(order.status);
    if (!isOpen) {
      historicalUntouched++;
      continue;
    }
    openOrders++;

    const farmSubtotals = new Map<string, number>();

    for (const item of order.items) {
      if (!item.productId) continue;
      const resolved = await resolveOfferForProduct(db, item.productId);
      if (!resolved) continue;
      await db.orderItem.update({
        where: { id: item.id },
        data: {
          farmProductOfferId: resolved.offerId,
          farmId: resolved.farmId,
          productDefinitionId: resolved.productDefinitionId,
          farmNameSnapshot: resolved.farmName,
          definitionNameSnapshot: resolved.definitionName,
        },
      });
      itemsLinked++;
      const line = item.priceCentsSnapshot * item.quantity;
      farmSubtotals.set(
        resolved.farmId,
        (farmSubtotals.get(resolved.farmId) ?? 0) + line,
      );
    }

    // One FulfilmentGroup per participating farm (farm-level slice).
    for (const [farmId, subtotalCents] of farmSubtotals) {
      await db.fulfilmentGroup.upsert({
        where: { orderId_farmId: { orderId: order.id, farmId } },
        create: { orderId: order.id, farmId, subtotalCents, status: "pending" },
        update: { subtotalCents },
      });
      fulfilmentGroups++;
    }
  }

  return { openOrders, itemsLinked, fulfilmentGroups, historicalUntouched };
}

/**
 * M5 gate: confirm no OPEN order's totals changed. The caller captures a
 * snapshot of (orderId -> totalCents) BEFORE the backfill and passes it here.
 * Throws when any total drifted.
 */
export async function verifyOrderTotalsUnchanged(
  db: PrismaClient,
  before: Map<string, number>,
): Promise<void> {
  const orders = await db.order.findMany({
    select: { id: true, totalCents: true },
  });
  for (const o of orders) {
    const prev = before.get(o.id);
    if (prev !== undefined && prev !== o.totalCents) {
      throw new Error(
        `M5 gate failed: order ${o.id} total changed ${prev} -> ${o.totalCents}.`,
      );
    }
  }
}
