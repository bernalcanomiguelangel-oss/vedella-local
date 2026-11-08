/**
 * Admin-area data loaders. These apply role scoping on the server:
 *  - platform_admin sees ALL farms/products/translations.
 *  - farm_manager sees ONLY their own farm's records.
 *
 * Every loader takes the authenticated SessionUser and narrows the query by the
 * user's visible farm scope. A customer never reaches these (gating happens in
 * the page via requireAdmin).
 */
import { prisma } from "@/lib/db";
import { formatCents } from "@/lib/pricing";
import type { SessionUser } from "@/lib/auth";
import { visibleFarmScope } from "@/lib/auth";

export interface AdminFarmRow {
  id: string;
  slug: string;
  name: string;
  lifecycle: string;
  isApproved: boolean;
  isActive: boolean;
  isTest: boolean;
}

export interface AdminProductRow {
  id: string;
  name: string;
  kind: string;
  priceLabel: string;
  lifecycle: string;
  isApproved: boolean;
  isActive: boolean;
  isTest: boolean;
  farmId: string;
  farmName: string;
}

export interface PendingTranslationRow {
  id: string;
  entityType: string;
  entityId: string;
  field: string;
  locale: string;
  text: string;
  status: string;
  /** The base (ca) source text for side-by-side review, when resolvable. */
  sourceText: string | null;
  farmId: string | null;
  farmName: string | null;
}

/** Build a Prisma `where` that respects the user's farm scope for Farm. */
function farmScopeWhere(user: SessionUser) {
  const scope = visibleFarmScope(user);
  if (scope === null) return {}; // platform_admin: all
  if (scope.length === 0) return { id: "__none__" }; // no access
  return { id: { in: scope } };
}

/** Build a Prisma `where` that respects the user's farm scope for Product/Lot. */
function productScopeWhere(user: SessionUser) {
  const scope = visibleFarmScope(user);
  if (scope === null) return {};
  if (scope.length === 0) return { farmId: "__none__" };
  return { farmId: { in: scope } };
}

/**
 * Build a Prisma `where` that respects the user's farm scope for
 * FarmProductOffer / Lot (both carry a `farmId`). A FarmProductOffer belongs to
 * exactly one farm, so a farm_manager only ever reads/writes their own offers.
 * `null` scope (platform_admin) returns an unfiltered `where`.
 */
export function offerScopeWhere(user: SessionUser) {
  const scope = visibleFarmScope(user);
  if (scope === null) return {};
  if (scope.length === 0) return { farmId: "__none__" };
  return { farmId: { in: scope } };
}

export interface AdminOfferRow {
  id: string;
  publicName: string;
  definitionName: string;
  priceLabel: string;
  priceUnit: string;
  lifecycle: string;
  isApproved: boolean;
  isActive: boolean;
  isTest: boolean;
  needsReview: boolean;
  farmId: string;
  farmName: string;
}

/**
 * Farm product offers visible to this user. A farm_manager sees ONLY their own
 * farm's offers; a platform_admin sees every farm's. This is the offer-aware
 * counterpart to listAdminProducts for the two-level product model.
 */
export async function listAdminOffers(
  user: SessionUser,
): Promise<AdminOfferRow[]> {
  const offers = await prisma.farmProductOffer.findMany({
    where: offerScopeWhere(user),
    include: { farm: true, productDefinition: true },
    orderBy: [{ farmId: "asc" }, { publicName: "asc" }],
  });
  return offers.map((o) => ({
    id: o.id,
    publicName: o.publicName,
    definitionName: o.productDefinition.canonicalName,
    priceLabel: formatCents(o.priceAmountCents),
    priceUnit: o.priceUnit,
    lifecycle: o.lifecycle,
    isApproved: o.isApproved,
    isActive: o.isActive,
    isTest: o.isTest,
    needsReview: o.lifecycle === "pending_review",
    farmId: o.farmId,
    farmName: o.farm.name,
  }));
}

export async function listAdminFarms(user: SessionUser): Promise<AdminFarmRow[]> {
  const farms = await prisma.farm.findMany({
    where: farmScopeWhere(user),
    orderBy: { name: "asc" },
  });
  return farms.map((f) => ({
    id: f.id,
    slug: f.slug,
    name: f.name,
    lifecycle: f.lifecycle,
    isApproved: f.isApproved,
    isActive: f.isActive,
    isTest: f.isTest,
  }));
}

export async function listAdminProducts(
  user: SessionUser,
): Promise<AdminProductRow[]> {
  const products = await prisma.product.findMany({
    where: productScopeWhere(user),
    include: { farm: true },
    orderBy: [{ farmId: "asc" }, { name: "asc" }],
  });
  return products.map((p) => ({
    id: p.id,
    name: p.name,
    kind: p.kind,
    priceLabel: formatCents(p.basePriceCents),
    lifecycle: p.lifecycle,
    isApproved: p.isApproved,
    isActive: p.isActive,
    isTest: p.isTest,
    farmId: p.farmId,
    farmName: p.farm.name,
  }));
}

/**
 * Records awaiting human review: farms and products in `pending_review`, scoped
 * to the user's farms.
 */
export async function listPendingRecords(user: SessionUser): Promise<{
  farms: AdminFarmRow[];
  products: AdminProductRow[];
}> {
  const farms = (await listAdminFarms(user)).filter(
    (f) => f.lifecycle === "pending_review",
  );
  const products = (await listAdminProducts(user)).filter(
    (p) => p.lifecycle === "pending_review",
  );
  return { farms, products };
}

/**
 * Machine (AI) translations awaiting human review. A platform_admin approves or
 * rejects them. Scoped to the user's farms where the translation's entity is a
 * farm or product. Only rows with status `machine` or `in_review` are listed
 * (already-approved rows are published; they are not in the queue).
 */
export async function listPendingTranslations(
  user: SessionUser,
): Promise<PendingTranslationRow[]> {
  const rows = await prisma.translation.findMany({
    where: { status: { in: ["machine", "in_review"] } },
    orderBy: { createdAt: "desc" },
  });

  // Resolve the owning farm for scope + display, plus the ca source text.
  const scope = visibleFarmScope(user);
  const out: PendingTranslationRow[] = [];

  for (const r of rows) {
    let farmId: string | null = null;
    let farmName: string | null = null;
    let sourceText: string | null = null;

    if (r.entityType === "farm") {
      const farm = await prisma.farm.findUnique({ where: { id: r.entityId } });
      if (farm) {
        farmId = farm.id;
        farmName = farm.name;
        sourceText = (farm as Record<string, unknown>)[r.field] as string | undefined ?? null;
      }
    } else if (r.entityType === "product" || r.entityType === "pack") {
      const product = await prisma.product.findUnique({
        where: { id: r.entityId },
        include: { farm: true },
      });
      if (product) {
        farmId = product.farmId;
        farmName = product.farm.name;
        sourceText =
          (product as Record<string, unknown>)[r.field] as string | undefined ?? null;
      }
    }

    // Apply farm scope: farm_manager only sees their own farm's translations.
    if (scope !== null) {
      if (scope.length === 0) continue;
      if (!farmId || !scope.includes(farmId)) continue;
    }

    out.push({
      id: r.id,
      entityType: r.entityType,
      entityId: r.entityId,
      field: r.field,
      locale: r.locale,
      text: r.text,
      status: r.status,
      sourceText,
      farmId,
      farmName,
    });
  }

  return out;
}
