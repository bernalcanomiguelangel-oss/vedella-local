/**
 * Pure, testable management operations for FEAT-004 (offers, farm profile,
 * certifications, lots, multi-farm packs, cycles). These touch the database but
 * have NO Next.js dependencies, mirroring src/lib/admin/core.ts. The server
 * actions in actions.ts perform auth/scope/revalidation and delegate here.
 *
 * The PERMISSION MATRIX (rules B/C) is enforced here AND re-checked in the
 * server actions, so the isolation tests can exercise it directly:
 *
 *   farm_manager:
 *     - self-edits ONLY their own offer's priceAmountCents + available units
 *       (applied live, NO review);
 *     - ALL other changes (farm profile/story/location/breed, certifications,
 *       new offers, lots, pack participation) are SUBMITTED to review and only
 *       go live after a platform_admin approves them;
 *     - sees ONLY their own farm's offers/lots/packs/orders.
 *   platform_admin:
 *     - acts on every farm; approves/publishes; edits "other information";
 *     - can NEVER force a farm's pack acceptance.
 *
 * AI never calls this module and never appears as an approver.
 */
import type { PrismaClient } from "@prisma/client";
import { validateLot, LotValidationError } from "@/lib/validateLot";

export type Role = "platform_admin" | "farm_manager" | "customer";

export interface Actor {
  id: string;
  role: Role;
  farmId: string | null;
}

export interface ManageResult {
  ok: boolean;
  code?: string;
  message?: string;
}

const FORBIDDEN: ManageResult = {
  ok: false,
  code: "FORBIDDEN",
  message: "Not permitted for this farm.",
};
const NOT_FOUND: ManageResult = {
  ok: false,
  code: "NOT_FOUND",
  message: "Record not found.",
};

/** True when the actor may act on records belonging to `farmId`. */
export function canActOnFarm(actor: Actor, farmId: string | null): boolean {
  if (actor.role === "platform_admin") return true;
  if (actor.role === "farm_manager") return !!farmId && actor.farmId === farmId;
  return false;
}

// ---------------------------------------------------------------------------
// OFFERS
// ---------------------------------------------------------------------------

export interface OfferSelfEditInput {
  priceAmountCents?: number;
  /** Available units are modelled on the offer's backing lot(s). We set the
   * units of the offer's most recent non-withdrawn lot, the "available units"
   * a farm manager controls day-to-day. */
  availableUnits?: number;
}

/**
 * The ONLY live edit a farm_manager may make without review: their own offer's
 * price and available units. Everything else on the offer must go through the
 * review queue (see applyOfferSubmitReview).
 */
export async function applyOfferSelfEdit(
  db: PrismaClient,
  actor: Actor,
  offerId: string,
  input: OfferSelfEditInput,
): Promise<ManageResult & { offerId?: string }> {
  const offer = await db.farmProductOffer.findUnique({ where: { id: offerId } });
  if (!offer) return NOT_FOUND;
  if (!canActOnFarm(actor, offer.farmId)) return FORBIDDEN;

  if (
    input.priceAmountCents !== undefined &&
    (!Number.isInteger(input.priceAmountCents) || input.priceAmountCents < 0)
  ) {
    return { ok: false, code: "BAD_PRICE", message: "Non-negative price required." };
  }
  if (
    input.availableUnits !== undefined &&
    (!Number.isInteger(input.availableUnits) || input.availableUnits < 0)
  ) {
    return { ok: false, code: "BAD_UNITS", message: "Non-negative units required." };
  }

  if (input.priceAmountCents !== undefined) {
    await db.farmProductOffer.update({
      where: { id: offerId },
      data: { priceAmountCents: input.priceAmountCents },
    });
  }

  if (input.availableUnits !== undefined) {
    const lot = await db.lot.findFirst({
      where: { farmProductOfferId: offerId, isWithdrawn: false },
      orderBy: { createdAt: "desc" },
    });
    if (lot) {
      await db.lot.update({
        where: { id: lot.id },
        data: { units: input.availableUnits },
      });
    }
  }

  return { ok: true, offerId };
}

/**
 * Any NON price/units change to an offer by a farm_manager is submitted to
 * review: the offer's lifecycle moves to pending_review (it is not published
 * until a platform_admin approves). A platform_admin may apply changes directly
 * (that path is a normal update elsewhere); here we model the review submission.
 */
