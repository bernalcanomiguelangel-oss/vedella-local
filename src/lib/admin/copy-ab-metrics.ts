/**
 * A/B copy-testing metrics + judge-vs-human agreement (FEAT-005).
 *
 * HONESTY RULES (hard requirements, covered by tests):
 *   - Raw counts only. We report per-variant IMPRESSIONS (denominator =
 *     impressed sessions) and CONVERSIONS (numerator = converted sessions) plus
 *     the derived rate. We NEVER claim statistical significance.
 *   - A `sampleTooSmall` flag is raised when either variant has fewer than the
 *     project's existing small-sample threshold (20) of impressions. A tiny
 *     sample is explicitly warned about, never dressed up as a result.
 *   - Test records are EXCLUDED by default, reusing the same `isTest=false`
 *     filter pattern as src/lib/admin/analytics-metrics.ts.
 *   - Farm isolation: the caller passes the owning farmId; a farm only ever sees
 *     its own offers' variants (enforced here by filtering on CopyVariant.farmId
 *     and by the server-action auth above this layer).
 *
 * The JUDGE-vs-HUMAN agreement is reported as TWO SEPARATE counts and is NEVER
 * collapsed into a single accuracy number:
 *   - failuresCaught : judge said FAIL and the human also rejected/edited.
 *   - passesAgreed   : judge said PASS and the human approved.
 * Collapsing these into one "accuracy" figure hides whether the judge is good at
 * catching bad copy vs. agreeing on good copy, so we keep them apart on purpose.
 *
 * Determinism: every number comes from real DB rows. AI computes nothing here.
 */
import type { PrismaClient } from "@prisma/client";
import { SMALL_SAMPLE_THRESHOLD } from "./analytics-metrics";

export { SMALL_SAMPLE_THRESHOLD };

/** Per-variant raw A/B counts with the numerator/denominator NAMED. */
export interface VariantConversion {
  copyVariantId: string;
  arm: "A" | "B";
  text: string;
  status: string;
  /** Denominator: distinct sessions that were SHOWN this variant. */
  impressedSessions: number;
  /** Numerator: distinct impressed sessions that then CONVERTED. */
  convertedSessions: number;
  /** convertedSessions / impressedSessions, or 0 when no impressions. */
  conversionRate: number;
}

export interface ExperimentMetrics {
  experimentId: string;
  offerId: string;
  farmId: string;
  locale: string;
  status: string;
  variantA: VariantConversion;
  variantB: VariantConversion;
  /** Named so the UI can label the fraction explicitly. */
  numeratorLabel: "convertedSessions";
  denominatorLabel: "impressedSessions";
  /** True when EITHER arm has fewer impressions than the threshold. */
  sampleTooSmall: boolean;
  /** The threshold used, surfaced so the UI can state it. */
  smallSampleThreshold: number;
  /** We never compute significance; this flag documents that explicitly. */
  significanceClaimed: false;
}

/**
 * Compute conversion by JOINING impressed sessions to conversion events — the
 * simplest honest approach. A session COUNTS as converted for a variant when it
 * was shown that variant (`copy_variant_impression`) AND later fired a
 * `copy_variant_converted` event for the same variant. Both numbers are distinct
 * SESSION counts (not raw event rows), so repeated impressions/visits don't
 * inflate the figures.
 *
 * @param db     Prisma client.
 * @param farmId The owning farm (isolation). Only experiments for this farm are
 *               computed. A platform_admin may pass any farmId to drill in.
 */
export async function computeExperimentMetrics(
  db: PrismaClient,
  experimentId: string,
  farmId: string,
  opts: { includeTest?: boolean } = {},
): Promise<ExperimentMetrics | null> {
  const exp = await db.copyExperiment.findFirst({
    where: { id: experimentId, farmId },
    include: { variantA: true, variantB: true },
  });
  if (!exp || !exp.variantA || !exp.variantB) return null;

  const includeTest = opts.includeTest ?? false;

  async function countsFor(copyVariantId: string): Promise<{
    impressed: number;
    converted: number;
  }> {
    const testFilter = includeTest ? {} : { isTest: false };
    const [impressions, conversions] = await Promise.all([
      db.analyticsEvent.findMany({
        where: { type: "copy_variant_impression", copyVariantId, ...testFilter },
        select: { anonSessionId: true },
      }),
      db.analyticsEvent.findMany({
        where: { type: "copy_variant_converted", copyVariantId, ...testFilter },
        select: { anonSessionId: true },
      }),
    ]);
    const impressedSet = new Set(impressions.map((r) => r.anonSessionId));
    // A conversion only counts when the session was actually impressed on this
    // variant (honest attribution: no conversion without a prior impression).
    const convertedSet = new Set(
      conversions
        .map((r) => r.anonSessionId)
        .filter((s) => impressedSet.has(s)),
    );
    return { impressed: impressedSet.size, converted: convertedSet.size };
  }

  const [aCounts, bCounts] = await Promise.all([
    countsFor(exp.variantAId),
    countsFor(exp.variantBId),
  ]);

  const toVariant = (
    id: string,
    arm: "A" | "B",
    text: string,
    status: string,
    c: { impressed: number; converted: number },
  ): VariantConversion => ({
    copyVariantId: id,
    arm,
    text,
    status,
    impressedSessions: c.impressed,
    convertedSessions: c.converted,
    conversionRate: c.impressed > 0 ? c.converted / c.impressed : 0,
  });

  const variantA = toVariant(
    exp.variantAId,
    "A",
    exp.variantA.text,
    exp.variantA.status,
    aCounts,
  );
  const variantB = toVariant(
    exp.variantBId,
    "B",
    exp.variantB.text,
    exp.variantB.status,
    bCounts,
  );

  return {
    experimentId: exp.id,
    offerId: exp.farmProductOfferId,
    farmId: exp.farmId,
    locale: exp.locale,
    status: exp.status,
    variantA,
    variantB,
    numeratorLabel: "convertedSessions",
    denominatorLabel: "impressedSessions",
    sampleTooSmall:
      variantA.impressedSessions < SMALL_SAMPLE_THRESHOLD ||
      variantB.impressedSessions < SMALL_SAMPLE_THRESHOLD,
    smallSampleThreshold: SMALL_SAMPLE_THRESHOLD,
    significanceClaimed: false,
  };
}

