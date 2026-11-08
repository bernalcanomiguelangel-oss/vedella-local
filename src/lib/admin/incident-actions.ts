"use server";

/**
 * Server-action wrappers for incidents (FEAT-006). Each action re-authenticates
 * on the server (requireAdmin), delegates to the scope-enforcing logic in
 * ./incidents, writes an AdminAudit row, and revalidates the incidents view.
 * Farm managers are confined to their own farm by the logic layer.
 */
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { recordAdminAudit } from "./audit";
import {
  createIncident,
  updateIncident,
  withdrawLotForIncident,
  type CreateIncidentInput,
  type UpdateIncidentInput,
} from "./incidents";

export interface ActionResult {
  ok: boolean;
  code?: string;
  message?: string;
}

export async function createIncidentAction(
  input: CreateIncidentInput,
): Promise<ActionResult & { id?: string }> {
  const user = await requireAdmin();
  const res = await createIncident(prisma, user, input);
  if (!res.ok) return res;

  await recordAdminAudit({
    actor: user,
    action: "incident_create",
    entityType: "incident",
    entityId: res.id ?? "",
    toState: input.severity,
    detail: `incident ${input.reference} (${input.category}) created`,
  });

  revalidatePath("/admin/incidents");
  return res;
}

export async function updateIncidentAction(
  incidentId: string,
  input: UpdateIncidentInput,
): Promise<ActionResult> {
  const user = await requireAdmin();
  const res = await updateIncident(prisma, user, incidentId, input);
  if (!res.ok) return res;

  await recordAdminAudit({
    actor: user,
    action: "incident_update",
    entityType: "incident",
    entityId: incidentId,
    toState: input.status ?? "",
    detail: "incident workflow updated",
  });

  revalidatePath("/admin/incidents");
  return res;
}

/**
 * High-severity lot remediation: withdraw the lot linked to a high/critical
 * incident. Returns the affected unfulfilled orders so the operator can follow
 * up. Audited as a human lot-withdrawal action.
 */
export async function withdrawLotForIncidentAction(
  incidentId: string,
): Promise<ActionResult & { affectedOrderCount?: number }> {
  const user = await requireAdmin();
  const res = await withdrawLotForIncident(prisma, user, incidentId);
  if (!res.ok) return res;

  await recordAdminAudit({
    actor: user,
    action: "incident_withdraw_lot",
    entityType: "incident",
    entityId: incidentId,
    detail: `lot withdrawn; ${res.affectedOrders?.length ?? 0} unfulfilled order(s) affected`,
  });

  revalidatePath("/admin/incidents");
  revalidatePath("/admin/lots");
  return { ok: true, affectedOrderCount: res.affectedOrders?.length ?? 0 };
}
