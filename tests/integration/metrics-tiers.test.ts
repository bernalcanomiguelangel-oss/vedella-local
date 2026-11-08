/**
 * FEAT-005 two-tier metrics: farm-scoped vs platform-wide with admin drill-down.
 *
 * Asserts:
 *  - a farm_manager sees ONLY their own farm's metrics;
 *  - a platform_admin drilling into a farm gets numbers IDENTICAL to that farm's
 *    own view, and never another farm's line items;
 *  - NO margin/cost field appears anywhere in the metrics output (decision 2);
 *  - test records are excluded by default;
 *  - a metric computed on < 20 qualifying rows is flagged sampleTooSmall.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createTestDb, type TestDb } from "../helpers/testDb";
import { makeFarm, makeCycle } from "../helpers/fixtures";
import {
  computeAnalyticsMetrics,
  SMALL_SAMPLE_THRESHOLD,
} from "../../src/lib/admin/analytics-metrics";

let testDb: TestDb;
let db: PrismaClient;

let farmA: { id: string };
let farmB: { id: string };
let cycleId: string;

async function makeConfirmedOrder(
  farmId: string,
  subtotal: number,
  opts: { isTest?: boolean; customerId?: string } = {},
) {
  return db.order.create({
    data: {
      cycleId,
      customerId: opts.customerId ?? null,
      status: "confirmed",
      subtotalCents: subtotal,
      deliveryFeeCents: 600,
      totalCents: subtotal + 600,
      isTest: opts.isTest ?? false,
      fulfilmentGroups: {
        create: [{ farmId, status: "preparing", subtotalCents: subtotal }],
      },
    },
  });
}

beforeAll(async () => {
  testDb = await createTestDb();
  db = testDb.prisma;

  farmA = await makeFarm(db, { name: "Farm A", slug: "farm-a" });
  farmB = await makeFarm(db, { name: "Farm B", slug: "farm-b" });
  const cycle = await makeCycle(db);
  cycleId = cycle.id;

  const custA = await db.user.create({
    data: { email: "custA@example.com", role: "customer" },
  });

  // Farm A: 3 confirmed orders (one customer with 2 → repeat) + 1 test order.
  await makeConfirmedOrder(farmA.id, 1000, { customerId: custA.id });
  await makeConfirmedOrder(farmA.id, 2000, { customerId: custA.id }); // repeat
  await makeConfirmedOrder(farmA.id, 3000);
  await makeConfirmedOrder(farmA.id, 9999, { isTest: true });

  // Farm B: 1 confirmed order.
  await makeConfirmedOrder(farmB.id, 5000);

  // Events for conversion/funnel on Farm A.
  for (let i = 0; i < 5; i++) {
    await db.analyticsEvent.create({
      data: { type: "reservation_started", anonSessionId: `s${i}`, farmId: farmA.id },
    });
  }
  for (let i = 0; i < 3; i++) {
    await db.analyticsEvent.create({
      data: { type: "reservation_completed", anonSessionId: `s${i}`, farmId: farmA.id },
    });
  }
});

afterAll(async () => {
  await testDb.cleanup();
});

describe("farm isolation", () => {
  it("a farm sees only its own revenue (test orders excluded)", async () => {
    const a = await computeAnalyticsMetrics(db, farmA.id);
    // 1000 + 2000 + 3000 (+600 delivery each) = 6000 + 1800 = 7800. Test order
    // (9999) is excluded.
    expect(a.kpis.recordedRevenue.value).toBe(7800);
    expect(a.scope).toBe("farm");

    const b = await computeAnalyticsMetrics(db, farmB.id);
    expect(b.kpis.recordedRevenue.value).toBe(5600); // 5000 + 600
    // Farm A's revenue never bleeds into Farm B's view.
    expect(b.kpis.recordedRevenue.value).not.toBe(a.kpis.recordedRevenue.value);
  });

  it("platform drill-down into a farm matches that farm's own view", async () => {
    const farmView = await computeAnalyticsMetrics(db, farmA.id);
    const adminDrill = await computeAnalyticsMetrics(db, null, { farmId: farmA.id });
    expect(adminDrill.kpis.recordedRevenue.value).toBe(
      farmView.kpis.recordedRevenue.value,
    );
    expect(adminDrill.kpis.reservations.value).toBe(
      farmView.kpis.reservations.value,
    );
    expect(adminDrill.scope).toBe("farm");
  });

  it("platform-wide aggregates sum farms via per-farm slices, exposing no line items", async () => {
    const platform = await computeAnalyticsMetrics(db, null);
    // 7800 (A) + 5600 (B) = 13400.
    expect(platform.kpis.recordedRevenue.value).toBe(13400);
    expect(platform.scope).toBe("platform");
    // Multi-farm cards expose totals/averages per farm, not individual rows.
    const names = platform.multiFarm.revenueByFarm.map((r) => r.farmName).sort();
    expect(names).toEqual(["Farm A", "Farm B"]);
    for (const r of platform.multiFarm.revenueByFarm) {
      // Only aggregate numbers are present — no order ids / customer data.
      expect(Object.keys(r).sort()).toEqual(
        ["farmId", "farmName", "reservations", "revenueCents"].sort(),
      );
    }
    // A farm-scoped view never populates the multi-farm cards.
    const farmScoped = await computeAnalyticsMetrics(db, farmA.id);
    expect(farmScoped.multiFarm.revenueByFarm).toHaveLength(0);
  });
});

describe("no margin/cost anywhere (decision 2)", () => {
  it("the metrics output contains no margin/cost field", async () => {
    const platform = await computeAnalyticsMetrics(db, null);
    const serialised = JSON.stringify(platform).toLowerCase();
    expect(serialised).not.toContain("margin");
    expect(serialised).not.toContain("\"cost\"");
    expect(serialised).not.toContain("costcents");
    expect(serialised).not.toContain("contribution");
    // The KPI key set is exactly the cost-free set.
    expect(Object.keys(platform.kpis).sort()).toEqual(
      [
        "aov",
        "conversion",
        "deliveryCostPerOrder",
        "interestNextCycle",
        "recordedRevenue",
        "repeatPurchase",
        "reservations",
      ].sort(),
    );
    // Guard: no key mentions margin/contribution.
    for (const key of Object.keys(platform.kpis)) {
      expect(key.toLowerCase()).not.toContain("margin");
      expect(key.toLowerCase()).not.toContain("contribution");
    }
  });
});

describe("small-sample flag", () => {
  it("flags metrics computed on < 20 qualifying rows", async () => {
    const a = await computeAnalyticsMetrics(db, farmA.id);
    // Only 3 confirmed orders → far below the threshold.
    expect(a.kpis.recordedRevenue.sampleCount).toBeLessThan(
      SMALL_SAMPLE_THRESHOLD,
    );
    expect(a.kpis.recordedRevenue.sampleTooSmall).toBe(true);
  });

  it("computes conversion from events (completed / started)", async () => {
    const a = await computeAnalyticsMetrics(db, farmA.id);
    expect(a.kpis.conversion.value).toBeCloseTo(3 / 5, 5);
  });

  it("computes repeat purchase from customers with >= 2 orders", async () => {
    const a = await computeAnalyticsMetrics(db, farmA.id);
    // custA has 2 orders out of 1 distinct customer with orders → 1/1 = 1.0.
    expect(a.kpis.repeatPurchase.value).toBe(1);
  });
});

describe("test records excluded by default; includeTest opts in", () => {
  it("includes test orders when includeTest is true", async () => {
    const excluded = await computeAnalyticsMetrics(db, farmA.id);
    const included = await computeAnalyticsMetrics(db, farmA.id, {
      includeTest: true,
    });
    expect(included.kpis.recordedRevenue.value).toBeGreaterThan(
      excluded.kpis.recordedRevenue.value,
    );
  });
});
