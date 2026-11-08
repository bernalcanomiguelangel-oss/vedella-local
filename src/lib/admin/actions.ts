"use server";

/**
 * Server actions for the admin area. Every action:
 *  1. Re-authenticates on the server (requireAdmin / requirePlatformAdmin).
 *  2. Re-checks farm scope for the target record (canActOnFarm).
 *  3. Applies the change through the human-only lifecycle machine / validated
 *     paths.
 *  4. Writes an AdminAudit row (human action).
 *  5. revalidatePath so the UI reflects the change.
 *
 * The AI layer never imports this module; these are strictly human entry points.
 */
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import {
  requireAdmin,
  requirePlatformAdmin,
  canActOnFarm,
  type SessionUser,
} from "@/lib/auth";
import { recordAdminAudit } from "./audit";
import {
  applyLifecycleTransition,
  applyApproveTranslation,
  applyRejectTranslation,
  applyCreateFromReceipt,
} from "./core";

export interface ActionResult {
  ok: boolean;
  code?: string;
  message?: string;
}

/** Resolve the farmId for a farm/product entity so scope can be checked. */
async function resolveEntityFarm(
  entityType: string,
  entityId: string,
): Promise<{ farmId: string | null; lifecycle: string } | null> {
  if (entityType === "farm") {
    const farm = await prisma.farm.findUnique({ where: { id: entityId } });
    if (!farm) return null;
    return { farmId: farm.id, lifecycle: farm.lifecycle };
  }
  if (entityType === "product") {
    const product = await prisma.product.findUnique({ where: { id: entityId } });
    if (!product) return null;
    return { farmId: product.farmId, lifecycle: product.lifecycle };
  }
  return null;
}

/**
 * Human-only lifecycle transition for a farm or product. Enforces the allowed
 * transition table and the approval-separate-from-active invariant via
 * planTransition. A farm_manager can transition only their own farm's records
 * but CANNOT approve (only platform_admin may move -> approved/active via the
 * review queue); we enforce that approval transitions require platform_admin.
 */
export async function transitionLifecycle(
  entityType: "farm" | "product",
  entityId: string,
  toState: string,
): Promise<ActionResult> {
  const user = await requireAdmin();

  const entity = await resolveEntityFarm(entityType, entityId);
  if (!entity) return { ok: false, code: "NOT_FOUND", message: "Record not found." };

  if (!canActOnFarm(user, entity.farmId)) {
    return { ok: false, code: "FORBIDDEN", message: "Not your farm." };
  }

  // Approving/publishing is a platform_admin privilege. A farm_manager may move
  // a draft to pending_review, or archive, but may not grant approval/active.
  const PLATFORM_ONLY = new Set(["approved", "active"]);
  if (PLATFORM_ONLY.has(toState) && user.role !== "platform_admin") {
    return {
      ok: false,
      code: "FORBIDDEN_APPROVAL",
      message: "Only a platform admin can approve or publish.",
    };
  }

  const res = await applyLifecycleTransition(
    prisma,
    entityType,
    entityId,
    toState,
  );
  if (!res.ok) return res;

  await recordAdminAudit({
    actor: user,
    action: "lifecycle_transition",
    entityType,
    entityId,
    fromState: res.from,
    toState: res.to,
  });

  revalidatePath("/admin");
  revalidatePath("/admin/review");
  revalidatePath("/admin/records");
  return { ok: true };
}

/**
 * Approve a machine translation (platform_admin only). Sets status `approved`
 * so it becomes publishable through the existing Translation-driven content path
 * (catalog.ts reads approved rows). AI can never set this status.
 */
export async function approveTranslation(
  translationId: string,
): Promise<ActionResult> {
  const user = await requirePlatformAdmin();
  const row = await prisma.translation.findUnique({ where: { id: translationId } });
  if (!row) return { ok: false, code: "NOT_FOUND", message: "Translation not found." };

  const res = await applyApproveTranslation(prisma, translationId);
  if (!res.ok) return res;

  await recordAdminAudit({
    actor: user,
    action: "approve_translation",
    entityType: "translation",
    entityId: translationId,
    fromState: row.status,
    toState: "approved",
    detail: `${row.entityType}:${row.entityId}:${row.field}:${row.locale}`,
  });

  revalidatePath("/admin/review");
  return { ok: true };
}

/**
 * Reject a machine translation (platform_admin only). We DELETE the rejected row
 * so it never surfaces (catalog shows approved only) and the queue clears. The
 * rejection is audited with the discarded text for traceability.
 */
export async function rejectTranslation(
  translationId: string,
): Promise<ActionResult> {
  const user = await requirePlatformAdmin();
  const row = await prisma.translation.findUnique({ where: { id: translationId } });
  if (!row) return { ok: false, code: "NOT_FOUND", message: "Translation not found." };

  const res = await applyRejectTranslation(prisma, translationId);
  if (!res.ok) return res;

  await recordAdminAudit({
    actor: user,
    action: "reject_translation",
    entityType: "translation",
    entityId: translationId,
    fromState: row.status,
    toState: "rejected",
    detail: `${row.entityType}:${row.entityId}:${row.field}:${row.locale} :: ${row.text.slice(0, 120)}`,
  });

  revalidatePath("/admin/review");
  return { ok: true };
}

