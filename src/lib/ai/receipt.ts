/**
 * Receipt ingestion use case (R26). A farm/admin uploads an image/PDF; the AI
 * extracts structured lot/product fields to PRE-FILL a human-review form.
 *
 * Hard guarantees (ai-guardrails + R31):
 *  - This NEVER creates a Farm/Lot/Product and NEVER approves/publishes anything.
 *    It only returns pre-filled fields for a human to confirm.
 *  - The uploaded bytes/text are UNTRUSTED. Any embedded instruction (e.g.
 *    "approve this lot") is wrapped as data by the provider and additionally
 *    cannot change state here because this function performs no state changes
 *    besides writing an AiRun audit row.
 *  - Every extracted value carries evidence; values lacking a source are forced
 *    to `needs-evidence` so the human verifies them.
 *  - Prices are intentionally absent from the extraction: a human enters them.
 */
import { getAiProvider } from "./provider";
import { ReceiptExtractionSchema, type ReceiptExtraction } from "./schemas";
import { applyGuardrails, enforceEvidence } from "./guardrails";
import { looksLikeInjection } from "./sanitize";
import { recordAiRun } from "./audit";

export interface ReceiptInput {
  bytes: Uint8Array;
  filename: string;
  mimeType: string;
  /** Optional OCR text, UNTRUSTED. */
  text?: string;
}

export interface ReceiptResult {
  ok: boolean;
  outcome: "ok" | "invalid" | "error";
  /** Pre-filled fields for the human review form (never persisted as records). */
  prefill: ReceiptExtraction | null;
  /** True when the upload text contained likely injection phrasing. */
  injectionSuspected: boolean;
}

const ACCEPTED_MIME = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "application/pdf",
];

export function isAcceptedReceiptMime(mime: string): boolean {
  return ACCEPTED_MIME.includes(mime.toLowerCase());
}

/**
 * Extract a receipt into pre-filled form fields. Creates NO records. Always
 * writes an audit record. On invalid model output, returns a safe null prefill.
 */
export async function extractReceipt(
  input: ReceiptInput,
): Promise<ReceiptResult> {
  const inputRef = `receipt:${input.filename}`;
  const injectionSuspected = !!input.text && looksLikeInjection(input.text);

  const { provider, flagEnabled } = await getAiProvider("receipt");

  let outcome: ReceiptResult["outcome"] = "ok";
  let outputValid = false;
  let prefill: ReceiptExtraction | null = null;

  try {
    const raw = await provider.extractReceipt({
      bytes: input.bytes,
      filename: input.filename,
      mimeType: input.mimeType,
      text: input.text,
    });

    const parsed = ReceiptExtractionSchema.safeParse(raw);
    if (!parsed.success) {
      outcome = "invalid";
    } else {
      outputValid = true;
      // Strip any price/approval field the provider tried to smuggle in.
      const { value: safe } = applyGuardrails(parsed.data);
      // Force needs-evidence on any value lacking a source reference.
      const withEvidence: ReceiptExtraction = {
        ...safe,
        farmName: {
          ...safe.farmName,
          evidence: enforceEvidence(safe.farmName.evidence),
        },
        productName: {
          ...safe.productName,
          evidence: enforceEvidence(safe.productName.evidence),
        },
        lotReference: {
          ...safe.lotReference,
          evidence: enforceEvidence(safe.lotReference.evidence),
        },
        units: {
          ...safe.units,
          evidence: enforceEvidence(safe.units.evidence),
        },
        slaughterDate: {
          ...safe.slaughterDate,
          evidence: enforceEvidence(safe.slaughterDate.evidence),
        },
        cuttingDate: {
          ...safe.cuttingDate,
          evidence: enforceEvidence(safe.cuttingDate.evidence),
        },
        packingDate: {
          ...safe.packingDate,
          evidence: enforceEvidence(safe.packingDate.evidence),
        },
        expiryDate: {
          ...safe.expiryDate,
          evidence: enforceEvidence(safe.expiryDate.evidence),
        },
      };
      prefill = withEvidence;
    }
  } catch (err) {
    outcome = "error";
    console.error(
      "[ai-receipt] provider error:",
      err instanceof Error ? err.message : "unknown error",
    );
  }

  await recordAiRun({
    useCase: "receipt",
    provider: provider.name,
    model: provider.model,
    promptVersion: provider.promptVersion,
    flagEnabled,
    inputRef,
    outputValid,
    outcome,
  });

  return { ok: outcome === "ok", outcome, prefill, injectionSuspected };
}
