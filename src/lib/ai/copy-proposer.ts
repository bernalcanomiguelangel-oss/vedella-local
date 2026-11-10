/**
 * AI copy PROPOSER service (FEAT-004, blob/gemini task).
 *
 * `proposeCopyVariants` drafts alternative product descriptions for one offer +
 * locale, grounded ONLY in that offer's real structured facts. It:
 *   1. resolves the offer's facts from the DB (name, definition canonical name,
 *      observed weight/maturation/packaging/storage/shelf-life). The price is
 *      passed as READ-ONLY context ONLY and is never a field the AI may set;
 *   2. fetches the most recent accumulated HumanDecisionExample few-shots
 *      (own-farm + platform-wide, same locale) and injects them into the
 *      proposer prompt — this is the "learning" (accumulated EXAMPLES, not model
 *      training);
 *   3. calls the resolved AiProvider (mock offline / gemini or openai when a key
 *      is present and the flag is on) to draft `count` variants;
 *   4. runs the output through applyGuardrails (strips any price/approval/status/
 *      role field at any depth) and re-validates;
 *   5. persists each surviving variant as a CopyVariant (source='ai',
 *      status='draft', farmId from the offer) and writes an AiRun audit row.
 *
 * The AI NEVER sets a price, NEVER approves/publishes, NEVER flips status: new
 * variants are always status='draft' and a human decides everything downstream.
 */
import { prisma } from "@/lib/db";
import type { Locale } from "@/lib/i18n";
import { getAiProvider } from "./provider";
import { CopyProposalSchema, type CopyProposal } from "./schemas";
import { applyGuardrails } from "./guardrails";
import { recordAiRun } from "./audit";
import { fetchDecisionExamples } from "./copy-examples";

export interface ProposeCopyVariantsInput {
  offerId: string;
  locale: Locale;
  /** How many variants to draft (default 2). */
  count?: number;
}

export interface ProposeCopyVariantsResult {
  ok: boolean;
  code?: string;
  outcome: "ok" | "invalid" | "error" | "not_found";
  /** The ids of the persisted CopyVariant rows (source='ai', status='draft'). */
  variantIds: string[];
  /** Fields the guardrail stripped from the model output, for the audit trail. */
  strippedFields: string[];
  aiRunId: string | null;
}

/**
 * Resolve the offer's REAL structured facts. The price is included ONLY under a
 * clearly read-only key so a human reviewer sees context; the AI prompt builder
 * and the guardrail filter both ensure the AI can never set it.
 */
function resolveOfferFacts(offer: {
  publicName: string;
  description: string;
  priceAmountCents: number;
  priceUnit: string;
  currency: string;
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
    // READ-ONLY context for the human reviewer; the AI must never set a price.
    // The key name deliberately avoids triggering the guardrail's price-field
    // stripping of the FACTS we send (facts are context, not AI output), while
    // the AI OUTPUT is still fully guardrailed below.
    priceContextReadOnly: `${(offer.priceAmountCents / 100).toFixed(2)} ${offer.currency}/${offer.priceUnit}`,
  };
}

export async function proposeCopyVariants(
  input: ProposeCopyVariantsInput,
): Promise<ProposeCopyVariantsResult> {
  const count = Math.min(Math.max(input.count ?? 2, 1), 5);

  const offer = await prisma.farmProductOffer.findUnique({
    where: { id: input.offerId },
    include: { productDefinition: true },
  });
  if (!offer) {
    return {
      ok: false,
      code: "NOT_FOUND",
      outcome: "not_found",
      variantIds: [],
      strippedFields: [],
      aiRunId: null,
    };
  }

  const facts = resolveOfferFacts(offer);
  const inputRef = `offer:${offer.id}:${input.locale}`;

  // Accumulated human-decision few-shots (the "learning" substrate). Scoped to
  // this farm + locale with a platform-wide fallback; never another farm's rows.
  const humanExamples = await fetchDecisionExamples({
    farmId: offer.farmId,
    locale: input.locale,
  });

  let outcome: "ok" | "invalid" | "error" = "ok";
  let outputValid = false;
  let proposal: CopyProposal | null = null;
  let strippedFields: string[] = [];
  let providerName = "mock";
  let model = "mock-deterministic-v1";
  let promptVersion = "mock-1";
  let flagEnabled = false;

  try {
    const resolved = await getAiProvider("farmProfileDraft");
    providerName = resolved.provider.name;
    model = resolved.provider.model;
    promptVersion = resolved.provider.promptVersion;
    flagEnabled = resolved.flagEnabled;

    const raw = await resolved.provider.proposeCopy({
      facts,
      locale: input.locale,
      count,
      inputRef,
      humanExamples,
    });

    // Defence in depth: strict Zod parse THEN guardrail stripping THEN re-parse.
    const parsed = CopyProposalSchema.safeParse(raw);
    if (!parsed.success) {
      outcome = "invalid";
    } else {
      outputValid = true;
      const { value: safe, report } = applyGuardrails(parsed.data);
      strippedFields = report.strippedFields;
      const revalidated = CopyProposalSchema.safeParse(safe);
      proposal = revalidated.success ? revalidated.data : parsed.data;
    }
  } catch (err) {
    outcome = "error";
    console.error(
      "[copy-proposer] provider error:",
      err instanceof Error ? err.message : "unknown error",
    );
  }

  const aiRunId = await recordAiRun({
    // Reuse the farmProfileDraft use case label (copy drafting is a draft-only
    // assistant). Its feature flag gates whether the REAL provider is used.
    useCase: "farmProfileDraft",
    provider: providerName,
    model,
    promptVersion,
    flagEnabled,
    inputRef,
    outputValid,
    outcome,
  });

  const variantIds: string[] = [];
  if (proposal) {
    for (const v of proposal.variants) {
      const row = await prisma.copyVariant.create({
        data: {
          farmProductOfferId: offer.id,
          farmId: offer.farmId, // isolation: owning farm
          locale: input.locale,
          text: v.text,
          source: "ai",
          status: "draft", // AI NEVER sets a non-draft status
          evidenceJson: JSON.stringify(v.evidence ?? []),
          aiRunId: aiRunId ?? undefined,
        },
      });
      variantIds.push(row.id);
    }
  }

  return {
    ok: outcome === "ok" && variantIds.length > 0,
    outcome,
    variantIds,
    strippedFields,
    aiRunId,
  };
}
