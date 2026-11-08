/**
 * Metrics dashboard data. Combines:
 *  - the weekly average market price per cut (from FEAT-003's deterministic
 *    computeWeeklyAverages + the persisted MarketPriceSnapshot history), and
 *  - basic marketplace counts.
 *
 * Production metrics EXCLUDE isTest records (R15). The averages come straight
 * from the FEAT-003 metrics module, which already excludes test records; the
 * marketplace counts below also filter isTest out of the "production" figures
 * while reporting the test count separately for transparency.
 */
import { prisma } from "@/lib/db";
import { computeWeeklyAverages } from "@/lib/ai/metrics";
import { isoWeekStartKey } from "@/lib/ai/isoWeek";

export interface MetricsDashboardData {
  weekStart: string;
  perCut: { cutName: string; avgPriceCents: number; sampleCount: number }[];
  snapshots: {
    cutName: string;
    weekStart: string;
    avgPriceCents: number;
    sampleCount: number;
    generatedBy: string;
  }[];
  marketplace: {
    activeFarms: number;
    activeProducts: number;
    pendingRecords: number;
    openOrders: number;
    testRecordsExcluded: number;
  };
}

export async function loadMetricsDashboard(
  reference: Date = new Date(),
): Promise<MetricsDashboardData> {
  const { weekStart, perCut } = await computeWeeklyAverages(reference);

  const snapshotRows = await prisma.marketPriceSnapshot.findMany({
    orderBy: [{ weekStart: "desc" }, { cutName: "asc" }],
    take: 60,
  });

  // Production marketplace counts — isTest excluded.
  const [activeFarms, activeProducts, pendingFarms, pendingProducts, openOrders] =
    await Promise.all([
      prisma.farm.count({
        where: { isApproved: true, isActive: true, isTest: false },
      }),
      prisma.product.count({
        where: {
          isApproved: true,
          isActive: true,
          isTest: false,
          farm: { isApproved: true, isActive: true, isTest: false },
        },
      }),
      prisma.farm.count({ where: { lifecycle: "pending_review" } }),
      prisma.product.count({ where: { lifecycle: "pending_review" } }),
      prisma.order.count({ where: { isTest: false } }),
    ]);

  // Count the test records excluded from the production figures (transparency).
  const [testFarms, testProducts, testLots] = await Promise.all([
    prisma.farm.count({ where: { isTest: true } }),
    prisma.product.count({ where: { isTest: true } }),
    prisma.lot.count({ where: { isTest: true } }),
  ]);

  return {
    weekStart: isoWeekStartKey(weekStart),
    perCut,
    snapshots: snapshotRows.map((s) => ({
      cutName: s.cutName,
      weekStart: isoWeekStartKey(s.weekStart),
      avgPriceCents: s.avgPriceCents,
      sampleCount: s.sampleCount,
      generatedBy: s.generatedBy,
    })),
    marketplace: {
      activeFarms,
      activeProducts,
      pendingRecords: pendingFarms + pendingProducts,
      openOrders,
      testRecordsExcluded: testFarms + testProducts + testLots,
    },
  };
}