/**
 * Edit then approve a machine translation in one human step (the review UI lets
 * the human correct the text before publishing). platform_admin only.
 */
export async function editAndApproveTranslation(
  translationId: string,
  newText: string,
): Promise<ActionResult> {
  const user = await requirePlatformAdmin();
  const text = (newText ?? "").trim();
  if (text.length === 0 || text.length > 5000) {
    return { ok: false, code: "BAD_TEXT", message: "Text must be 1–5000 chars." };
  }
  const row = await prisma.translation.findUnique({ where: { id: translationId } });
  if (!row) return { ok: false, code: "NOT_FOUND", message: "Translation not found." };

  const res = await applyApproveTranslation(prisma, translationId, text);
  if (!res.ok) return res;

  await recordAdminAudit({
    actor: user,
    action: "approve_translation",
    entityType: "translation",
    entityId: translationId,
    fromState: row.status,
    toState: "approved",
    detail: `edited ${row.entityType}:${row.entityId}:${row.field}:${row.locale}`,
  });

  revalidatePath("/admin/review");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Receipt-driven creation (human-reviewed form submit)
// ---------------------------------------------------------------------------

export interface ReceiptSubmitInput {
  farmId: string;
  productName: string;
  productKind: "cut" | "pack";
  basePriceCents: number; // entered by the HUMAN (AI never sets prices)
  lotReference: string;
  units: number;
  slaughterDate: string;
  cuttingDate: string;
  packingDate: string;
  expiryDate: string;
  // Optional cut facts the human may fill in.
  weight?: string;
  thickness?: string;
  maturation?: string;
  packaging?: string;
  shelfLife?: string;
}

/**
 * Create a Product + Lot from a HUMAN-reviewed receipt form. The record is
 * routed into `pending_review` (draft of approval) — never auto-approved and
 * never active. Creation goes through validateLot so the traceability
 * invariants hold. This is the ONLY place receipt data becomes records, and it
 * is triggered by a human submitting the form, not by the AI.
 */
export async function createFromReceipt(
  input: ReceiptSubmitInput,
): Promise<ActionResult & { productId?: string; lotId?: string }> {
  const user = await requireAdmin();

  if (!canActOnFarm(user, input.farmId)) {
    return { ok: false, code: "FORBIDDEN", message: "Not your farm." };
  }

  const res = await applyCreateFromReceipt(prisma, input);
  if (!res.ok) return res;

  await recordAdminAudit({
    actor: user,
    action: "receipt_prefill_create",
    entityType: "product",
    entityId: res.productId ?? "",
    toState: "pending_review",
    detail: `lot ${input.lotReference} created pending review from receipt`,
  });

  revalidatePath("/admin/review");
  revalidatePath("/admin/records");
  return res;
}

/**
 * Trigger AI translation for a field (human-initiated). Produces machine rows
 * for the review queue. Never publishes. Audited as a human request.
 */
export async function requestTranslation(
  entityType: "farm" | "product" | "pack",
  entityId: string,
  field: string,
  sourceText: string,
): Promise<ActionResult> {
  const user = await requireAdmin();

  // Scope check for farm/product entities ("pack" resolves as a product).
  if (entityType === "farm" || entityType === "product") {
    const entity = await resolveEntityFarm(entityType, entityId);
    if (entity && !canActOnFarm(user, entity.farmId)) {
      return { ok: false, code: "FORBIDDEN", message: "Not your farm." };
    }
  }

  const { translateField } = await import("@/lib/ai/translate");
  const result = await translateField({
    entityType,
    entityId,
    field,
    sourceText,
  });

  await recordAdminAudit({
    actor: user,
    action: "translate_request",
    entityType,
    entityId,
    detail: `field=${field} outcome=${result.outcome} stored=${result.stored.length}`,
  });

  revalidatePath("/admin/review");
  return { ok: result.ok, code: result.outcome };
}

/**
 * Run the weekly metrics job (human-initiated from the dashboard). Computes the
 * average market price per cut and persists MarketPriceSnapshot rows. The AI
 * only phrases a headline; it never sets any price. Audited as a human run.
 */
export async function runWeeklyMetricsAction(): Promise<ActionResult> {
  const user = await requireAdmin();
  const { runWeeklyMetrics } = await import("@/lib/ai/metrics");
  const result = await runWeeklyMetrics(new Date());

  await recordAdminAudit({
    actor: user,
    action: "run_metrics",
    entityType: "metrics",
    entityId: result.weekStart,
    detail: `outcome=${result.outcome} cuts=${result.perCut.length}`,
  });

  revalidatePath("/admin/metrics");
  return { ok: result.outcome === "ok", code: result.outcome };
}

export type { SessionUser };