export async function applyOfferSubmitReview(
  db: PrismaClient,
  actor: Actor,
  offerId: string,
): Promise<ManageResult> {
  const offer = await db.farmProductOffer.findUnique({ where: { id: offerId } });
  if (!offer) return NOT_FOUND;
  if (!canActOnFarm(actor, offer.farmId)) return FORBIDDEN;

  await db.farmProductOffer.update({
    where: { id: offerId },
    data: { lifecycle: "pending_review", isApproved: false, isActive: false },
  });
  return { ok: true };
}

export interface OfferCreateInput {
  farmId: string;
  productDefinitionId: string;
  publicName: string;
  priceAmountCents: number;
  priceUnit?: string;
  description?: string;
}

/**
 * Create a new farm offer. Farms CANNOT create definitions (decision 1): the
 * definition must already exist and be approved. A new offer ALWAYS lands in
 * pending_review (a farm_manager's new offer is never live without approval;
 * even a platform_admin-created offer starts in review and is approved through
 * the normal lifecycle so the audit trail is uniform).
 */
export async function applyOfferCreate(
  db: PrismaClient,
  actor: Actor,
  input: OfferCreateInput,
): Promise<ManageResult & { offerId?: string }> {
  if (!canActOnFarm(actor, input.farmId)) return FORBIDDEN;

  const def = await db.productDefinition.findUnique({
    where: { id: input.productDefinitionId },
  });
  if (!def) {
    return { ok: false, code: "NO_DEFINITION", message: "Definition not found." };
  }
  if (!def.isApproved) {
    return {
      ok: false,
      code: "DEFINITION_NOT_APPROVED",
      message: "The product definition is not approved.",
    };
  }
  const name = (input.publicName ?? "").trim();
  if (name.length === 0 || name.length > 120) {
    return { ok: false, code: "BAD_NAME", message: "Offer name required." };
  }
  if (!Number.isInteger(input.priceAmountCents) || input.priceAmountCents < 0) {
    return { ok: false, code: "BAD_PRICE", message: "Non-negative price required." };
  }

  const offer = await db.farmProductOffer.create({
    data: {
      farmId: input.farmId,
      productDefinitionId: input.productDefinitionId,
      publicName: name,
      description: input.description ?? "",
      priceAmountCents: input.priceAmountCents,
      priceUnit: input.priceUnit ?? "per_unit",
      currency: "EUR",
      lifecycle: "pending_review",
      isApproved: false,
      isActive: false,
      isTest: false,
    },
  });
  return { ok: true, offerId: offer.id };
}

// ---------------------------------------------------------------------------
// FARM PROFILE (review-gated for farm_manager; "other information" is
// platform-admin-only even through review)
// ---------------------------------------------------------------------------

/** Fields a farm_manager MAY propose (go through review). */
export const FARM_PROFILE_EDITABLE_FIELDS = [
  "name",
  "town",
  "comarca",
  "breed",
  "story",
  "productionMethod",
  "traceabilityInfo",
  "welfareInfo",
  "feedInfo",
  "locationDetail",
  "latitude",
  "longitude",
  "heroImageRef",
  "galleryRefs",
  "contactEmail",
  "contactPhone",
  "websiteUrl",
] as const;

/** Platform-admin-only field; never editable by a farm_manager. */
export const FARM_PLATFORM_ONLY_FIELDS = ["otherInformation"] as const;

function sanitiseProfileChanges(
  changes: Record<string, unknown>,
  allowPlatformOnly: boolean,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const allowed = new Set<string>(FARM_PROFILE_EDITABLE_FIELDS as readonly string[]);
  if (allowPlatformOnly) {
    for (const f of FARM_PLATFORM_ONLY_FIELDS) allowed.add(f);
  }
  for (const [k, v] of Object.entries(changes)) {
    if (allowed.has(k)) out[k] = v;
  }
  return out;
}

/**
 * A farm_manager SUBMITS profile edits to review; they are NOT applied live.
 * The proposed changes (minus any platform-only field, which is stripped) are
 * stored as a FarmProfileEdit row with status pending_review.
 */
