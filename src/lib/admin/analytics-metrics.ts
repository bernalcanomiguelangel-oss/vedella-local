/**
 * Two-tier analytics metrics (FEAT-005, decisions 2/4/5).
 *
 * Computes the dictionary KPIs (analytics-dictionary §3) that are derivable from
 * the data we actually capture. CRITICAL (decision 2): there is NO margin/cost
 * card anywhere — cost is internal and must never be displayed. The KPI set is
 * therefore limited to: Recorded revenue, Reservations, AOV, Conversion,
 * Delivery cost/order, Repeat purchase, Interest next cycle, plus the multi-farm
 * cards. Contribution-margin / total-margin are intentionally omitted.
 *
 * Global rules enforced (analytics-dictionary §1):
 *  - Test records are EXCLUDED by default (isTest) — overridable via a filter.
 *  - A metric computed on < 20 qualifying rows is flagged `sampleTooSmall`.
 *  - Farm scope: a farm_manager sees ONLY its own farm; a platform_admin sees
 *    global aggregates and may drill into any single farm via `farmId`. Platform
 *    aggregates expose totals/averages, never another farm's line items.
 *
 * Determinism: every number comes from real DB rows. AI computes nothing here.
 */
import type { PrismaClient } from "@prisma/client";

/** Order statuses that count as "a confirmed sale" (confirmed → fulfilled). */
export const CONFIRMED_STATUSES = ["confirmed", "fulfilling", "fulfilled"];
/** Statuses counted for "reservations" (pending/reserved → fulfilled). */
export const RESERVATION_STATUSES = [
  "reserved",
  "confirmed",
  "fulfilling",
  "fulfilled",
];

export const SMALL_SAMPLE_THRESHOLD = 20;

export interface MetricFilters {
  /** When set, scope every query to this single farm (admin drill-down). */
  farmId?: string | null;
  cycleId?: string | null;
  from?: Date | null;
  to?: Date | null;
  language?: string | null;
  channel?: string | null;
  deliveryMethod?: string | null;
  status?: string | null;
  /** Include test records when true (default false → test excluded). */
  includeTest?: boolean;
}

export interface Kpi {
  key: string;
  /** Primary numeric value (cents for money metrics, raw count otherwise). */
  value: number;
  /** Rows the metric was computed from (for the small-sample flag). */
  sampleCount: number;
  sampleTooSmall: boolean;
  /** Optional denominator for ratio metrics. */
  denominator?: number;
  /** "money" | "count" | "ratio" — hints the UI's formatting. */
  unit: "money" | "count" | "ratio";
}

export interface MultiFarmRow {
  farmId: string;
  farmName: string;
  revenueCents: number;
  reservations: number;
}

export interface AnalyticsMetrics {
  /** The scope the numbers reflect: platform-wide or a single farm. */
  scope: "platform" | "farm";
  scopedFarmId: string | null;
  testExcluded: boolean;
  kpis: Record<string, Kpi>;
  /** Multi-farm cards: only populated for the platform scope (totals/averages,
   * never another farm's confidential line items). Empty when farm-scoped. */
  multiFarm: {
    revenueByFarm: MultiFarmRow[];
    activeFarms: number;
    ordersAwaitingFarmConfirmation: number;
    lowAvailabilityOffers: number;
  };
}

function flag(sampleCount: number): boolean {
  return sampleCount < SMALL_SAMPLE_THRESHOLD;
}

/**
 * Build the Prisma `where` for Order under the given filters + an optional farm
 * restriction. A farm restriction uses the per-farm FulfilmentGroup slice so a
 * farm only ever sees its own orders.
 */
function orderWhere(
  filters: MetricFilters,
  farmId: string | null,
  statusScope: string[],
): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  if (!filters.includeTest) where.isTest = false;
  if (filters.cycleId) where.cycleId = filters.cycleId;
  if (filters.deliveryMethod) where.deliveryMethod = filters.deliveryMethod;
  if (filters.channel) where.attributionChannel = filters.channel;
  if (filters.status && filters.status !== "all") {
    where.status = filters.status;
  } else {
    where.status = { in: statusScope };
  }
  if (filters.from || filters.to) {
    const createdAt: Record<string, Date> = {};
    if (filters.from) createdAt.gte = filters.from;
    if (filters.to) createdAt.lte = filters.to;
    where.createdAt = createdAt;
  }
  if (farmId) {
    where.fulfilmentGroups = { some: { farmId } };
  }
  return where;
}

