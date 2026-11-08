/**
 * Order enrichment backfill gate (M5, FEAT-004):
 *  - OPEN orders get their new OrderItem FKs populated + a FulfilmentGroup per
 *    participating farm.
 *  - HISTORICAL fulfilled orders are left untouched (null new FKs, text snapshot
 *    preserved; R14).
 *  - Order totals are unchanged by the backfill.
 */
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createTestDb, type TestDb } from "../helpers/testDb";
import { makeFarm, makeDefinition, makeOffer, makeCycle } from "../helpers/fixtures";
import {
  backfillOrders,
  verifyOrderTotalsUnchanged,
} from "../../src/lib/migrate/backfill-orders";

let tdb: TestDb;
let db: PrismaClient;

beforeAll(async () => {
  tdb = await createTestDb();
  db = tdb.prisma;
}, 60_000);

afterAll(async () => {
  await tdb.cleanup();
});

describe("order backfill (M5 gate)", () => {
  it("links open orders, preserves historical, keeps totals", async () => {
    const farm = await makeFarm(db, { slug: "ob-farm" });
    const def = await makeDefinition(db, { canonicalName: "Entrecot" });
    // Legacy product + its matching offer (same farm + same public name).
    const product = await db.product.create({
      data: {
        farmId: farm.id,
        kind: "cut",
        name: "Entrecot",
        basePriceCents: 1438,
        lifecycle: "active",
        isApproved: true,
        isActive: true,
      },
    });
    await makeOffer(db, farm.id, def.id, { publicName: "Entrecot", priceAmountCents: 1438 });
    const cycle = await makeCycle(db, { freePlaces: 10 });

    // OPEN order (reserved) -> should be backfilled.
    const openOrder = await db.order.create({
      data: {
        cycleId: cycle.id,
        status: "reserved",
        subtotalCents: 1438,
        totalCents: 2038,
        items: {
          create: [
            {
              productId: product.id,
              nameSnapshot: "Entrecot",
              priceCentsSnapshot: 1438,
              lotReferenceSnapshot: "OB-LOT",
              quantity: 1,
            },
          ],
        },
      },
    });

    // HISTORICAL fulfilled order -> must stay untouched.
    const histOrder = await db.order.create({
      data: {
        cycleId: cycle.id,
        status: "fulfilled",
        subtotalCents: 1438,
        totalCents: 2038,
        items: {
          create: [
            {
              productId: product.id,
              nameSnapshot: "Entrecot (historic)",
              priceCentsSnapshot: 1438,
              lotReferenceSnapshot: "HIST-LOT",
              quantity: 1,
            },
          ],
        },
      },
    });

    const before = new Map(
      (await db.order.findMany({ select: { id: true, totalCents: true } })).map(
        (o) => [o.id, o.totalCents],
      ),
    );

    const result = await backfillOrders(db);
    expect(result.openOrders).toBe(1);
    expect(result.itemsLinked).toBe(1);
    expect(result.fulfilmentGroups).toBe(1);
    expect(result.historicalUntouched).toBe(1);

    // Open order item now carries the offer FKs + a fulfilment group.
    const openItems = await db.orderItem.findMany({
      where: { orderId: openOrder.id },
    });
    expect(openItems[0].farmProductOfferId).not.toBeNull();
    expect(openItems[0].farmId).toBe(farm.id);
    const groups = await db.fulfilmentGroup.findMany({
      where: { orderId: openOrder.id },
    });
    expect(groups.length).toBe(1);
    expect(groups[0].farmId).toBe(farm.id);

    // Historical order item is UNTOUCHED: null new FKs, preserved snapshot.
    const histItems = await db.orderItem.findMany({
      where: { orderId: histOrder.id },
    });
    expect(histItems[0].farmProductOfferId).toBeNull();
    expect(histItems[0].farmId).toBeNull();
    expect(histItems[0].nameSnapshot).toBe("Entrecot (historic)");

    // Totals unchanged (M5 gate).
    await expect(verifyOrderTotalsUnchanged(db, before)).resolves.toBeUndefined();
  });
});
