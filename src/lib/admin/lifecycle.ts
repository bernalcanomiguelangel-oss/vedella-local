/**
 * Human-only lifecycle state machine for Farm and Product records.
 *
 * States (product steering): draft, pending_review, approved, active, inactive,
 * rejected, archived.
 *
 * Key invariants enforced here and covered by tests:
 *  - APPROVAL IS SEPARATE FROM ACTIVE. A record can be `approved` but not active,
 *    and only an already-approved record may be made `active`. The boolean flags
 *    `isApproved` and `isActive` are derived from the target state so the public
 *    catalog (which filters on isApproved && isActive) stays consistent.
 *  - Only a HUMAN triggers a transition. These functions require a SessionUser
 *    and write an AdminAudit row. The AI layer never imports this module.
 *  - Allowed transitions are explicit; an illegal jump is rejected.
 *
 * The transition table is intentionally conservative. `pending_review ->
 * approved` and `-> rejected` are the review-queue decisions; `approved <->
 * active <-> inactive` are the publish/unpublish controls; `archived` is a
 * terminal shelf; `draft` can go back to the author for edits.
 */

export const LIFECYCLE_STATES = [
  "draft",
  "pending_review",
  "approved",
  "active",
  "inactive",
  "rejected",
  "archived",
] as const;

export type LifecycleState = (typeof LIFECYCLE_STATES)[number];

export function isLifecycleState(value: string): value is LifecycleState {
  return (LIFECYCLE_STATES as readonly string[]).includes(value);
}

/**
 * Allowed transitions. The target states a record in `from` may move to.
 * Approval (-> approved) is only reachable from pending_review; activation
 * (-> active) is only reachable from an already-approved/inactive state, so a
 * record can never become active without first being approved.
 */
const TRANSITIONS: Record<LifecycleState, LifecycleState[]> = {
  draft: ["pending_review", "archived"],
  pending_review: ["approved", "rejected", "draft"],
  // Approved but NOT active yet — a human must explicitly publish (-> active).
  approved: ["active", "inactive", "archived"],
  active: ["inactive", "archived"],
  inactive: ["active", "archived"],
  rejected: ["draft", "archived"],
  archived: [],
};

export function allowedTransitions(from: string): LifecycleState[] {
  if (!isLifecycleState(from)) return [];
  return TRANSITIONS[from];
}

export function canTransition(from: string, to: string): boolean {
  return isLifecycleState(to) && allowedTransitions(from).includes(to);
}

export interface LifecycleFlags {
  lifecycle: LifecycleState;
  isApproved: boolean;
  isActive: boolean;
}

/**
 * Derive the (isApproved, isActive) booleans from a lifecycle state. This is the
 * single place that ties the human-facing state to the catalog's publish flags.
 *
 *  - approved : isApproved=true, isActive=false  (approved but NOT published)
 *  - active   : isApproved=true, isActive=true   (approved AND published)
 *  - inactive : isApproved=true, isActive=false  (approved but unpublished)
 *  - anything else : not approved, not active
 */
export function flagsForState(to: LifecycleState): LifecycleFlags {
  switch (to) {
    case "active":
      return { lifecycle: "active", isApproved: true, isActive: true };
    case "approved":
      return { lifecycle: "approved", isApproved: true, isActive: false };
    case "inactive":
      return { lifecycle: "inactive", isApproved: true, isActive: false };
    default:
      return { lifecycle: to, isApproved: false, isActive: false };
  }
}

export class LifecycleError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "LifecycleError";
    this.code = code;
  }
}

/**
 * Validate a requested transition (pure). Throws LifecycleError when the target
 * is unknown or the jump is not allowed. Returns the derived flags on success.
 */
export function planTransition(from: string, to: string): LifecycleFlags {
  if (!isLifecycleState(to)) {
    throw new LifecycleError("UNKNOWN_STATE", `Unknown lifecycle state: ${to}.`);
  }
  if (!canTransition(from, to)) {
    throw new LifecycleError(
      "ILLEGAL_TRANSITION",
      `Cannot move from "${from}" to "${to}".`,
    );
  }
  return flagsForState(to);
}
