/**
 * Integration tests for the reservation flow (R18, R14) against a real SQLite db.
 * Exercises the server-side reserve() logic directly, including looped and
 * concurrent attempts to prove the cycle never oversells its free places.
 */
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createTestDb, type TestDb } from "../helpers/testDb";
import { makeCycle, makeFarm, makeLot, makeProduct } from "../helpers/fixtures";
import { reserve } from "../../src/lib/reserve";

let tdb: TestDb;
let db: PrismaClient;

beforeAll(async () => {
  tdb = await createTestDb();
  db = tdb.prisma;
}, 60_000);

afterAll(async () => {
  await tdb.cleanup();
});

async function setupOfferedCut(slug: string, priceCents = 1438) {
  const farm = await makeFarm(db, { slug });
  const product = await makeProduct(db, farm.id, {
    name: `Cut-${slug}`,
    basePriceCents: priceCents,
  });
  await makeLot(db, farm.id, product.id, {
    reference: `LOT-${slug}`,
    units: 100,
  });
  return product;
}

describe("reserve(): success path", () => {
  it("creates an immutable order with a lot code and pay-on-delivery payment", async () => {
    const product = await setupOfferedCut("ok", 1438);
    await makeCycle(db, { totalPlaces: 10, freePlaces: 10 });

    const outcome = await reserve(db, {
      items: [{ productId: product.id, quantity: 1 }],
      customerName: "Anna",
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.lotReference).toBe("LOT-ok");
    expect(outcome.subtotalCents).toBe(1438);
    expect(outcome.deliveryFeeCents).toBe(600);
    expect(outcome.totalCents).toBe(1438 + 600);
    expect(outcome.payment.charged).toBe(false);
    expect(outcome.payment.provider).toBe("pay_on_delivery");

    // Order + item snapshots persisted.
    const order = await db.order.findUnique({
      where: { id: outcome.orderId },
      include: { items: true },
    });
    expect(order?.items[0].nameSnapshot).toBe("Cut-ok");
    expect(order?.items[0].priceCentsSnapshot).toBe(1438);
    expect(order?.items[0].lotReferenceSnapshot).toBe("LOT-ok");
  });

  it("applies the discount tier for 3+ units", async () => {
    const product = await setupOfferedCut("disc", 1000);
    await makeCycle(db, { totalPlaces: 10, freePlaces: 10 });
    const outcome = await reserve(db, {
      items: [{ productId: product.id, quantity: 3 }],
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    // 3 units -> 2% discount on 3000 = 60; + 600 delivery.
    expect(outcome.subtotalCents).toBe(3000);
    expect(outcome.discountCents).toBe(60);
    expect(outcome.totalCents).toBe(3000 - 60 + 600);
  });
});

describe("reserve(): rejections", () => {
  it("rejects when there is no active cycle", async () => {
    // Fresh db section: use an inactive cycle only.
    const product = await setupOfferedCut("nocycle");
    await makeCycle(db, { isActive: false });
    // There may be active cycles from earlier tests in this file's db, so make a
    // dedicated empty-DB assertion via a separate isolated db.
    const isolated = await createTestDb();
    try {
      const p2farm = await makeFarm(isolated.prisma, { slug: "iso" });
      const p2 = await makeProduct(isolated.prisma, p2farm.id);
      await makeLot(isolated.prisma, p2farm.id, p2.id, { reference: "ISO-1" });
      const outcome = await reserve(isolated.prisma, {
        items: [{ productId: p2.id, quantity: 1 }],
      });
      expect(outcome.ok).toBe(false);
      if (outcome.ok) return;
      expect(outcome.code).toBe("NO_ACTIVE_CYCLE");
    } finally {
      await isolated.cleanup();
    }
    void product;
  });

  it("rejects a withdrawn/unavailable product", async () => {
    const isolated = await createTestDb();
    try {
      const farm = await makeFarm(isolated.prisma, { slug: "wd" });
      const product = await makeProduct(isolated.prisma, farm.id);
      await makeLot(isolated.prisma, farm.id, product.id, {
        reference: "WD-1",
        isWithdrawn: true,
      });
      await makeCycle(isolated.prisma, { freePlaces: 5 });
      const outcome = await reserve(isolated.prisma, {
        items: [{ productId: product.id, quantity: 1 }],
      });
      expect(outcome.ok).toBe(false);
      if (outcome.ok) return;
      expect(outcome.code).toBe("PRODUCT_UNAVAILABLE");
    } finally {
      await isolated.cleanup();
    }
  });
});

describe("R18: reservation never oversells", () => {
  it("looped attempts stop exactly at the free-place limit", async () => {
    const isolated = await createTestDb();
    try {
      const farm = await makeFarm(isolated.prisma, { slug: "oversell-loop" });
      const product = await makeProduct(isolated.prisma, farm.id);
      await makeLot(isolated.prisma, farm.id, product.id, {
        reference: "OS-LOOP",
        units: 500,
      });
      const FREE = 5;
      await makeCycle(isolated.prisma, {
        totalPlaces: FREE,
        freePlaces: FREE,
      });

      let successes = 0;
      let fulls = 0;
      for (let i = 0; i < FREE + 8; i++) {
        const outcome = await reserve(isolated.prisma, {
          items: [{ productId: product.id, quantity: 1 }],
        });
        if (outcome.ok) successes++;
        else if (outcome.code === "CYCLE_FULL") fulls++;
      }

      expect(successes).toBe(FREE);
      expect(fulls).toBe(8);

      const cycle = await isolated.prisma.reservationCycle.findFirst();
      expect(cycle?.freePlaces).toBe(0);
      const orders = await isolated.prisma.order.count();
      expect(orders).toBe(FREE);
    } finally {
      await isolated.cleanup();
    }
  });

  it("concurrent attempts never drive free places below zero", async () => {
    const isolated = await createTestDb();
    try {
      const farm = await makeFarm(isolated.prisma, { slug: "oversell-conc" });
      const product = await makeProduct(isolated.prisma, farm.id);
      await makeLot(isolated.prisma, farm.id, product.id, {
        reference: "OS-CONC",
        units: 500,
      });
      const FREE = 3;
      const OVERSHOOT = 9;
      await makeCycle(isolated.prisma, {
        totalPlaces: FREE,
        freePlaces: FREE,
      });

      // Fire all attempts "at once". SQLite serialises writes, so the atomic
      // conditional decrement inside each transaction still guarantees no
      // oversell even when the calls race. allSettled tolerates a transient
      // "database is locked" rejection without masking the invariant: the DB
      // CHECK (freePlaces >= 0) makes overselling impossible regardless.
      const attempts = Array.from({ length: FREE + OVERSHOOT }, () =>
        reserve(isolated.prisma, {
          items: [{ productId: product.id, quantity: 1 }],
        }),
      );
      const results = await Promise.allSettled(attempts);
      const successes = results.filter(
        (r) => r.status === "fulfilled" && r.value.ok,
      ).length;

      // At most FREE reservations can ever succeed; never more (no oversell).
      expect(successes).toBeLessThanOrEqual(FREE);

      const cycle = await isolated.prisma.reservationCycle.findFirst();
      expect(cycle!.freePlaces).toBeGreaterThanOrEqual(0);
      const orders = await isolated.prisma.order.count();
      // Orders never exceed the places that were available.
      expect(orders).toBeLessThanOrEqual(FREE);
      // Orders created exactly match places consumed (freePlaces + orders == FREE).
      expect(orders + cycle!.freePlaces).toBe(FREE);
    } finally {
      await isolated.cleanup();
    }
  }, 20_000);
});
