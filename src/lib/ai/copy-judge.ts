/**
 * LLM-as-JUDGE service for product-description variants (FEAT-004, blob/gemini
 * task).
 *
 * `judgeCopyVariant` loads a CopyVariant, the active JudgeRules (own-farm +
 * platform-wide), and the most recent accumulated HumanDecisionExample
 * few-shots (same scoping as the proposer), then asks the resolved AiProvider to
 * score the variant PASS / FAIL / UNKNOWN with a reason. It:
 *   - fences the variant text as UNTRUSTED data and presents the human-authored
 *     rules + accumulated examples as the criterion (copy-prompts.ts);
 *   - validates the verdict with JudgeVerdictSchema; on invalid/empty output it
 *     falls back to the SAFE verdict UNKNOWN (never crashes);
 *   - persists a JudgeEvaluation row + an AiRun audit row.
 *
 * LEARNING NOTE: the judge "learns" ONLY by the accumulated HumanDecisionExample
 * few-shots replayed into its prompt. No model is trained or fine-tuned here;
 * the weights never change. The criterion evolves solely because the auditable
 * table of real human decisions grows and is replayed in-context. The judge is
 * advisory: it NEVER changes the variant's status or any price.
 */
import { prisma } from "@/lib/db";
import type { Locale } from "@/lib/i18n";
import { getAiProvider } from "./provider";
import { JudgeVerdictSchema, type JudgeVerdict } from "./schemas";
import { applyGuardrails } from "./guardrails";
import { recordAiRun } from "./audit";
import { fetchDecisionExamples } from "./copy-examples";

export interface JudgeCopyVariantInput {
  copyVariantId: string;
}

export interface JudgeCopyVariantResult {
  ok: boolean;
  code?: string;
  verdict: JudgeVerdict["verdict"];
  reason: string;
  evaluationId: string | null;
  aiRunId: string | null;
}

/** Resolve the facts the variant must stay grounded in (mirror of proposer). */
function offerFacts(offer: {
  publicName: string;
  expectedUnitWeightMinG: number | null;
  expectedUnitWeightMaxG: number | null;
  unitsPerPack: number | null;
  thicknessMm: number | null;
  maturationDays: number | null;
  packagingMethod: string | null;
  storageState: string | null;
  minimumShelfLifeDays: number | null;
  productDefinition: { canonicalName: string } | null;
}): Record<string, string | number | null> {
  return {
    publicName: offer.publicName,
    canonicalName: offer.productDefinition?.canonicalName ?? null,
    expectedUnitWeightMinG: offer.expectedUnitWeightMinG,
    expectedUnitWeightMaxG: offer.expectedUnitWeightMaxG,
    unitsPerPack: offer.unitsPerPack,
    thicknessMm: offer.thicknessMm,
    maturationDays: offer.maturationDays,
    packagingMethod: offer.packagingMethod,
    storageState: offer.storageState,
    minimumShelfLifeDays: offer.minimumShelfLifeDays,
  };
}

export async function judgeCopyVariant(
  input: JudgeCopyVariantInput,
): Promise<JudgeCopyVariantResult> {
  const variant = await prisma.copyVariant.findUnique({
    where: { id: input.copyVariantId },
    include: { offer: { include: { productDefinition: true } } },
  });
  if (!variant) {
    return {
      ok: false,
      code: "NOT_FOUND",
      verdict: "UNKNOWN",
      reason: "Variant not found.",
      evaluationId: null,
      aiRunId: null,
    };
  }

  const locale = variant.locale as Locale;
  const facts = offerFacts(variant.offer);
  const inputRef = `copyVariant:${variant.id}`;

  // Active human-authored rules: own-farm + platform-wide (farmId null), scoped
  // to this locale or locale-agnostic (locale null). Farm A never sees farm B's.
  const ruleRows = await prisma.judgeRule.findMany({
    where: {
      isActive: true,
      AND: [
        { OR: [{ farmId: variant.farmId }, { farmId: null }] },
        { OR: [{ locale }, { locale: null }] },
      ],
    },
    orderBy: { createdAt: "asc" },
  });
  const rules = ruleRows.map((r) => r.ruleText);

  // Accumulated human-decision few-shots (the "learning" substrate).
  const humanExamples = await fetchDecisionExamples({
    farmId: variant.farmId,
    locale,
  });

  // UNKNOWN is the safe default used on any invalid/empty/error outcome.
  let verdict: JudgeVerdict = { verdict: "UNKNOWN", reason: "" };
  let outputValid = false;
  let outcome: "ok" | "invalid" | "error" = "ok";
  let providerName = "mock";
  let model = "mock-deterministic-v1";
  let promptVersion = "mock-1";
  let flagEnabled = false;

  try {
    const resolved = await getAiProvider("copyAbTesting");
    providerName = resolved.provider.name;
    model = resolved.provider.model;
    promptVersion = resolved.provider.promptVersion;
    flagEnabled = resolved.flagEnabled;

    const raw = await resolved.provider.judgeCopy({
      variantText: variant.text,
      locale,
      facts,
      rules,
      humanExamples,
      inputRef,
    });

    const { value: safe } = applyGuardrails(raw);
    const parsed = JudgeVerdictSchema.safeParse(safe);
    if (parsed.success) {
      outputValid = true;
      verdict = parsed.data;
    } else {
      // Invalid output -> SAFE fallback to UNKNOWN.
      outcome = "invalid";
      verdict = { verdict: "UNKNOWN", reason: "Invalid judge output; defaulting to UNKNOWN." };
    }
  } catch (err) {
    outcome = "error";
    verdict = { verdict: "UNKNOWN", reason: "Judge error; defaulting to UNKNOWN." };
    console.error(
      "[copy-judge] provider error:",
      err instanceof Error ? err.message : "unknown error",
    );
  }

  const aiRunId = await recordAiRun({
    // Dedicated A/B-testing use case (its own feature flag + honest audit label).
    useCase: "copyAbTesting",
    provider: providerName,
    model,
    promptVersion,
    flagEnabled,
    inputRef,
    outputValid,
    outcome,
  });

  const evaluation = await prisma.judgeEvaluation.create({
    data: {
      copyVariantId: variant.id,
      verdict: verdict.verdict,
      reason: verdict.reason,
      promptVersion,
      model,
      aiRunId: aiRunId ?? undefined,
    },
  });

  return {
    ok: outcome === "ok",
    verdict: verdict.verdict,
    reason: verdict.reason,
    evaluationId: evaluation.id,
    aiRunId,
  };
}
