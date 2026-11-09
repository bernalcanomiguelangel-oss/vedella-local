"use server";

/**
 * Server actions for the FEAT-004 management screens (offers, farm profile,
 * certifications, lots, multi-farm packs, cycles). Each action:
 *   1. Re-authenticates on the server (requireAdmin / requirePlatformAdmin).
 *   2. Delegates to the pure, scope-enforcing logic in ./manage.ts (which also
 *      re-checks farm scope and the permission matrix).
 *   3. Writes an AdminAudit row (human action).
 *   4. revalidatePath so the UI reflects the change.
 *
 * The AI layer never imports this module; these are strictly human entry points.
 * AI never appears as an approver.
 */
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin, requirePlatformAdmin } from "@/lib/auth";
import { recordAdminAudit } from "./audit";
import {
  type Actor,
  applyOfferSelfEdit,
  applyOfferCreate,
  applyProfileSubmitReview,
  applyProfileDirectEdit,
  applyProfileApprove,
  applyProfileReject,
  applyCertSubmit,
  applyCertApprove,
  applyCertReject,
  applyLotCreate,
  applyPackCreate,
  applyPackAccept,
  applyPackDecline,
  applyPackPublish,
  applyCycleTransition,
  applyCycleAddFarm,
  applyCycleRemoveFarm,
} from "./manage";

export interface ActionResult {
  ok: boolean;
  code?: string;
  message?: string;
}

function actorOf(u: { id: string; role: string; farmId: string | null }): Actor {
  return { id: u.id, role: u.role as Actor["role"], farmId: u.farmId };
}

function revalidateAll() {
  revalidatePath("/admin");
  revalidatePath("/admin/review");
  revalidatePath("/admin/farms");
  revalidatePath("/admin/products");
  revalidatePath("/admin/lots");
  revalidatePath("/admin/cycles");
  revalidatePath("/admin/orders");
}

// --- Offers ----------------------------------------------------------------

export async function offerSelfEditAction(
  offerId: string,
  priceAmountCents?: number,
  availableUnits?: number,
): Promise<ActionResult> {
  const user = await requireAdmin();
  const res = await applyOfferSelfEdit(prisma, actorOf(user), offerId, {
    priceAmountCents,
    availableUnits,
  });
  if (res.ok) {
    await recordAdminAudit({
      actor: user,
      action: "offer_self_edit",
      entityType: "offer",
      entityId: offerId,
      detail: `price=${priceAmountCents ?? "-"} units=${availableUnits ?? "-"}`,
    });
    revalidateAll();
  }
  return res;
}

export async function offerCreateAction(input: {
  farmId: string;
  productDefinitionId: string;
  publicName: string;
  priceAmountCents: number;
  priceUnit?: string;
  description?: string;
}): Promise<ActionResult> {
  const user = await requireAdmin();
  const res = await applyOfferCreate(prisma, actorOf(user), input);
  if (res.ok) {
    await recordAdminAudit({
      actor: user,
      action: "offer_create_pending",
      entityType: "offer",
      entityId: res.offerId ?? "",
      toState: "pending_review",
      detail: `new offer "${input.publicName}" for farm ${input.farmId}`,
    });
    revalidateAll();
  }
  return res;
}

// --- Farm profile ----------------------------------------------------------

export async function profileSubmitReviewAction(
  farmId: string,
  changes: Record<string, unknown>,
): Promise<ActionResult> {
  const user = await requireAdmin();
  const res = await applyProfileSubmitReview(prisma, actorOf(user), farmId, changes);
  if (res.ok) {
    await recordAdminAudit({
      actor: user,
      action: "profile_submit_review",
      entityType: "farm_profile_edit",
      entityId: res.editId ?? "",
      toState: "pending_review",
      detail: `farm ${farmId} fields: ${Object.keys(changes).join(",")}`,
    });
    revalidateAll();
  }
  return res;
}

export async function profileDirectEditAction(
  farmId: string,
  changes: Record<string, unknown>,
): Promise<ActionResult> {
  const user = await requirePlatformAdmin();
  const res = await applyProfileDirectEdit(prisma, actorOf(user), farmId, changes);
  if (res.ok) {
    await recordAdminAudit({
      actor: user,
      action: "profile_approve",
      entityType: "farm",
      entityId: farmId,
      detail: `direct edit fields: ${Object.keys(changes).join(",")}`,
    });
    revalidateAll();
  }
  return res;
}

export async function profileApproveAction(editId: string): Promise<ActionResult> {
  const user = await requirePlatformAdmin();
  const res = await applyProfileApprove(prisma, actorOf(user), editId);
  if (res.ok) {
    await recordAdminAudit({
      actor: user,
      action: "profile_approve",
      entityType: "farm_profile_edit",
      entityId: editId,
      toState: "approved",
    });
    revalidateAll();
  }
  return res;
}

export async function profileRejectAction(
  editId: string,
  reason?: string,
): Promise<ActionResult> {
  const user = await requirePlatformAdmin();
  const res = await applyProfileReject(prisma, actorOf(user), editId, reason);
  if (res.ok) {
    await recordAdminAudit({
      actor: user,
      action: "profile_reject",
      entityType: "farm_profile_edit",
      entityId: editId,
      toState: "rejected",
    });
    revalidateAll();
  }
  return res;
}

// --- Certifications --------------------------------------------------------

export async function certSubmitAction(input: {
  farmId: string;
  type: string;
  title: string;
  body?: string;
  evidenceRef?: string;
}): Promise<ActionResult> {
  const user = await requireAdmin();
  const res = await applyCertSubmit(prisma, actorOf(user), input);
  if (res.ok) {
    await recordAdminAudit({
      actor: user,
      action: "cert_submit",
      entityType: "farm_certification",
      entityId: res.certId ?? "",
      toState: "pending_review",
      detail: `cert "${input.title}" for farm ${input.farmId}`,
    });
    revalidateAll();
  }
  return res;
}