export async function applyProfileSubmitReview(
  db: PrismaClient,
  actor: Actor,
  farmId: string,
  changes: Record<string, unknown>,
): Promise<ManageResult & { editId?: string }> {
  if (!canActOnFarm(actor, farmId)) return FORBIDDEN;
  const farm = await db.farm.findUnique({ where: { id: farmId } });
  if (!farm) return NOT_FOUND;

  // A farm_manager can never touch platform-only fields, even via review.
  const clean = sanitiseProfileChanges(changes, false);
  if (Object.keys(clean).length === 0) {
    return { ok: false, code: "NO_CHANGES", message: "No reviewable changes." };
  }

  const edit = await db.farmProfileEdit.create({
    data: {
      farmId,
      changes: JSON.stringify(clean),
      status: "pending_review",
      submittedByUserId: actor.id,
    },
  });
  return { ok: true, editId: edit.id };
}

/**
 * platform_admin edits the farm directly (including "other information").
 * Applied live. Non-platform actors are rejected even for allowed fields — a
 * farm_manager must go through applyProfileSubmitReview.
 */
export async function applyProfileDirectEdit(
  db: PrismaClient,
  actor: Actor,
  farmId: string,
  changes: Record<string, unknown>,
): Promise<ManageResult> {
  if (actor.role !== "platform_admin") return FORBIDDEN;
  const farm = await db.farm.findUnique({ where: { id: farmId } });
  if (!farm) return NOT_FOUND;
  const clean = sanitiseProfileChanges(changes, true);
  if (Object.keys(clean).length === 0) {
    return { ok: false, code: "NO_CHANGES", message: "No editable changes." };
  }
  await db.farm.update({ where: { id: farmId }, data: clean });
  return { ok: true };
}

/** platform_admin approves a submitted profile edit: apply it live. */
export async function applyProfileApprove(
  db: PrismaClient,
  actor: Actor,
  editId: string,
): Promise<ManageResult & { farmId?: string }> {
  if (actor.role !== "platform_admin") return FORBIDDEN;
  const edit = await db.farmProfileEdit.findUnique({ where: { id: editId } });
  if (!edit) return NOT_FOUND;
  if (edit.status !== "pending_review") {
    return { ok: false, code: "BAD_STATE", message: "Edit is not pending." };
  }
  const changes = sanitiseProfileChanges(JSON.parse(edit.changes), false);
  await db.farm.update({ where: { id: edit.farmId }, data: changes });
  await db.farmProfileEdit.update({
    where: { id: editId },
    data: {
      status: "approved",
      approvedByUserId: actor.id,
      approvedAt: new Date(),
    },
  });
  return { ok: true, farmId: edit.farmId };
}

