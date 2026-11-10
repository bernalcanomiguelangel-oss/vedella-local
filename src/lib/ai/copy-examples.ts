/**
 * Accumulated human-decision few-shot store access (FEAT-004).
 *
 * This is the "learning" substrate for the A/B-testing copy loop. It is NOT a
 * model being trained: it is a query over the HumanDecisionExample table that
 * returns the most recent real human decisions, scoped to a farm+locale with a
 * fallback to platform-wide/locale examples. The caller injects the returned
 * rows as in-context few-shots into BOTH the proposer and the judge prompts, so
 * the AI's criterion tracks the human's over time by ACCUMULATED EXAMPLES only.
 */
import { prisma } from "@/lib/db";
import type { CopyDecisionExample } from "./provider";

/** Default number of few-shot examples to replay into a prompt. */
export const DEFAULT_FEWSHOT_LIMIT = 8;

/**
 * Fetch the most recent human-decision examples to replay as few-shots.
 *
 * Scoping (so a farm learns from its own history first, then the platform's):
 *  - rows for this exact farm (farmId) are preferred;
 *  - rows with no farm (platform-wide, farmId null) are included as fallback;
 *  - locale is matched when a row has a locale, but rows with a null locale
 *    (apply to all locales) are always eligible.
 *
 * Farm isolation: a farm's own rows are only its own farmId or platform-wide
 * (null) rows — it can NEVER see another farm's decisions.
 */
export async function fetchDecisionExamples(opts: {
  farmId: string | null;
  locale: string;
  limit?: number;
}): Promise<CopyDecisionExample[]> {
  const limit = opts.limit ?? DEFAULT_FEWSHOT_LIMIT;
  const rows = await prisma.humanDecisionExample.findMany({
    where: {
      // Own-farm OR platform-wide (null). Never another farm's rows.
      AND: [
        { OR: [{ farmId: opts.farmId }, { farmId: null }] },
        { OR: [{ locale: opts.locale }, { locale: null }] },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map((r) => ({
    offerContext: r.offerContext,
    variantText: r.variantText,
    verdict: r.verdict,
    reason: r.reason,
    editedText: r.editedText,
  }));
}