export async function certApproveAction(certId: string): Promise<ActionResult> {
  const user = await requirePlatformAdmin();
  const res = await applyCertApprove(prisma, actorOf(user), certId);
  if (res.ok) {
    await recordAdminAudit({
      actor: user,
      action: "cert_approve",
      entityType: "farm_certification",
      entityId: certId,
      toState: "approved",
    });
    revalidateAll();
  }
  return res;
}

export async function certRejectAction(
  certId: string,
  reason?: string,
): Promise<ActionResult> {
  const user = await requirePlatformAdmin();
  const res = await applyCertReject(prisma, actorOf(user), certId, reason);
  if (res.ok) {
    await recordAdminAudit({
      actor: user,
      action: "cert_reject",
      entityType: "farm_certification",
      entityId: certId,
      toState: "rejected",
    });
    revalidateAll();
  }
  return res;
}

// --- Lots ------------------------------------------------------------------

export async function lotCreateAction(input: {
  farmId: string;
  farmProductOfferId: string;
  reference: string;
  units: number;
  slaughterDate: string;
  cuttingDate: string;
  packingDate: string;
  expiryDate: string;
}): Promise<ActionResult> {
  const user = await requireAdmin();
  const res = await applyLotCreate(prisma, actorOf(user), input);
  if (res.ok) {
    await recordAdminAudit({
      actor: user,
      action: user.role === "farm_manager" ? "lot_create_pending" : "lot_create",
      entityType: "lot",
      entityId: res.lotId ?? "",
      detail: `lot ${input.reference} for offer ${input.farmProductOfferId}`,
    });
    revalidateAll();
  }
  return res;
}

// --- Packs -----------------------------------------------------------------

export async function packCreateAction(input: {
  publicName: string;
  description?: string;
  priceAmountCents?: number;
  isMultiFarm?: boolean;
  farmId?: string | null;
  items: Array<{ farmProductOfferId: string; quantity: number; lotId?: string }>;
}): Promise<ActionResult> {
  const user = await requireAdmin();
  const res = await applyPackCreate(prisma, actorOf(user), input);
  if (res.ok) {
    await recordAdminAudit({
      actor: user,
      action: "pack_create",
      entityType: "pack",
      entityId: res.packId ?? "",
      detail: `pack "${input.publicName}" multiFarm=${input.isMultiFarm ?? "auto"}`,
    });
    revalidateAll();
  }
  return res;
}

export async function packAcceptAction(
  packId: string,
  farmId: string,
): Promise<ActionResult> {
  const user = await requireAdmin();
  const res = await applyPackAccept(prisma, actorOf(user), packId, farmId);
  if (res.ok) {
    await recordAdminAudit({
      actor: user,
      action: "pack_accept",
      entityType: "pack",
      entityId: packId,
      detail: `farm ${farmId} accepted`,
    });
    revalidateAll();
  }
  return res;
}

export async function packDeclineAction(
  packId: string,
  farmId: string,
  reason?: string,
): Promise<ActionResult> {
  const user = await requireAdmin();
  const res = await applyPackDecline(prisma, actorOf(user), packId, farmId, reason);
  if (res.ok) {
    await recordAdminAudit({
      actor: user,
      action: "pack_decline",
      entityType: "pack",
      entityId: packId,
      detail: `farm ${farmId} declined`,
    });
    revalidateAll();
  }
  return res;
}

export async function packPublishAction(packId: string): Promise<ActionResult> {
  const user = await requirePlatformAdmin();
  const res = await applyPackPublish(prisma, actorOf(user), packId);
  if (res.ok) {
    await recordAdminAudit({
      actor: user,
      action: "pack_publish",
      entityType: "pack",
      entityId: packId,
      toState: "active",
    });
    revalidateAll();
  }
  return res;
}

// --- Cycles ----------------------------------------------------------------

export async function cycleTransitionAction(
  cycleId: string,
  toStatus: "open" | "closed" | "fulfilling" | "fulfilled" | "cancelled" | "archived",
): Promise<ActionResult> {
  const user = await requirePlatformAdmin();
  const res = await applyCycleTransition(prisma, actorOf(user), cycleId, toStatus);
  if (res.ok) {
    await recordAdminAudit({
      actor: user,
      action: "cycle_transition",
      entityType: "cycle",
      entityId: cycleId,
      fromState: res.from,
      toState: toStatus,
    });
    revalidateAll();
  }
  return res;
}

export async function cycleAddFarmAction(
  cycleId: string,
  farmId: string,
  allocatedPlaces?: number,
): Promise<ActionResult> {
  const user = await requirePlatformAdmin();
  const res = await applyCycleAddFarm(prisma, actorOf(user), cycleId, farmId, allocatedPlaces);
  if (res.ok) {
    await recordAdminAudit({
      actor: user,
      action: "cycle_add_farm",
      entityType: "cycle",
      entityId: cycleId,
      detail: `farm ${farmId} places=${allocatedPlaces ?? "-"}`,
    });
    revalidateAll();
  }
  return res;
}

export async function cycleRemoveFarmAction(
  cycleId: string,
  farmId: string,
): Promise<ActionResult> {
  const user = await requirePlatformAdmin();
  const res = await applyCycleRemoveFarm(prisma, actorOf(user), cycleId, farmId);
  if (res.ok) {
    await recordAdminAudit({
      actor: user,
      action: "cycle_remove_farm",
      entityType: "cycle",
      entityId: cycleId,
      detail: `farm ${farmId} removed`,
    });
    revalidateAll();
  }
  return res;
}
