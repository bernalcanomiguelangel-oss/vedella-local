/**
 * Weekly metrics use case (R25): the average market price per cut across the
 * market, bucketed by ISO week.
 *
 * The AVERAGES are computed deterministically from the database — never invented
 * by a model (ai-guardrails: AI must never set prices). The model/mock only
 * phrases a neutral headline over the already-computed numbers.
 *
 * Exclusions (R15): records marked `isTest` are excluded; only approved + active
 * products on approved + active farms with a non-withdrawn, in-stock lot in the
 * target week count toward the average.
 *
 * Side effect: one `MarketPriceSnapshot` row per (cutName, weekStart) is upserted.
 */
import { prisma } from "@/lib/db";
import { getAiProvider } from "./provider";
import { MetricsSummarySchema, type MetricsSummary } from "./schemas";
import { scanMetricsForWtpProxy } from "./guardrails";
import { recordAiRun } from "./audit";
import { isoWeekStart, isoWeekStartKey } from "./isoWeek";

export interface PerCutAverage {
  cutName: string;
  avgPriceCents: number;
  sampleCount: number;
}

/**
 * Compute the average price per cut across the market for the ISO week that
 * contains `reference`. A "sample" is an offered cut product (one per farm) whose
 * lot was PACKED within that ISO week. Test records are excluded.
 *
 * Averaging prices across farms is a read-only market observation, not a price
 * the app sets on any product.
 */
export async function computeWeeklyAverages(
  reference: Date = new Date(),
): Promise<{ weekStart: Date; perCut: PerCutAverage[] }> {
  const weekStart = isoWeekStart(reference);
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekStart.getUTCDate() + 7);

  // Candidate cut products: approved + active, non-test, on approved+active,
  // non-test farms, with at least one usable lot packed inside the ISO week.
  const products = await prisma.product.findMany({
    where: {
      kind: "cut",
      isApproved: true,
      isActive: true,
      isTest: false,
      farm: { isApproved: true, isActive: true, isTest: false },
    },
    include: {
      lots: true,
    },
  });

  // Group by cut NAME across farms (the "market" price for that cut).
  const byName = new Map<string, { sum: number; count: number }>();

  for (const p of products) {
    const usableInWeek = p.lots.some(
      (l) =>
        !l.isWithdrawn &&
        !l.isTest &&
        l.units > 0 &&
        l.packingDate >= weekStart &&
        l.packingDate < weekEnd,
    );
    if (!usableInWeek) continue;
    const bucket = byName.get(p.name) ?? { sum: 0, count: 0 };
    bucket.sum += p.basePriceCents;
    bucket.count += 1;
    byName.set(p.name, bucket);
  }

  const perCut: PerCutAverage[] = [...byName.entries()]
    .map(([cutName, { sum, count }]) => ({
      cutName,
      avgPriceCents: Math.round(sum / count),
      sampleCount: count,
    }))
    .sort((a, b) => a.cutName.localeCompare(b.cutName));

  return { weekStart, perCut };
}

export interface WeeklyMetricsResult {
  weekStart: string;
  perCut: PerCutAverage[];
  summary: MetricsSummary;
  outcome: "ok" | "invalid" | "error";
}

/**
 * Run the weekly metric: compute averages, persist snapshots, and produce a
 * human-readable summary via the provider (mock when no key). Always audits.
 */
export async function runWeeklyMetrics(
  reference: Date = new Date(),
): Promise<WeeklyMetricsResult> {
  const { weekStart, perCut } = await computeWeeklyAverages(reference);
  const weekStartKey = isoWeekStartKey(weekStart);

  const { provider, flagEnabled, isReal } = await getAiProvider("metrics");

  // Persist a snapshot per cut for the week (upsert so re-running is idempotent).
  for (const c of perCut) {
    await prisma.marketPriceSnapshot.upsert({
      where: { cutName_weekStart: { cutName: c.cutName, weekStart } },
      create: {
        cutName: c.cutName,
        weekStart,
        avgPriceCents: c.avgPriceCents,
        sampleCount: c.sampleCount,
        generatedBy: isReal ? "openai" : "mock",
      },
      update: {
        avgPriceCents: c.avgPriceCents,
        sampleCount: c.sampleCount,
        generatedBy: isReal ? "openai" : "mock",
      },
    });
  }

  let outcome: WeeklyMetricsResult["outcome"] = "ok";
  let outputValid = false;
  let summary: MetricsSummary = {
    weekStart: weekStartKey,
    headline: `Week of ${weekStartKey}: ${perCut.length} cuts tracked.`,
    perCut,
  };

  try {
    const raw = await provider.summarizeMetrics({
      weekStart: weekStartKey,
      perCut,
    });
    const parsed = MetricsSummarySchema.safeParse(raw);
    if (!parsed.success) {
      outcome = "invalid";
    } else if (scanMetricsForWtpProxy([parsed.data.headline])) {
      // Guardrail: a summary must never introduce willingness-to-pay language.
      outcome = "invalid";
    } else {
      outputValid = true;
      // Trust ONLY the server-computed numbers; take the headline text from the
      // model but keep our own perCut averages (the model can't change numbers).
      summary = {
        weekStart: weekStartKey,
        headline: parsed.data.headline,
        perCut,
      };
    }
  } catch (err) {
    outcome = "error";
    console.error(
      "[ai-metrics] provider error:",
      err instanceof Error ? err.message : "unknown error",
    );
  }

  await recordAiRun({
    useCase: "metrics",
    provider: provider.name,
    model: provider.model,
    promptVersion: provider.promptVersion,
    flagEnabled,
    inputRef: `week:${weekStartKey}`,
    outputValid,
    outcome,
  });

  return { weekStart: weekStartKey, perCut, summary, outcome };
}
