/**
 * Behavioral guardrails (ai-guardrails steering, R30). Enforced in code and
 * covered by tests. These run as a POST-PROCESS filter over any object an AI
 * provider returns, BEFORE the app acts on it.
 *
 * AI MUST NEVER:
 *  - Set, personalize, or adjust prices.          -> strip price-like fields
 *  - Use a willingness-to-pay (WTP) proxy.        -> reject WTP-proxy signals
 *  - Approve or publish any record.               -> strip approval/active fields
 *  - Fabricate unsourced factual claims.          -> mark `needs-evidence`
 *
 * Translations produced by AI are stored with status `machine` and are never
 * approved by the model (that is handled where translations are persisted).
 */

/** Field-name fragments that denote a PRICE the AI must never set. */
const PRICE_FIELD_PATTERNS = [
  /price/i,
  /pricecents/i,
  /amount/i,
  /discount/i,
  /cost/i,
  /tariff/i,
  /surcharge/i,
];

/**
 * Field-name fragments that denote APPROVAL / PUBLISH / ACTIVE state.
 *
 * CONSTRAINT FOR FUTURE USE CASES: `/status/i` strips ANY field whose name
 * contains "status" at any depth. This is deliberate today (AI must never set
 * approval/translation status), but it means a future AI schema that legitimately
 * returns a field named `status` (e.g. an extraction confidence "status") would
 * have that field SILENTLY dropped by applyGuardrails. If such a use case is
 * added, rename the field (e.g. `extractionState`) or narrow this pattern — do
 * not loosen it so that approval-status fields slip through. The receipt/
 * translation/metrics schemas in schemas.ts intentionally contain no `status`
 * field for this reason.
 */
const APPROVAL_FIELD_PATTERNS = [
  /approv/i,
  /publish/i,
  /isactive/i,
  /^active$/i,
  /lifecycle/i,
  /status/i, // AI never decides status (translation status is set by the app)
  /role/i,
  /permission/i,
];

/**
 * WTP-proxy signals: using language, postcode, identity, or inferred income to
 * personalise anything. We reject output whose string values reference these
 * as a pricing/segmentation lever.
 */
const WTP_PROXY_PATTERNS = [
  /willingness[\s-]?to[\s-]?pay/i,
  /\bwtp\b/i,
  /inferred income|income bracket|income level/i,
  /\b(postcode|post code|zip code|postal code)\b.*\b(price|pay|segment|afford)\b/i,
  /charge (them )?more because/i,
  /because they (can afford|are wealthy|speak)/i,
];

function fieldMatches(key: string, patterns: RegExp[]): boolean {
  return patterns.some((re) => re.test(key));
}

export interface GuardrailReport {
  /** Keys stripped because they looked like price/approval/role fields. */
  strippedFields: string[];
  /** True when a WTP-proxy signal was detected anywhere in the output. */
  wtpProxyDetected: boolean;
}

/**
 * Deep-clone `value`, removing any price/approval/role-like field (at any depth)
 * and detecting WTP-proxy signals in string values. Returns the sanitised value
 * plus a report of what was done.
 */
export function applyGuardrails<T>(value: T): {
  value: T;
  report: GuardrailReport;
} {
  const report: GuardrailReport = {
    strippedFields: [],
    wtpProxyDetected: false,
  };

  function scanString(s: string): void {
    if (WTP_PROXY_PATTERNS.some((re) => re.test(s))) {
      report.wtpProxyDetected = true;
    }
  }

  function walk(input: unknown): unknown {
    if (typeof input === "string") {
      scanString(input);
      return input;
    }
    if (Array.isArray(input)) {
      return input.map(walk);
    }
    if (input && typeof input === "object") {
      const out: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(input)) {
        if (
          fieldMatches(key, PRICE_FIELD_PATTERNS) ||
          fieldMatches(key, APPROVAL_FIELD_PATTERNS)
        ) {
          report.strippedFields.push(key);
          continue; // drop the field entirely
        }
        out[key] = walk(val);
      }
      return out;
    }
    return input;
  }

  const cleaned = walk(value) as T;
  return { value: cleaned, report };
}

/**
 * Convenience: the metrics/translation schemas (schemas.ts) legitimately carry
 * observed `avgPriceCents` / `sampleCount` numbers. Those are OBSERVED market
 * data computed server-side from the database, not prices the AI SETS, so the
 * metrics path does not run them through `applyGuardrails` field-stripping.
 * This helper documents that boundary and only scans for WTP-proxy wording in
 * the human-readable fields.
 */
export function scanMetricsForWtpProxy(texts: string[]): boolean {
  return texts.some((t) => WTP_PROXY_PATTERNS.some((re) => re.test(t)));
}

/**
 * Mark an extracted value as `needs-evidence` when no source reference backs it.
 * Used by the receipt path: a claim with a null/empty sourceRef must be flagged
 * so a human verifies it before anything is created.
 */
export function enforceEvidence(evidence: {
  sourceRef: string | null;
  needsEvidence: boolean;
}): { sourceRef: string | null; needsEvidence: boolean } {
  const hasSource = !!evidence.sourceRef && evidence.sourceRef.trim().length > 0;
  return {
    sourceRef: hasSource ? evidence.sourceRef : null,
    // If there is no source, it ALWAYS needs evidence regardless of what the
    // model claimed.
    needsEvidence: hasSource ? evidence.needsEvidence : true,
  };
}