function eventWhere(
  filters: MetricFilters,
  farmId: string | null,
  type: string,
): Record<string, unknown> {
  const where: Record<string, unknown> = { type };
  if (!filters.includeTest) where.isTest = false;
  if (filters.cycleId) where.cycleId = filters.cycleId;
  if (filters.language) where.language = filters.language;
  if (filters.channel) where.channel = filters.channel;
  if (filters.deliveryMethod) where.deliveryMethod = filters.deliveryMethod;
  if (farmId) where.farmId = farmId;
  if (filters.from || filters.to) {
    const createdAt: Record<string, Date> = {};
    if (filters.from) createdAt.gte = filters.from;
    if (filters.to) createdAt.lte = filters.to;
    where.createdAt = createdAt;
  }
  return where;
}

/**
 * Compute the two-tier analytics metrics.
 *
 * @param db        Prisma client.
 * @param scope     `null` = platform-wide aggregates (platform_admin). A farm id
 *                  = restrict to that single farm (farm_manager's own farm, OR a
 *                  platform_admin drilling into one farm). The number a platform
 *                  admin sees when drilling into farm X is IDENTICAL to what farm
 *                  X's manager sees — both call this with the same farmId.
 * @param filters   Dictionary filters (dates, cycle, channel, test, ...).
 */
