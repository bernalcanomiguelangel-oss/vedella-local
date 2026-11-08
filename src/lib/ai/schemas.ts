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
