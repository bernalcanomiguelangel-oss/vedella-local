/**
 * Human-action audit log. Every lifecycle transition, approval, rejection and
 * receipt-driven creation performed by a human in the admin area writes one row
 * here (ai-guardrails: approvals/lifecycle are human-only AND must be audited).
 *
 * This is separate from AiRun (which audits AI runs). Writing to the audit log
 * never throws into the caller: an audit failure must not block or crash a
 * legitimate human action, but it is logged.
 */
import { prisma } from "@/lib/db";
import type { SessionUser } from "@/lib/auth";

export type AdminAction =
  | "lifecycle_transition"
  | "approve_translation"
  | "reject_translation"
  | "receipt_prefill_create"
  | "run_metrics"
  | "translate_request"
  | "create_user"
  | "assign_role"
  | "assign_farm"
  // FEAT-004 human actions.
  | "offer_self_edit"
  | "offer_submit_review"
  | "offer_create_pending"
  | "profile_submit_review"
  | "profile_approve"
  | "profile_reject"
  | "cert_submit"
  | "cert_approve"
  | "cert_reject"
  | "media_upload"
  | "media_upload_pending"
  | "media_approve"
  | "media_reject"
  | "lot_create_pending"
  | "lot_create"
  | "pack_create"
  | "pack_accept"
  | "pack_decline"
  | "pack_publish"
  | "cycle_transition"
  | "cycle_add_farm"
  | "cycle_remove_farm"
  // FEAT-006 human actions.
  | "incident_create"
  | "incident_update"
  | "incident_withdraw_lot"
  | "website_text_draft"
  | "website_text_publish"
  | "setting_update"
  // FEAT-004 A/B-testing copy loop human actions.
  | "copy_propose"
  | "copy_variant_decide"
  | "copy_judge_rule_create"
  | "copy_experiment_start"
  | "copy_experiment_decide";

export interface AdminAuditInput {
  actor: SessionUser;
  action: AdminAction;
  entityType: string;
  entityId: string;
  fromState?: string;
  toState?: string;
  detail?: string;
}

export async function recordAdminAudit(input: AdminAuditInput): Promise<void> {
  try {
    await prisma.adminAudit.create({
      data: {
        actorId: input.actor.id,
        actorEmail: input.actor.email,
        actorRole: input.actor.role,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        fromState: input.fromState ?? "",
        toState: input.toState ?? "",
        detail: input.detail ?? "",
      },
    });
  } catch (err) {
    console.error(
      "[admin-audit] failed to persist audit row:",
      err instanceof Error ? err.message : "unknown error",
    );
  }
}
