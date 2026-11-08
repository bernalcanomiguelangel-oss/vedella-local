/**
 * Pure, testable admin operations that touch the database but have NO Next.js
 * dependencies (no cookies, no revalidatePath, no "use server"). The server
 * actions in actions.ts handle auth/scope/revalidation and then delegate here,
 * so the state-changing logic can be unit/integration tested directly against a
 * real SQLite database.
 *
 * Authorisation is NOT performed here — callers (the server actions) must have
 * already checked role + farm scope. These functions assume a vetted request.
 */
import type { PrismaClient } from "@prisma/client";
import { planTransition, LifecycleError } from "./lifecycle";
import { validateLot, LotValidationError } from "@/lib/validateLot";

export interface CoreResult {
  ok: boolean;
  code?: string;
  message?: string;
}

export async function applyLifecycleTransition(
  db: PrismaClient,
  entityType: "farm" | "product",
  entityId: string,
  toState: string,
): Promise<CoreResult & { from?: string; to?: string }> {
  // entityType "product" resolves to either a legacy Product OR a
  // FarmProductOffer (the review queue surfaces offers under the "product"
  // type). We try Product first, then fall back to the offer so the offer-model
  // approval path (M8) actually transitions the offer that the public read path
  // renders. "farm" resolves to a Farm.
  let current:
    | { lifecycle: string; kind: "farm" | "product" | "offer" }
    | null = null;
  if (entityType === "farm") {
    const farm = await db.farm.findUnique({ where: { id: entityId } });
    current = farm ? { lifecycle: farm.lifecycle, kind: "farm" } : null;
  } else {
    const product = await db.product.findUnique({ where: { id: entityId } });
    if (product) {
      current = { lifecycle: product.lifecycle, kind: "product" };
    } else {
      const offer = await db.farmProductOffer.findUnique({
        where: { id: entityId },
      });
      current = offer ? { lifecycle: offer.lifecycle, kind: "offer" } : null;
    }
  }
  if (!current) return { ok: false, code: "NOT_FOUND", message: "Record not found." };

  let flags;
  try {
    flags = planTransition(current.lifecycle, toState);
  } catch (err) {
    if (err instanceof LifecycleError) {
      return { ok: false, code: err.code, message: err.message };
    }
    throw err;
  }

  const data = {
    lifecycle: flags.lifecycle,
    isApproved: flags.isApproved,
    isActive: flags.isActive,
  };
  if (current.kind === "farm") {
    await db.farm.update({ where: { id: entityId }, data });
  } else if (current.kind === "offer") {
    await db.farmProductOffer.update({ where: { id: entityId }, data });
  } else {
    await db.product.update({ where: { id: entityId }, data });
  }
  return { ok: true, from: current.lifecycle, to: flags.lifecycle };
}

export async function applyApproveTranslation(
  db: PrismaClient,
  translationId: string,
  editedText?: string,
): Promise<CoreResult> {
  const row = await db.translation.findUnique({ where: { id: translationId } });
  if (!row) return { ok: false, code: "NOT_FOUND" };
  const text = editedText?.trim();
  if (editedText !== undefined && (!text || text.length > 5000)) {
    return { ok: false, code: "BAD_TEXT" };
  }
  await db.translation.update({
    where: { id: translationId },
    data: {
      status: "approved",
      text: text ?? row.text,
      source: `${row.source}+human-${text ? "edited" : "approved"}`,
    },
  });
  return { ok: true };
}

export async function applyRejectTranslation(
  db: PrismaClient,
  translationId: string,
): Promise<CoreResult> {
  const row = await db.translation.findUnique({ where: { id: translationId } });
  if (!row) return { ok: false, code: "NOT_FOUND" };
  await db.translation.delete({ where: { id: translationId } });
  return { ok: true };
}

export interface ReceiptCreateInput {
  farmId: string;
  productName: string;
  productKind: "cut" | "pack";
  basePriceCents: number;
  lotReference: string;
  units: number;
  slaughterDate: string;
  cuttingDate: string;
  packingDate: string;
  expiryDate: string;
  weight?: string;
  thickness?: string;
  maturation?: string;
  packaging?: string;
  shelfLife?: string;
}

export async function applyCreateFromReceipt(
  db: PrismaClient,
  input: ReceiptCreateInput,
): Promise<CoreResult & { productId?: string; lotId?: string }> {
  const farm = await db.farm.findUnique({ where: { id: input.farmId } });
  if (!farm) return { ok: false, code: "NOT_FOUND", message: "Farm not found." };

  const name = (input.productName ?? "").trim();
  if (name.length === 0 || name.length > 120) {
    return { ok: false, code: "BAD_NAME", message: "Product name required." };
  }
  if (!Number.isInteger(input.basePriceCents) || input.basePriceCents < 0) {
    return { ok: false, code: "BAD_PRICE", message: "Non-negative price required." };
  }

  const product = await db.product.create({
    data: {
      farmId: input.farmId,
      kind: input.productKind,
      name,
      description: "",
      basePriceCents: input.basePriceCents,
      weight: input.weight || null,
      thickness: input.thickness || null,
      maturation: input.maturation || null,
      packaging: input.packaging || null,
      shelfLife: input.shelfLife || null,
      // Receipt-created records ALWAYS land in pending_review — never approved,
      // never active. A human must still move them through the review queue.
      lifecycle: "pending_review",
      isApproved: false,
      isActive: false,
      isTest: false,
    },
  });

  const existing = await db.lot.findMany({ select: { reference: true } });
  const lotInput = {
    farmId: input.farmId,
    productId: product.id,
    reference: (input.lotReference ?? "").trim(),
    units: input.units,
    slaughterDate: new Date(input.slaughterDate),
    cuttingDate: new Date(input.cuttingDate),
    packingDate: new Date(input.packingDate),
    expiryDate: new Date(input.expiryDate),
  };

  try {
    validateLot(lotInput, {
      product: { id: product.id, farmId: input.farmId },
      existingReferences: existing.map((l) => l.reference),
    });
  } catch (err) {
    await db.product.delete({ where: { id: product.id } });
    if (err instanceof LotValidationError) {
      return { ok: false, code: err.code, message: err.message };
    }
    throw err;
  }

  const lot = await db.lot.create({
    data: { ...lotInput, isWithdrawn: false, isTest: false },
  });

  return { ok: true, productId: product.id, lotId: lot.id };
}
