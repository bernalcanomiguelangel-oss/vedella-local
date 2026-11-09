/**
 * Dashboard assembly for the two-tier analytics surface (FEAT-005). Resolves
 * the viewer's scope from their session (farm_manager → own farm only;
 * platform_admin → platform-wide, with an optional farmId drill-down), computes
 * the KPIs, builds the chart series from real DB rows, and loads the interested
 * (notify-me) list respecting farm isolation.
 *
 * Farm isolation (decision 2 / analytics-dictionary §1): a farm_manager's farmId
 * overrides any farmId filter in the URL, so a manager can never drill into
 * another farm. A platform_admin may pass any farmId to drill in; the numbers
 * match that farm's own view because both paths call computeAnalyticsMetrics
 * with the same farmId.
 */
import { prisma } from "@/lib/db";
import type { SessionUser } from "@/lib/auth";
import { visibleFarmScope } from "@/lib/auth";
import {
  computeAnalyticsMetrics,
  type AnalyticsMetrics,
  type MetricFilters,
} from "./analytics-metrics";
import { buildSeries, buildFunnelSeries, type ChartSeries } from "./chart-series";

export interface InterestedRow {
  id: string;
  email: string;
  locale: string | null;
  farmId: string | null;
  createdAt: Date;
}

export interface AnalyticsDashboard {
  metrics: AnalyticsMetrics;
  charts: {
    revenueByFarm: ChartSeries;
    reservationsByChannel: ChartSeries;
    demandByLanguage: ChartSeries;
    deliveryVsPickup: ChartSeries;
    funnel: ChartSeries;
  };
  interested: InterestedRow[];
  /** The farm the viewer is scoped/drilled to (null = platform-wide). */
  scopedFarmId: string | null;
  /** Available farms for the drill-down selector (platform_admin only). */
  farmOptions: { id: string; name: string }[];
}

function eventCountWhere(
  filters: MetricFilters,
  farmId: string | null,
  type: string,
) {
  const where: Record<string, unknown> = { type };
  if (!filters.includeTest) where.isTest = false;
  if (filters.cycleId) where.cycleId = filters.cycleId;
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
 * Resolve the farm the viewer should be scoped to.
 *  - farm_manager: ALWAYS their own farm, regardless of any farmId filter.
 *  - platform_admin: the requested farmId (drill-down) or null (platform-wide).
 */
export function resolveScopedFarm(
  user: SessionUser,
  requestedFarmId: string | null,
): string | null {
  const scope = visibleFarmScope(user);
  if (scope === null) return requestedFarmId; // platform_admin
  // farm_manager (or no-scope): pinned to their own farm.
  return scope[0] ?? "__none__";
}

export async function loadAnalyticsDashboard(
  user: SessionUser,
  filters: MetricFilters = {},
): Promise<AnalyticsDashboard> {
  const scopedFarmId = resolveScopedFarm(user, filters.farmId ?? null);
  const metrics = await computeAnalyticsMetrics(prisma, scopedFarmId, filters);

  // --- Charts from real rows. ---------------------------------------------
  // Revenue by farm (platform scope only; empty for farm-scoped viewers so a
  // farm never sees another's rows).
  const revenueByFarm = buildSeries(
    metrics.multiFarm.revenueByFarm.map((r) => ({
      label: r.farmName,
      value: r.revenueCents,
    })),
  );

  // Reservations by channel (session_started events grouped by channel).
  const channelRows = await prisma.analyticsEvent.groupBy({
    by: ["channel"],
    where: eventCountWhere(filters, scopedFarmId, "session_started"),
    _count: { _all: true },
  });
  const reservationsByChannel = buildSeries(
    channelRows
      .map((r) => ({ label: r.channel ?? "unknown", value: r._count._all }))
      .sort((a, b) => b.value - a.value),
  );

  // Demand by language (farm_list_viewed events grouped by language).
  const langRows = await prisma.analyticsEvent.groupBy({
    by: ["language"],
    where: eventCountWhere(filters, scopedFarmId, "farm_list_viewed"),
    _count: { _all: true },
  });
  const demandByLanguage = buildSeries(
    langRows.map((r) => ({ label: r.language ?? "—", value: r._count._all })),
  );

  // Delivery vs pickup (delivery_mode_selected events grouped by method).
  const deliveryRows = await prisma.analyticsEvent.groupBy({
    by: ["deliveryMethod"],
    where: eventCountWhere(filters, scopedFarmId, "delivery_mode_selected"),
    _count: { _all: true },
  });
  const deliveryVsPickup = buildSeries(
    deliveryRows.map((r) => ({
      label: r.deliveryMethod ?? "—",
      value: r._count._all,
    })),
  );

  // Conversion funnel.
  const [visits, started, completed] = await Promise.all([
    prisma.analyticsEvent.count({
      where: eventCountWhere(filters, scopedFarmId, "session_started"),
    }),
    prisma.analyticsEvent.count({
      where: eventCountWhere(filters, scopedFarmId, "reservation_started"),
    }),
    prisma.analyticsEvent.count({
      where: eventCountWhere(filters, scopedFarmId, "reservation_completed"),
    }),
  ]);
  const funnel = buildFunnelSeries({ visits, started, completed });

  // --- Interested (notify-me) list. ----------------------------------------
  // A farm_manager sees only interest attributed to their own farm. A
  // platform_admin drilling into a farm sees that farm's attributed interest;
  // platform-wide they see all. Email is the only PII and is opt-in.
  const interestedWhere: Record<string, unknown> = {};
  if (!filters.includeTest) interestedWhere.isTest = false;
  if (scopedFarmId && scopedFarmId !== "__none__") {
    interestedWhere.farmId = scopedFarmId;
  }
  const interestedRows = await prisma.interestedContact.findMany({
    where: interestedWhere,
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const interested: InterestedRow[] = interestedRows.map((r) => ({
    id: r.id,
    email: r.email,
    locale: r.locale,
    farmId: r.farmId,
    createdAt: r.createdAt,
  }));

  // Farm options for the drill-down selector (platform_admin only).
  const farmOptions =
    visibleFarmScope(user) === null
      ? (
          await prisma.farm.findMany({
            where: filters.includeTest ? {} : { isTest: false },
            select: { id: true, name: true },
            orderBy: { name: "asc" },
          })
        ).map((f) => ({ id: f.id, name: f.name }))
      : [];

  return {
    metrics,
    charts: {
      revenueByFarm,
      reservationsByChannel,
      demandByLanguage,
      deliveryVsPickup,
      funnel,
    },
    interested,
    scopedFarmId: scopedFarmId === "__none__" ? null : scopedFarmId,
    farmOptions,
  };
}