export async function computeAnalyticsMetrics(
  db: PrismaClient,
  scope: string | null,
  filters: MetricFilters = {},
): Promise<AnalyticsMetrics> {
  const farmId = scope ?? filters.farmId ?? null;
  const testExcluded = !filters.includeTest;

  // --- Recorded revenue + AOV (confirmed → fulfilled). --------------------
  const confirmedWhere = orderWhere(filters, farmId, CONFIRMED_STATUSES);
  const confirmedOrders = await db.order.findMany({
    where: confirmedWhere,
    select: { totalCents: true, deliveryFeeCents: true },
  });
  const revenueCents = confirmedOrders.reduce((s, o) => s + o.totalCents, 0);
  const confirmedCount = confirmedOrders.length;

  // --- Reservations (reserved → fulfilled). -------------------------------
  const reservationCount = await db.order.count({
    where: orderWhere(filters, farmId, RESERVATION_STATUSES),
  });

  // --- Delivery cost / order (sum of deliveryFee over confirmed orders). ---
  const deliveryFeeTotal = confirmedOrders.reduce(
    (s, o) => s + o.deliveryFeeCents,
    0,
  );

  // --- Conversion (events: reservation_completed / reservation_started). ---
  const [started, completed] = await Promise.all([
    db.analyticsEvent.count({
      where: eventWhere(filters, farmId, "reservation_started"),
    }),
    db.analyticsEvent.count({
      where: eventWhere(filters, farmId, "reservation_completed"),
    }),
  ]);

  // --- Interest next cycle (events / unique sessions). ---------------------
  const interestCount = await db.analyticsEvent.count({
    where: eventWhere(filters, farmId, "next_cycle_interest_submitted"),
  });
  const sessionStartedRows = await db.analyticsEvent.findMany({
    where: eventWhere(filters, farmId, "session_started"),
    select: { anonSessionId: true },
  });
  const uniqueSessions = new Set(
    sessionStartedRows.map((r) => r.anonSessionId),
  ).size;

  // --- Repeat purchase (customers with ≥2 orders / customers with ≥1). -----
  const customerOrders = await db.order.findMany({
    where: {
      ...orderWhere(filters, farmId, CONFIRMED_STATUSES),
      customerId: { not: null },
    },
    select: { customerId: true },
  });
  const perCustomer = new Map<string, number>();
  for (const o of customerOrders) {
    if (!o.customerId) continue;
    perCustomer.set(o.customerId, (perCustomer.get(o.customerId) ?? 0) + 1);
  }
  const customersWithOrder = perCustomer.size;
  const repeatCustomers = [...perCustomer.values()].filter((n) => n >= 2).length;

  const kpis: Record<string, Kpi> = {
    recordedRevenue: {
      key: "recordedRevenue",
      value: revenueCents,
      sampleCount: confirmedCount,
      sampleTooSmall: flag(confirmedCount),
      unit: "money",
    },
    reservations: {
      key: "reservations",
      value: reservationCount,
      sampleCount: reservationCount,
      sampleTooSmall: flag(reservationCount),
      unit: "count",
    },
    aov: {
      key: "aov",
      value: confirmedCount > 0 ? Math.round(revenueCents / confirmedCount) : 0,
      sampleCount: confirmedCount,
      sampleTooSmall: flag(confirmedCount),
      denominator: confirmedCount,
      unit: "money",
    },
    conversion: {
      key: "conversion",
      value: started > 0 ? completed / started : 0,
      sampleCount: started,
      sampleTooSmall: flag(started),
      denominator: started,
      unit: "ratio",
    },
    deliveryCostPerOrder: {
      key: "deliveryCostPerOrder",
      value:
        confirmedCount > 0 ? Math.round(deliveryFeeTotal / confirmedCount) : 0,
      sampleCount: confirmedCount,
      sampleTooSmall: flag(confirmedCount),
      denominator: confirmedCount,
      unit: "money",
    },
    repeatPurchase: {
      key: "repeatPurchase",
      value: customersWithOrder > 0 ? repeatCustomers / customersWithOrder : 0,
      sampleCount: customersWithOrder,
      sampleTooSmall: flag(customersWithOrder),
      denominator: customersWithOrder,
      unit: "ratio",
    },
    interestNextCycle: {
      key: "interestNextCycle",
      value: uniqueSessions > 0 ? interestCount / uniqueSessions : 0,
      sampleCount: uniqueSessions,
      sampleTooSmall: flag(uniqueSessions),
      denominator: uniqueSessions,
      unit: "ratio",
    },
  };

  // --- Multi-farm cards: platform scope only. A farm never sees another
  // farm's rows; so when we are farm-scoped these stay empty. -----------------
  const multiFarm: AnalyticsMetrics["multiFarm"] = {
    revenueByFarm: [],
    activeFarms: 0,
    ordersAwaitingFarmConfirmation: 0,
    lowAvailabilityOffers: 0,
  };

  if (!farmId) {
    const farms = await db.farm.findMany({
      where: filters.includeTest ? {} : { isTest: false },
      select: { id: true, name: true, isApproved: true, isActive: true },
    });
    multiFarm.activeFarms = farms.filter(
      (f) => f.isApproved && f.isActive,
    ).length;

    // Revenue + reservations per farm via each farm's FulfilmentGroup slice, so
    // a cross-farm order is attributed to each participating farm by its own
    // slice subtotal — never exposing another farm's line items.
    const groups = await db.fulfilmentGroup.findMany({
      where: {
        order: { is: orderWhere(filters, null, CONFIRMED_STATUSES) },
      },
      select: { farmId: true, subtotalCents: true },
    });
    const resGroups = await db.fulfilmentGroup.findMany({
      where: {
        order: { is: orderWhere(filters, null, RESERVATION_STATUSES) },
      },
      select: { farmId: true },
    });
    const byFarm = new Map<string, { revenue: number; reservations: number }>();
    for (const g of groups) {
      const b = byFarm.get(g.farmId) ?? { revenue: 0, reservations: 0 };
      b.revenue += g.subtotalCents;
      byFarm.set(g.farmId, b);
    }
    for (const g of resGroups) {
      const b = byFarm.get(g.farmId) ?? { revenue: 0, reservations: 0 };
      b.reservations += 1;
      byFarm.set(g.farmId, b);
    }
    const farmName = new Map(farms.map((f) => [f.id, f.name]));
    multiFarm.revenueByFarm = [...byFarm.entries()]
      .filter(([id]) => farmName.has(id))
      .map(([id, v]) => ({
        farmId: id,
        farmName: farmName.get(id) ?? id,
        revenueCents: v.revenue,
        reservations: v.reservations,
      }))
      .sort((a, b) => b.revenueCents - a.revenueCents);

    multiFarm.ordersAwaitingFarmConfirmation = await db.order.count({
      where: orderWhere({ ...filters, status: "reserved" }, null, [
        "reserved",
      ]),
    });

    multiFarm.lowAvailabilityOffers = await db.cycleOfferAvailability.count({
      where: { hasEligibleLot: false },
    });
  }

  return {
    scope: farmId ? "farm" : "platform",
    scopedFarmId: farmId,
    testExcluded,
    kpis,
    multiFarm,
  };
}
