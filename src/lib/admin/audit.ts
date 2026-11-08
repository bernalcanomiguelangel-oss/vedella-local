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
  | "assign_farm";

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
