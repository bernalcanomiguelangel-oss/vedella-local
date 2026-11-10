/**
 * Zod schemas for every AI use case. All AI output is UNTRUSTED until it passes
 * one of these schemas (ai-guardrails: "Validate every AI response against a
 * strict schema"). A parse failure means the caller must fall back safely and
 * record an `invalid` outcome in the audit log — it must never crash.
 *
 * Note on prices/approval: these schemas deliberately do NOT model price,
 * approval or active fields for translation/metrics summaries. The guardrail
 * filter (guardrails.ts) additionally strips such fields from any object an AI
 * returns, so even a malformed/hostile payload cannot smuggle them through.
 */
import { z } from "zod";
import { LOCALES } from "@/lib/i18n";

// ---------------------------------------------------------------------------
// Translation
// ---------------------------------------------------------------------------

/**
 * A single translated field in one locale. The provider returns the translated
 * text only; status/source are assigned by the app (always `machine`), never by
 * the model, so there is no way for a model to mark its own output approved.
 */
export const TranslationItemSchema = z.object({
  locale: z.enum(LOCALES),
  text: z.string().min(1).max(5000),
});
export type TranslationItem = z.infer<typeof TranslationItemSchema>;

/** The provider returns one item per requested locale. */
export const TranslationResultSchema = z.object({
  items: z.array(TranslationItemSchema).min(1),
});
export type TranslationResult = z.infer<typeof TranslationResultSchema>;

// ---------------------------------------------------------------------------
// Receipt extraction
// ---------------------------------------------------------------------------

/**
 * A factual claim extracted from a document. Each claim MUST point at a source
 * (a field/line in the uploaded document) or be marked `needs-evidence`
 * (ai-guardrails: "Every generated factual claim must reference a source field/
 * document OR be marked needs-evidence"). The guardrail filter enforces this.
 */
export const EvidenceSchema = z.object({
  /** Where in the source document this value was read from, or null. */
  sourceRef: z.string().max(200).nullable(),
  /** True when no source backs the value and a human must verify it. */
  needsEvidence: z.boolean(),
});
export type Evidence = z.infer<typeof EvidenceSchema>;

/** A single extracted field with its value and evidence. */
function extractedString(maxLen = 200) {
  return z.object({
    value: z.string().max(maxLen).nullable(),
    evidence: EvidenceSchema,
  });
}

function extractedInt() {
  return z.object({
    value: z.number().int().nonnegative().nullable(),
    evidence: EvidenceSchema,
  });
}

/**
 * Pre-filled lot/product fields for a HUMAN review form. Dates are ISO strings
 * (unparsed) because the human confirms them; prices are intentionally NOT part
 * of this schema (AI never sets prices — a human enters them on the form).
 */
export const ReceiptExtractionSchema = z.object({
  farmName: extractedString(120),
  productName: extractedString(120),
  lotReference: extractedString(80),
  units: extractedInt(),
  slaughterDate: extractedString(40),
  cuttingDate: extractedString(40),
  packingDate: extractedString(40),
  expiryDate: extractedString(40),
  /** Free-text notes the extractor could not map to a field. */
  notes: z.string().max(2000).default(""),
});
export type ReceiptExtraction = z.infer<typeof ReceiptExtractionSchema>;

// ---------------------------------------------------------------------------
// Metrics summary
// ---------------------------------------------------------------------------

/**
 * A human-readable summary of the weekly market-price metrics. The numbers
 * themselves are computed deterministically from the database (never invented by
 * a model); the model only phrases an insight sentence. No price is SET here —
 * these are observed averages, reported read-only.
 */
export const MetricsSummarySchema = z.object({
  weekStart: z.string().min(1),
  headline: z.string().min(1).max(400),
  perCut: z
    .array(
      z.object({
        cutName: z.string().min(1).max(120),
        avgPriceCents: z.number().int().nonnegative(),
        sampleCount: z.number().int().nonnegative(),
      }),
    )
    .default([]),
});
export type MetricsSummary = z.infer<typeof MetricsSummarySchema>;

// ---------------------------------------------------------------------------
// Bounded in-panel assistants (FEAT-007, decision 7 / R-AI1/R-AI2).
//
// The five assistants ONLY draft or suggest copy/insights for a human to
// accept/edit/reject. Their schemas deliberately model NO price, approval,
// lifecycle, status or role field — and the guardrail filter additionally
// strips any such field at any depth. Every factual claim must reference a
// source field OR be marked needs-evidence.
// ---------------------------------------------------------------------------

/** A single suggested copy field a human may accept/edit/reject. */
export const SuggestedFieldSchema = z.object({
  field: z.string().min(1).max(60),
  suggestion: z.string().max(4000),
  /** Where the suggestion is grounded, or null -> needsEvidence must be true. */
  evidence: EvidenceSchema,
});
export type SuggestedField = z.infer<typeof SuggestedFieldSchema>;

/**
 * 1. farmProfileDraft — drafts storytelling/profile copy from EXISTING farm
 * facts. Never invents certifications, breeds, provenance or sustainability
 * claims; unsupported lines are marked needs-evidence.
 */
export const FarmProfileDraftSchema = z.object({
  assistant: z.literal("farmProfileDraft"),
  summary: z.string().max(600).default(""),
  fields: z.array(SuggestedFieldSchema).max(20).default([]),
  notes: z.string().max(1000).default(""),
});
export type FarmProfileDraft = z.infer<typeof FarmProfileDraftSchema>;

