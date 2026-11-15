/**
 * Deterministic medical-claim content guard (condition 2).
 *
 * Product/offer descriptions written by a farm_manager may contain health,
 * medical, or nutrition wording. Catalan/Spanish/English food marketing law and
 * this project's AI-guardrails forbid treatment/prevention/disease claims and
 * require EVIDENCE for nutrition claims. This module classifies a description
 * into three buckets so the management layer can route it:
 *
 *   - 'prohibited'     : treatment/prevention/disease wording (e.g. "cures iron
 *                        deficiency", "prevents anaemia", "treats", "heals",
 *                        "medicinal", "therapeutic"). The draft may still SAVE,
 *                        but the record is forced into human review and can
 *                        never become approved/active/public while unresolved.
 *   - 'needs_evidence' : nutrition wording that may be legitimate but needs a
 *                        documented source (e.g. "source of iron", "rich in
 *                        protein", "high in", "good source of"). Also forced
 *                        into evidence-based human review.
 *   - 'ordinary'       : everything else (e.g. "vacuum-packed entrecote,
 *                        280-320 g per steak"). No review forced.
 *
 * DESIGN INVARIANTS (ai-guardrails):
 *   - This is DETERMINISTIC code, not an AI model. The three buckets are decided
 *     by fixed, auditable regular expressions. Any future AI assist may only
 *     ADVISE a human reviewer; it must NEVER decide publication. The final
 *     reject/request-changes/approve decision is always a platform_admin's.
 *   - The input is treated as PLAIN DATA. No instruction inside the text is ever
 *     followed; this function only reads and classifies characters. It never
 *     changes roles, permissions, approval state, prices, or system behavior.
 *   - Matching is case-insensitive and accent-tolerant (anaemia/anemia,
 *     deficiència/deficiencia) so trivial spelling/accent variants cannot slip a
 *     prohibited claim past the guard.
 */

import {
  type ContentReviewState,
  isUnresolvedForPublication,
} from "./content-review";

export type ContentClass = "prohibited" | "needs_evidence" | "ordinary";

export interface ContentClassification {
  kind: ContentClass;
  /** The specific phrases that triggered the classification (for the reason). */
  matches: string[];
  /** A short, human-readable explanation stored as the content flag reason. */
  reason: string;
}

/**
 * Fold a string to a comparison form: lower-cased and accent-stripped so
 * "anaemia", "anæmia", "deficiència" and "deficiencia" all compare equal.
 * Uses Unicode NFD + combining-mark removal; also collapses the "ae" ligature
 * digraph so "anaemia" and "anemia" match the same pattern.
 */
function fold(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip combining diacritics
    .toLowerCase()
    .replace(/æ/g, "ae")
    .replace(/\u00e6/g, "ae");
}

/**
 * PROHIBITED: treatment / prevention / disease / medicinal wording. These are
 * matched against the folded text, so they are already accent-insensitive.
 * Covers English, Catalan and Spanish stems for the demo content.
 */
const PROHIBITED_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /\bcures?\b/, label: "cure/cures" },
  { re: /\bcuring\b/, label: "curing" },
  { re: /\bcura\b|\bcuren\b|\bcurar\b/, label: "cura/curar" },
  { re: /\bprevents?\b/, label: "prevent/prevents" },
  { re: /\bpreventing\b/, label: "preventing" },
  { re: /\bprevenci[oó]n?\b|\bpreve[a-z]*\b(?=.*(anemi|malalt|enferm))/, label: "prevencio/prevencion" },
  { re: /\btreats?\b|\btreating\b|\btreatment\b/, label: "treat/treatment" },
  { re: /\bheals?\b|\bhealing\b/, label: "heal/heals" },
  { re: /\bmedicinal\b|\bmedicina\b/, label: "medicinal" },
  { re: /\btherapeutic\b|\bterap[eè]utic[ao]?\b/, label: "therapeutic" },
  { re: /\bdisease prevention\b|\bprevencio de malalties\b/, label: "disease prevention" },
  { re: /\banaemia\b|\banemia\b|\banemi[ae]s?\b/, label: "anaemia" },
  { re: /\biron deficiency\b|\bdeficiencia de ferro\b|\bdeficiencia de hierro\b/, label: "iron deficiency" },
];

/**
 * NEEDS_EVIDENCE: nutrition claims that can be legitimate with a documented
 * source but must not be published unreviewed.
 */
const NEEDS_EVIDENCE_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /\bsource of\b/, label: "source of" },
  { re: /\bgood source of\b/, label: "good source of" },
  { re: /\brich in\b/, label: "rich in" },
  { re: /\bhigh in\b/, label: "high in" },
  { re: /\bfont de\b/, label: "font de (ca)" },
  { re: /\brica? en\b|\bric en\b/, label: "ric/rica en" },
  { re: /\balt contingut\b/, label: "alt contingut" },
  { re: /\bfuente de\b/, label: "fuente de (es)" },
];

/**
 * Classify a description into one of the three buckets. Prohibited wins over
 * needs-evidence when both appear (the stricter outcome). Pure + deterministic.
 */
export function classifyContent(text: string): ContentClassification {
  const folded = fold(text ?? "");

  const prohibited = PROHIBITED_PATTERNS.filter((p) => p.re.test(folded)).map(
    (p) => p.label,
  );
  if (prohibited.length > 0) {
    return {
      kind: "prohibited",
      matches: prohibited,
      reason: `Possible medical treatment/prevention claim: ${prohibited.join(", ")}. Requires human review and evidence-based rewording before publication.`,
    };
  }

  const nutrition = NEEDS_EVIDENCE_PATTERNS.filter((p) => p.re.test(folded)).map(
    (p) => p.label,
  );
  if (nutrition.length > 0) {
    return {
      kind: "needs_evidence",
      matches: nutrition,
      reason: `Nutrition claim needs documented evidence: ${nutrition.join(", ")}. Sent for evidence-based human review before publication.`,
    };
  }

  return { kind: "ordinary", matches: [], reason: "" };
}

/**
 * Map a guard classification to the persisted contentReviewState workflow
 * value. BOTH detection kinds collapse to the single workflow state
 * `needs_review` (the detection REASON stays in contentFlagReason, so detection
 * is separated from workflow state). Ordinary text maps to `clear` — meaning
 * "evaluated, nothing found" (NOT null, which means "never evaluated").
 *
 *   'prohibited'     -> 'needs_review'
 *   'needs_evidence' -> 'needs_review'
 *   'ordinary'       -> 'clear'
 *
 * This NEVER returns `approved` / `rejected`: those are set only by the
 * authorised human review action (applyContentReviewDecision).
 */
export function contentReviewStateFor(
  result: ContentClassification,
): ContentReviewState {
  if (result.kind === "prohibited" || result.kind === "needs_evidence") {
    return "needs_review";
  }
  return "clear";
}

/**
 * True when the classification forces human review (prohibited OR
 * needs_evidence). Ordinary text does not force review.
 */
export function requiresContentReview(result: ContentClassification): boolean {
  return result.kind === "prohibited" || result.kind === "needs_evidence";
}

/**
 * Content-review states that BLOCK approval/activation until a platform_admin
 * resolves them. Re-exported from the single source of truth
 * (src/lib/content-review.ts): `needs_review` and `rejected` block; `clear`,
 * `approved` and NULL do not.
 */
export function isContentReviewUnresolved(
  state: string | null | undefined,
): boolean {
  return isUnresolvedForPublication(state);
}