export async function applyProfileReject(
  db: PrismaClient,
  actor: Actor,
  editId: string,
  reason?: string,
): Promise<ManageResult> {
  if (actor.role !== "platform_admin") return FORBIDDEN;
  const edit = await db.farmProfileEdit.findUnique({ where: { id: editId } });
  if (!edit) return NOT_FOUND;
  await db.farmProfileEdit.update({
    where: { id: editId },
    data: {
      status: "rejected",
      approvedByUserId: actor.id,
      rejectionReason: reason ?? "",
    },
  });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// CERTIFICATIONS (unverified claims NEVER public)
// ---------------------------------------------------------------------------

export interface CertSubmitInput {
  farmId: string;
  type: string;
  title: string;
  body?: string;
  evidenceRef?: string;
}

/**
 * Submit a certification claim with evidence. It enters pending_review and is
 * NEVER public until a platform_admin approves it. A farm_manager may submit
 * only for their own farm.
 */
export async function applyCertSubmit(
  db: PrismaClient,
  actor: Actor,
  input: CertSubmitInput,
): Promise<ManageResult & { certId?: string }> {
  if (!canActOnFarm(actor, input.farmId)) return FORBIDDEN;
  const farm = await db.farm.findUnique({ where: { id: input.farmId } });
  if (!farm) return NOT_FOUND;
  const title = (input.title ?? "").trim();
  if (title.length === 0 || title.length > 200) {
    return { ok: false, code: "BAD_TITLE", message: "Certification title required." };
  }
  const cert = await db.farmCertification.create({
    data: {
      farmId: input.farmId,
      type: (input.type ?? "other").trim() || "other",
      title,
      body: input.body ?? "",
      evidenceRef: input.evidenceRef ?? null,
      status: "pending_review",
      submittedByUserId: actor.id,
    },
  });
  return { ok: true, certId: cert.id };
}

/** platform_admin approves a certification: only then is it public. */
export async function applyCertApprove(
  db: PrismaClient,
  actor: Actor,
  certId: string,
): Promise<ManageResult> {
  if (actor.role !== "platform_admin") return FORBIDDEN;
  const cert = await db.farmCertification.findUnique({ where: { id: certId } });
  if (!cert) return NOT_FOUND;
  await db.farmCertification.update({
    where: { id: certId },
    data: {
      status: "approved",
      approvedByUserId: actor.id,
      approvedAt: new Date(),
    },
  });
  return { ok: true };
}

export async function applyCertReject(
  db: PrismaClient,
  actor: Actor,
  certId: string,
  reason?: string,
): Promise<ManageResult> {
  if (actor.role !== "platform_admin") return FORBIDDEN;
  const cert = await db.farmCertification.findUnique({ where: { id: certId } });
  if (!cert) return NOT_FOUND;
  await db.farmCertification.update({
    where: { id: certId },
    data: {
      status: "rejected",
      approvedByUserId: actor.id,
      rejectionReason: reason ?? "",
    },
  });
  return { ok: true };
}

/**
 * The PUBLIC read path for certifications: ONLY approved rows are ever exposed.
 * Any other status (draft/pending_review/rejected) is invisible to the public.
 */
export async function listPublicCertifications(
  db: PrismaClient,
  farmId: string,
): Promise<Array<{ id: string; type: string; title: string; body: string }>> {
  const rows = await db.farmCertification.findMany({
    where: { farmId, status: "approved" },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((r) => ({ id: r.id, type: r.type, title: r.title, body: r.body }));
}

// ---------------------------------------------------------------------------
// MEDIA (farm-uploaded images; submitted then approved, mirroring certs)
//
// A farm_manager uploads an image for their own OFFER or their FARM PROFILE
// (hero / gallery). When MEDIA_REQUIRES_APPROVAL is true (default) the path is
// written to a pending* field and only copied to the public field by a
// platform_admin approval. When the switch is false, uploads land directly on
// the public field. All of this reads the single MEDIA_REQUIRES_APPROVAL switch
// in src/lib/media.ts, so flipping the policy is a one-line change there.
//
// The file itself is written by the server action (it has the bytes); these
// pure functions only move the stored PATH between pending* and public fields,
// enforcing farm scope and platform-admin-only approval. AI never calls these.
// ---------------------------------------------------------------------------

/** Which media slot an upload/approval targets. */
export type MediaTarget = "offer_image" | "farm_hero" | "farm_gallery";

/**
 * Record a farm_manager/platform_admin image upload. `storedPath` is the
 * already-validated, already-written relative path (e.g. "/uploads/<id>.jpg").
 * When `requiresApproval` is true, the path is stored to the pending* field;
 * otherwise it is published directly. Farm scope is enforced via canActOnFarm.
 *
 * For "farm_gallery" the pending/public field holds a JSON array of paths; the
 * new path is appended to the appropriate (pending or public) array.
 */
export async function applyMediaUpload(
  db: PrismaClient,
  actor: Actor,
  args: {
    target: MediaTarget;
    /** Offer id for offer_image; farm id for farm_hero/farm_gallery. */
    targetId: string;
    storedPath: string;
    requiresApproval: boolean;
  },
): Promise<ManageResult & { pending?: boolean }> {
  const { target, targetId, storedPath, requiresApproval } = args;
  if (!storedPath || typeof storedPath !== "string") {
    return { ok: false, code: "BAD_PATH", message: "Missing stored path." };
  }

  if (target === "offer_image") {
    const offer = await db.farmProductOffer.findUnique({ where: { id: targetId } });
    if (!offer) return NOT_FOUND;
    if (!canActOnFarm(actor, offer.farmId)) return FORBIDDEN;
    await db.farmProductOffer.update({
      where: { id: targetId },
      data: requiresApproval
        ? { pendingImageRef: storedPath }
        : { imageRef: storedPath, pendingImageRef: null },
    });
    return { ok: true, pending: requiresApproval };
  }

  // Farm profile media (hero / gallery).
  const farm = await db.farm.findUnique({ where: { id: targetId } });
  if (!farm) return NOT_FOUND;
  if (!canActOnFarm(actor, farm.id)) return FORBIDDEN;

  if (target === "farm_hero") {
    await db.farm.update({
      where: { id: targetId },
      data: requiresApproval
        ? { pendingHeroImageRef: storedPath }
        : { heroImageRef: storedPath, pendingHeroImageRef: null },
    });
    return { ok: true, pending: requiresApproval };
  }

  // farm_gallery: append to the relevant JSON-array field.
  const field = requiresApproval ? "pendingGalleryRefs" : "galleryRefs";
  const current = parseRefArray(farm[field]);
  current.push(storedPath);
  await db.farm.update({
    where: { id: targetId },
    data: { [field]: JSON.stringify(current) },
  });
  return { ok: true, pending: requiresApproval };
}

/** Parse a nullable JSON-array string of image refs; tolerant of bad data. */
function parseRefArray(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/**
 * platform_admin approves submitted media: move pending* -> public field.
 * For the gallery, the pending array is merged into the public array and the
 * pending array cleared. Only a platform_admin may approve.
 */
export async function applyMediaApprove(
  db: PrismaClient,
  actor: Actor,
  args: { target: MediaTarget; targetId: string },
): Promise<ManageResult> {
  if (actor.role !== "platform_admin") return FORBIDDEN;
  const { target, targetId } = args;

  if (target === "offer_image") {
    const offer = await db.farmProductOffer.findUnique({ where: { id: targetId } });
    if (!offer) return NOT_FOUND;
    if (!offer.pendingImageRef) {
      return { ok: false, code: "NO_PENDING", message: "No pending image." };
    }
    await db.farmProductOffer.update({
      where: { id: targetId },
      data: { imageRef: offer.pendingImageRef, pendingImageRef: null },
    });
    return { ok: true };
  }

  const farm = await db.farm.findUnique({ where: { id: targetId } });
  if (!farm) return NOT_FOUND;

  if (target === "farm_hero") {
    if (!farm.pendingHeroImageRef) {
      return { ok: false, code: "NO_PENDING", message: "No pending image." };
    }
    await db.farm.update({
      where: { id: targetId },
      data: { heroImageRef: farm.pendingHeroImageRef, pendingHeroImageRef: null },
    });
    return { ok: true };
  }

  // farm_gallery: merge pending into public, then clear pending.
  const pending = parseRefArray(farm.pendingGalleryRefs);
  if (pending.length === 0) {
    return { ok: false, code: "NO_PENDING", message: "No pending gallery media." };
  }
  const publicRefs = parseRefArray(farm.galleryRefs);
  const merged = [...publicRefs, ...pending];
  await db.farm.update({
    where: { id: targetId },
    data: { galleryRefs: JSON.stringify(merged), pendingGalleryRefs: null },
  });
  return { ok: true };
}

/**
 * platform_admin rejects submitted media: clear the pending* field (the public
 * value, if any, is untouched). Only a platform_admin may reject.
 */
export async function applyMediaReject(
  db: PrismaClient,
  actor: Actor,
  args: { target: MediaTarget; targetId: string },
): Promise<ManageResult> {
  if (actor.role !== "platform_admin") return FORBIDDEN;
  const { target, targetId } = args;

  if (target === "offer_image") {
    const offer = await db.farmProductOffer.findUnique({ where: { id: targetId } });
    if (!offer) return NOT_FOUND;
    await db.farmProductOffer.update({
      where: { id: targetId },
      data: { pendingImageRef: null },
    });
    return { ok: true };
  }

  const farm = await db.farm.findUnique({ where: { id: targetId } });
  if (!farm) return NOT_FOUND;
  if (target === "farm_hero") {
    await db.farm.update({
      where: { id: targetId },
      data: { pendingHeroImageRef: null },
    });
    return { ok: true };
  }
  await db.farm.update({
    where: { id: targetId },
    data: { pendingGalleryRefs: null },
  });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// LOTS (traceability changes require approval for farm_manager)
// ---------------------------------------------------------------------------

export interface LotCreateInput {
  farmId: string;
  farmProductOfferId: string;
  reference: string;
  units: number;
  slaughterDate: string | Date;
  cuttingDate: string | Date;
  packingDate: string | Date;
  expiryDate: string | Date;
}

/**
 * Create a lot against an OFFER (the two-level model). Enforces
 * offer-belongs-to-farm, date ordering, unique reference and units>=0 via the
 * shared validateLot guard (adapted to offers). A farm_manager creating a lot
 * is a traceability change: the lot is created but the backing offer is moved to
 * pending_review so the new traceability goes through approval before the offer
 * is (re)published. A platform_admin's lot does not demote the offer.
 */
export async function applyLotCreate(
  db: PrismaClient,
  actor: Actor,
  input: LotCreateInput,
): Promise<ManageResult & { lotId?: string }> {
  if (!canActOnFarm(actor, input.farmId)) return FORBIDDEN;

  const offer = await db.farmProductOffer.findUnique({
    where: { id: input.farmProductOfferId },
  });
  if (!offer) {
    return { ok: false, code: "NO_OFFER", message: "Offer not found." };
  }
  if (offer.farmId !== input.farmId) {
    return {
      ok: false,
      code: "FARM_MISMATCH",
      message: "Offer does not belong to this farm.",
    };
  }

  const existing = await db.lot.findMany({ select: { reference: true } });
  const lotInput = {
    farmId: input.farmId,
    // validateLot uses productId to assert the farm match; for the offer path we
    // assert against the offer id instead.
    productId: input.farmProductOfferId,
    reference: (input.reference ?? "").trim(),
    units: input.units,
    slaughterDate: new Date(input.slaughterDate),
    cuttingDate: new Date(input.cuttingDate),
    packingDate: new Date(input.packingDate),
    expiryDate: new Date(input.expiryDate),
  };
  try {
    validateLot(lotInput, {
      product: { id: input.farmProductOfferId, farmId: input.farmId },
      existingReferences: existing.map((l) => l.reference),
    });
  } catch (err) {
    if (err instanceof LotValidationError) {
      return { ok: false, code: err.code, message: err.message };
    }
    throw err;
  }

  const lot = await db.lot.create({
    data: {
      farmId: input.farmId,
      farmProductOfferId: input.farmProductOfferId,
      reference: lotInput.reference,
      units: lotInput.units,
      slaughterDate: lotInput.slaughterDate,
      cuttingDate: lotInput.cuttingDate,
      packingDate: lotInput.packingDate,
      expiryDate: lotInput.expiryDate,
      isWithdrawn: false,
      isTest: false,
    },
  });

  // A farm_manager's new traceability goes through review: demote the offer.
  if (actor.role === "farm_manager") {
    await db.farmProductOffer.update({
      where: { id: input.farmProductOfferId },
      data: { lifecycle: "pending_review", isApproved: false, isActive: false },
    });
  }

  return { ok: true, lotId: lot.id };
}

// ---------------------------------------------------------------------------
// MULTI-FARM PACKS (dual-accept)
// ---------------------------------------------------------------------------

export interface PackCreateInput {
  publicName: string;
  description?: string;
  priceAmountCents?: number;
  isMultiFarm?: boolean;
  /** Owning farm for a single-farm pack (null for multi-farm). */
  farmId?: string | null;
  items: Array<{ farmProductOfferId: string; quantity: number; lotId?: string }>;
}

/**
 * Create a pack from offers. For each participating farm a PackFarmAcceptance
 * row is seeded (accepted=false). isMultiFarm is derived from the distinct farm
 * set when not explicitly provided. The owning farm of a single-farm pack is
 * auto-accepted (it created it); multi-farm participants must each accept.
 */
export async function applyPackCreate(
  db: PrismaClient,
  actor: Actor,
  input: PackCreateInput,
): Promise<ManageResult & { packId?: string }> {
  const name = (input.publicName ?? "").trim();
  if (name.length === 0 || name.length > 120) {
    return { ok: false, code: "BAD_NAME", message: "Pack name required." };
  }
  if (!input.items || input.items.length === 0) {
    return { ok: false, code: "NO_ITEMS", message: "A pack needs at least one item." };
  }

  // Resolve each offer -> farm; validate scope.
  const offerIds = input.items.map((i) => i.farmProductOfferId);
  const offers = await db.farmProductOffer.findMany({
    where: { id: { in: offerIds } },
  });
  if (offers.length !== new Set(offerIds).size) {
    return { ok: false, code: "NO_OFFER", message: "One or more offers not found." };
  }
  const offerById = new Map(offers.map((o) => [o.id, o]));
  const farmIds = Array.from(new Set(offers.map((o) => o.farmId)));
  const isMultiFarm = input.isMultiFarm ?? farmIds.length > 1;

  // A farm_manager can only build packs from their own farm's offers.
  if (actor.role === "farm_manager") {
    for (const fid of farmIds) {
      if (!canActOnFarm(actor, fid)) return FORBIDDEN;
    }
  }

  const pack = await db.pack.create({
    data: {
      farmId: isMultiFarm ? null : input.farmId ?? farmIds[0] ?? null,
      isMultiFarm,
      publicName: name,
      description: input.description ?? "",
      priceAmountCents: input.priceAmountCents ?? 0,
      lifecycle: "draft",
      isApproved: false,
      isActive: false,
      isTest: false,
    },
  });

  for (const item of input.items) {
    const offer = offerById.get(item.farmProductOfferId)!;
    await db.packItemV2.create({
      data: {
        packId: pack.id,
        farmProductOfferId: offer.id,
        farmId: offer.farmId,
        lotId: item.lotId ?? null,
        quantity: item.quantity > 0 ? item.quantity : 1,
      },
    });
  }

  // Seed one acceptance row per participating farm. A single-farm pack's owner
  // is auto-accepted (it created the pack). Multi-farm participants start false.
  for (const fid of farmIds) {
    const autoAccept = !isMultiFarm;
    await db.packFarmAcceptance.create({
      data: {
        packId: pack.id,
        farmId: fid,
        accepted: autoAccept,
        acceptedByUserId: autoAccept ? actor.id : null,
        acceptedAt: autoAccept ? new Date() : null,
      },
    });
  }

  return { ok: true, packId: pack.id };
}

/**
 * A farm accepts its participation in a pack. ONLY that farm's manager (or a
 * platform_admin acting as that farm — which we DISALLOW to honour "platform
 * admin cannot force a farm's acceptance") may accept. We enforce that a
 * platform_admin cannot force-accept another farm: acceptance is recorded only
 * when the actor is the farm_manager of `farmId`.
 */
export async function applyPackAccept(
  db: PrismaClient,
  actor: Actor,
  packId: string,
  farmId: string,
): Promise<ManageResult> {
  const acceptance = await db.packFarmAcceptance.findUnique({
    where: { packId_farmId: { packId, farmId } },
  });
  if (!acceptance) return NOT_FOUND;

  // A platform_admin may NOT force a farm's acceptance: only the farm_manager of
  // that farm can accept on its behalf.
  if (!(actor.role === "farm_manager" && actor.farmId === farmId)) {
    return {
      ok: false,
      code: "CANNOT_FORCE_ACCEPT",
      message: "Only the participating farm can accept its participation.",
    };
  }

  await db.packFarmAcceptance.update({
    where: { packId_farmId: { packId, farmId } },
    data: {
      accepted: true,
      acceptedByUserId: actor.id,
      acceptedAt: new Date(),
      declinedReason: null,
    },
  });
  return { ok: true };
}

export async function applyPackDecline(
  db: PrismaClient,
  actor: Actor,
  packId: string,
  farmId: string,
  reason?: string,
): Promise<ManageResult> {
  const acceptance = await db.packFarmAcceptance.findUnique({
    where: { packId_farmId: { packId, farmId } },
  });
  if (!acceptance) return NOT_FOUND;
  if (!(actor.role === "farm_manager" && actor.farmId === farmId)) {
    return { ok: false, code: "CANNOT_FORCE", message: "Only the farm can decline." };
  }
  await db.packFarmAcceptance.update({
    where: { packId_farmId: { packId, farmId } },
    data: { accepted: false, declinedReason: reason ?? "" },
  });
  return { ok: true };
}

export interface PackPublishGate {
  canPublish: boolean;
  reasons: string[];
  participatingFarms: number;
  acceptedFarms: number;
}

/**
 * Evaluate whether a pack may go live. A multi-farm pack requires EVERY
 * participating farm's acceptance=true. The gate ALSO requires every referenced
 * offer to be approved+active. Pure read; no mutation.
 */
export async function evaluatePackPublishGate(
  db: PrismaClient,
  packId: string,
): Promise<PackPublishGate> {
  const pack = await db.pack.findUnique({
    where: { id: packId },
    include: {
      items: { include: { offer: true } },
      acceptances: true,
    },
  });
  if (!pack) {
    return { canPublish: false, reasons: ["not_found"], participatingFarms: 0, acceptedFarms: 0 };
  }
  const reasons: string[] = [];
  const participating = pack.acceptances.length;
  const accepted = pack.acceptances.filter((a) => a.accepted).length;

  if (pack.isMultiFarm && accepted < participating) {
    reasons.push("awaiting_farm_acceptance");
  }
  const offersApprovedActive = pack.items.every(
    (i) => i.offer.isApproved && i.offer.isActive,
  );
  if (!offersApprovedActive) {
    reasons.push("offers_not_approved_active");
  }
  if (pack.items.length === 0) reasons.push("no_items");

  return {
    canPublish: reasons.length === 0,
    reasons,
    participatingFarms: participating,
    acceptedFarms: accepted,
  };
}

/**
 * Publish a pack (platform_admin only). Enforces the dual-accept + offers gate.
 * On success the pack becomes approved+active.
 */
export async function applyPackPublish(
  db: PrismaClient,
  actor: Actor,
  packId: string,
): Promise<ManageResult> {
  if (actor.role !== "platform_admin") return FORBIDDEN;
  const gate = await evaluatePackPublishGate(db, packId);
  if (!gate.canPublish) {
    return {
      ok: false,
      code: "PUBLISH_BLOCKED",
      message: `Cannot publish: ${gate.reasons.join(", ")}.`,
    };
  }
  await db.pack.update({
    where: { id: packId },
    data: { lifecycle: "active", isApproved: true, isActive: true },
  });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// CYCLES
// ---------------------------------------------------------------------------

/** True when reservations are blocked (the cycle's close timestamp has passed
 * or its status is not open). */
export function isCycleClosed(
  cycle: { status: string | null; closeAt: Date | null; closeDate: Date },
  now: Date = new Date(),
): boolean {
  if (cycle.status && cycle.status !== "open") return true;
  const close = cycle.closeAt ?? cycle.closeDate;
  return now.getTime() > close.getTime();
}

export async function applyCycleTransition(
  db: PrismaClient,
  actor: Actor,
  cycleId: string,
  toStatus: "open" | "closed" | "fulfilling" | "fulfilled" | "cancelled" | "archived",
): Promise<ManageResult & { from?: string }> {
  if (actor.role !== "platform_admin") return FORBIDDEN;
  const cycle = await db.reservationCycle.findUnique({ where: { id: cycleId } });
  if (!cycle) return NOT_FOUND;
  const from = cycle.status ?? "open";
  await db.reservationCycle.update({
    where: { id: cycleId },
    data: {
      status: toStatus,
      isActive: toStatus === "open",
      closeAt:
        toStatus === "closed" && !cycle.closeAt ? new Date() : cycle.closeAt,
    },
  });
  return { ok: true, from };
}

export async function applyCycleAddFarm(
  db: PrismaClient,
  actor: Actor,
  cycleId: string,
  farmId: string,
  allocatedPlaces?: number,
): Promise<ManageResult> {
  if (actor.role !== "platform_admin") return FORBIDDEN;
  const cycle = await db.reservationCycle.findUnique({ where: { id: cycleId } });
  if (!cycle) return NOT_FOUND;
  await db.cycleFarm.upsert({
    where: { cycleId_farmId: { cycleId, farmId } },
    create: { cycleId, farmId, allocatedPlaces: allocatedPlaces ?? null },
    update: { allocatedPlaces: allocatedPlaces ?? null },
  });
  return { ok: true };
}

export async function applyCycleRemoveFarm(
  db: PrismaClient,
  actor: Actor,
  cycleId: string,
  farmId: string,
): Promise<ManageResult> {
  if (actor.role !== "platform_admin") return FORBIDDEN;
  await db.cycleFarm.deleteMany({ where: { cycleId, farmId } });
  return { ok: true };
}

/**
 * Populate CycleOfferAvailability for a cycle from each offer that has a usable
 * (non-withdrawn, in-stock) lot. Offers WITHOUT an eligible lot are recorded
 * with hasEligibleLot=false so the cycle screen can surface them. Returns the
 * number of offers with/without an eligible lot. Pure backfill (M6).
 */
export async function populateCycleOfferAvailability(
  db: PrismaClient,
  cycleId: string,
): Promise<{ eligible: number; ineligible: number }> {
  const offers = await db.farmProductOffer.findMany({
    where: { isApproved: true },
  });
  let eligible = 0;
  let ineligible = 0;
  for (const offer of offers) {
    const lot = await db.lot.findFirst({
      where: {
        farmProductOfferId: offer.id,
        isWithdrawn: false,
        units: { gt: 0 },
      },
      orderBy: { expiryDate: "desc" },
    });
    const hasEligibleLot = !!lot;
    if (hasEligibleLot) eligible++;
    else ineligible++;
    await db.cycleOfferAvailability.upsert({
      where: {
        cycleId_farmProductOfferId: {
          cycleId,
          farmProductOfferId: offer.id,
        },
      },
      create: {
        cycleId,
        farmProductOfferId: offer.id,
        farmId: offer.farmId,
        lotId: lot?.id ?? null,
        hasEligibleLot,
      },
      update: { lotId: lot?.id ?? null, hasEligibleLot },
    });
  }
  return { eligible, ineligible };
}