/**
 * 2. offerCompare — a READ-ONLY comparison of offers for the same definition
 * across farms. It reports observed facts (names/weights, and observed prices
 * as read-only context) and NEVER recommends or sets a price. Any price-like
 * field is additionally stripped by the guardrail filter.
 */
export const OfferCompareSchema = z.object({
  assistant: z.literal("offerCompare"),
  definitionName: z.string().max(120).default(""),
  headline: z.string().max(400).default(""),
  rows: z
    .array(
      z.object({
        farmName: z.string().max(120),
        offerName: z.string().max(120),
        observedWeight: z.string().max(80).nullable().default(null),
        observedMaturation: z.string().max(80).nullable().default(null),
        note: z.string().max(400).default(""),
        evidence: EvidenceSchema,
      }),
    )
    .max(50)
    .default([]),
  notes: z.string().max(1000).default(""),
});
export type OfferCompare = z.infer<typeof OfferCompareSchema>;

/**
 * 3. traceabilityReview — reviews a Farm->Lot->Offer->Pack chain for GAPS and
 * flags them for a human. It never creates/edits a traceability record; it only
 * lists findings each referencing the record it came from.
 */
export const TraceabilityReviewSchema = z.object({
  assistant: z.literal("traceabilityReview"),
  chainRef: z.string().max(200).default(""),
  findings: z
    .array(
      z.object({
        severity: z.enum(["info", "warning"]),
        message: z.string().max(400),
        evidence: EvidenceSchema,
      }),
    )
    .max(50)
    .default([]),
  complete: z.boolean().default(false),
  notes: z.string().max(1000).default(""),
});
export type TraceabilityReview = z.infer<typeof TraceabilityReviewSchema>;

/**
 * 4. metricsAnalyst — phrases a narrative over server-computed metrics. The
 * numbers are computed from the DB (never invented); the assistant only writes
 * a neutral insight sentence and optional bullet observations.
 */
export const MetricsAnalystSchema = z.object({
  assistant: z.literal("metricsAnalyst"),
  weekStart: z.string().max(40).default(""),
  headline: z.string().max(400).default(""),
  observations: z.array(z.string().max(300)).max(20).default([]),
  notes: z.string().max(1000).default(""),
});
export type MetricsAnalyst = z.infer<typeof MetricsAnalystSchema>;

/**
 * 5. cycleRecommendation — drafts NON-BINDING operational suggestions for the
 * next reservation cycle (e.g. zone/timing copy), grounded in the current
 * cycle's real facts. It never sets capacity, prices or dates — it suggests
 * text a human may use when a human creates/edits a cycle.
 */
export const CycleRecommendationSchema = z.object({
  assistant: z.literal("cycleRecommendation"),
  cycleRef: z.string().max(200).default(""),
  headline: z.string().max(400).default(""),
  suggestions: z
    .array(
      z.object({
        topic: z.string().max(80),
        suggestion: z.string().max(600),
        evidence: EvidenceSchema,
      }),
    )
    .max(20)
    .default([]),
  notes: z.string().max(1000).default(""),
});
export type CycleRecommendation = z.infer<typeof CycleRecommendationSchema>;

// ---------------------------------------------------------------------------
// A/B-testing copy proposer + LLM-as-judge (FEAT-004, blob/gemini task).
//
// The proposer DRAFTS alternative product descriptions grounded ONLY in an
// offer's real structured facts. Each variant carries `evidence` markers naming
// the facts it is grounded in (so a reviewer can audit grounding). The schema
// deliberately models NO price/approval/status field — and the guardrail filter
// additionally strips any such field at any depth. The judge returns a strict
// PASS/FAIL/UNKNOWN verdict with a reason; UNKNOWN is the SAFE fallback when the
// model output is invalid/empty.
// ---------------------------------------------------------------------------

/** One proposed description variant + the facts it is grounded in. */
export const CopyVariantProposalSchema = z.object({
  text: z.string().min(1).max(4000),
  /** Fact references this variant is grounded in (e.g. "offer.maturationDays").
   * Empty is allowed but a grounded reviewer prefers at least one marker. */
  evidence: z.array(z.string().max(200)).max(20).default([]),
});
export type CopyVariantProposal = z.infer<typeof CopyVariantProposalSchema>;

/** The proposer returns one or more candidate variants. */
export const CopyProposalSchema = z.object({
  variants: z.array(CopyVariantProposalSchema).min(1).max(10),
});
export type CopyProposal = z.infer<typeof CopyProposalSchema>;

/** A single LLM-as-judge verdict. UNKNOWN is the safe fallback. */
export const JudgeVerdictSchema = z.object({
  verdict: z.enum(["PASS", "FAIL", "UNKNOWN"]),
  reason: z.string().max(1000).default(""),
});
export type JudgeVerdict = z.infer<typeof JudgeVerdictSchema>;

/** Discriminated union of every assistant output. */
export const AssistantOutputSchema = z.discriminatedUnion("assistant", [
  FarmProfileDraftSchema,
  OfferCompareSchema,
  TraceabilityReviewSchema,
  MetricsAnalystSchema,
  CycleRecommendationSchema,
]);
export type AssistantOutput = z.infer<typeof AssistantOutputSchema>;