/**
 * Judge-vs-human agreement, reported as TWO SEPARATE counts (never summed into a
 * single accuracy figure). For each variant that both the judge evaluated AND a
 * human decided:
 *   - judge FAIL + human reject/edit  -> a "failure caught"
 *   - judge PASS + human approve       -> a "pass agreed"
 * Disagreements are also surfaced (separately) so the human can inspect them;
 * they are NOT folded into either agreement count.
 *
 * We match a judge evaluation to a human decision by the STABLE
 * HumanDecisionExample.copyVariantId (the id of the CopyVariant the human
 * decided on), NOT by variant text. An 'edit' decision replaces the variant's
 * text while the example keeps the pre-edit snapshot, so a text join would
 * silently drop edited variants — exactly the most interesting disagreement
 * signal. Joining on the id keeps them counted and removes the text-collision
 * risk where two variants share identical text. This keeps the data auditable
 * without inventing a score.
 */
export interface JudgeAgreementSummary {
  /** Judge said FAIL and the human rejected/edited. */
  failuresCaught: number;
  /** Judge said PASS and the human approved. */
  passesAgreed: number;
  /** Judge FAIL but the human approved (judge was too harsh). */
  disagreementsJudgeFailHumanApprove: number;
  /** Judge PASS but the human rejected/edited (judge missed a problem). */
  disagreementsJudgePassHumanReject: number;
  /** Variants evaluated by the judge AND decided by a human (the match set). */
  comparedPairs: number;
  /**
   * EXPLICIT honesty marker: these counts are NEVER combined into one accuracy
   * number. The UI must render failuresCaught and passesAgreed separately.
   */
  collapsedToSingleAccuracy: false;
}

export async function computeJudgeAgreement(
  db: PrismaClient,
  farmId: string,
  opts: { locale?: string | null } = {},
): Promise<JudgeAgreementSummary> {
  // Latest judge verdict per variant for this farm.
  const variants = await db.copyVariant.findMany({
    where: {
      farmId,
      ...(opts.locale ? { locale: opts.locale } : {}),
    },
    include: { evaluations: { orderBy: { createdAt: "desc" }, take: 1 } },
  });

  // Human decisions for this farm+locale, keyed by the STABLE copyVariantId the
  // human decided on. Edits update CopyVariant.text but the id never changes, so
  // this join keeps edited variants matched (a text join would drop them).
  const decisions = await db.humanDecisionExample.findMany({
    where: {
      farmId,
      copyVariantId: { not: null },
      ...(opts.locale ? { locale: opts.locale } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
  // Most-recent human verdict per variant id.
  const humanById = new Map<string, string>();
  for (const d of decisions) {
    if (d.copyVariantId && !humanById.has(d.copyVariantId)) {
      humanById.set(d.copyVariantId, d.verdict);
    }
  }

  let failuresCaught = 0;
  let passesAgreed = 0;
  let disagreementsJudgeFailHumanApprove = 0;
  let disagreementsJudgePassHumanReject = 0;
  let comparedPairs = 0;

  for (const v of variants) {
    const judge = v.evaluations[0]?.verdict;
    const human = humanById.get(v.id);
    if (!judge || !human) continue; // only compare when BOTH exist
    if (judge === "UNKNOWN") continue; // UNKNOWN is not an agreement signal
    comparedPairs += 1;
    const humanRejectedOrEdited = human === "reject" || human === "edit";
    const humanApproved = human === "approve";
    if (judge === "FAIL" && humanRejectedOrEdited) failuresCaught += 1;
    else if (judge === "PASS" && humanApproved) passesAgreed += 1;
    else if (judge === "FAIL" && humanApproved)
      disagreementsJudgeFailHumanApprove += 1;
    else if (judge === "PASS" && humanRejectedOrEdited)
      disagreementsJudgePassHumanReject += 1;
  }

  return {
    failuresCaught,
    passesAgreed,
    disagreementsJudgeFailHumanApprove,
    disagreementsJudgePassHumanReject,
    comparedPairs,
    collapsedToSingleAccuracy: false,
  };
}
