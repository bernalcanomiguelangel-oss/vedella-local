/**
 * SINGLE SOURCE OF TRUTH for the offer content-review workflow states.
 *
 * The deterministic content guard (src/lib/content-guard.ts) classifies an
 * offer description; the persisted workflow state (the nullable TEXT column
 * FarmProductOffer.contentReviewState) is ALWAYS one of the values below, or
 * NULL for a legacy / not-yet-evaluated record.
 *
 * WORKFLOW SEMANTICS (the user's validated set):
 *   NULL          Legacy record or a record never evaluated under the
 *                 content-review workflow. Its existing publication status is
 *                 preserved; NULL is NOT treated as unresolved.
 *   "clear"       The guard evaluated the current relevant text and found NO
 *                 review-triggering claim. ("evaluated, nothing found" — this is
 *                 distinct from NULL, which means "never evaluated".)
 *   "needs_review" The guard detected a possible medical / nutritional /
 *                 evidence-sensitive or otherwise unsupported claim. The draft
 *                 may be saved, but the offer cannot become active or public
 *                 until a platform_admin reviews it.
 *   "approved"    A platform_admin reviewed the wording and approved the
 *                 corrected / sufficiently-supported content.
 *   "rejected"    A platform_admin rejected the content. The offer cannot become
 *                 active or public until the text is edited and resubmitted.
 *
 * DETECTION vs WORKFLOW: the content guard's REASON (why it triggered) lives in
 * the separate contentFlagReason column. Both a prohibited treatment/prevention
 * claim and a nutrition-needs-evidence claim map to the SAME workflow state
 * `needs_review`; the detection detail is preserved in the reason, so detection
 * is cleanly separated from workflow state.
 *
 * GUARDRAILS: `approved` / `rejected` may be written ONLY by the authorised
 * human review action (applyContentReviewDecision, platform_admin-only). The
 * offer create/edit path and the AI layer must NEVER set those two states; they
 * may only set `clear` / `needs_review` (or leave NULL). A client-submitted
 * contentReviewState is NEVER trusted — the server derives it from the guard.
 *
 * Because the DB columns stay nullable TEXT, this set is enforced in APPLICATION
 * CODE + Zod + tests only; no Postgres enum/CHECK migration is added.
 */
import { z } from "zod";

export const CONTENT_REVIEW_STATES = [
  "clear",
  "needs_review",
  "approved",
  "rejected",
] as const;

export type ContentReviewState = (typeof CONTENT_REVIEW_STATES)[number];

/** Zod enum for request / form validation of a content-review state. */
export const contentReviewStateSchema = z.enum(CONTENT_REVIEW_STATES);

/** The stored value may also be NULL (legacy / not-yet-evaluated). */
export type StoredContentReviewState = ContentReviewState | null;

/**
 * States that BLOCK publication (approval → active → public) until resolved.
 * `needs_review` and `rejected` are unresolved. `clear`, `approved`, and NULL
 * are NOT unresolved (NULL preserves a legacy record's existing status).
 */
export function isUnresolvedForPublication(
  state: string | null | undefined,
): boolean {
  return state === "needs_review" || state === "rejected";
}

/**
 * True when the guard outcome requires human review (the state is
 * `needs_review`). Convenience predicate used by the management layer; NULL,
 * `clear`, `approved` and `rejected` do not (re)trigger review here — `rejected`
 * stays blocked until a material edit re-runs the guard.
 */
export function requiresReview(state: string | null | undefined): boolean {
  return state === "needs_review";
}

/** Type guard: is `value` one of the four validated states? */
export function isContentReviewState(
  value: unknown,
): value is ContentReviewState {
  return (
    typeof value === "string" &&
    (CONTENT_REVIEW_STATES as readonly string[]).includes(value)
  );
}

/**
 * The allowed state transitions (NULL represented as the literal "null" key).
 * Each entry lists the states a record may move TO.
 *
 *   null          -> clear | needs_review          (first guard evaluation)
 *   clear         -> needs_review                   (material edit re-triggers)
 *   needs_review  -> approved | rejected            (platform_admin decision)
 *   rejected      -> needs_review                   (edit + resubmit)
 *   approved      -> needs_review                   (material edit re-runs guard)
 *
 * Self-transitions (X -> X, e.g. a clear edit stays clear, a needs_review edit
 * stays needs_review) are always allowed as idempotent no-ops.
 */
const TRANSITIONS: Record<string, ReadonlyArray<ContentReviewState>> = {
  null: ["clear", "needs_review"],
  clear: ["needs_review"],
  needs_review: ["approved", "rejected"],
  rejected: ["needs_review"],
  approved: ["needs_review"],
};

function transitionKey(state: StoredContentReviewState): string {
  return state === null || state === undefined ? "null" : state;
}

/**
 * Validate a content-review state transition. Returns true when moving `from`
 * (which may be NULL) to `to` is permitted. Self-transitions are allowed.
 *
 * This encodes WORKFLOW legality only; the AUTHORISATION check (only a
 * platform_admin may drive needs_review -> approved/rejected) is enforced by
 * the review action, not here.
 */
export function canTransitionContentReview(
  from: StoredContentReviewState,
  to: ContentReviewState,
): boolean {
  if (from === to) return true;
  const allowed = TRANSITIONS[transitionKey(from)] ?? [];
  return allowed.includes(to);
}
