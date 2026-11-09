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

// ---------------------------------------------------------------------------
// FEAT-004 loaders: farm detail, offers grouped by definition, lots, packs,
// cycles, orders, and the extended review queue.
// ---------------------------------------------------------------------------

/** Full farm detail with the structured profile, certifications and a
 * public-readiness panel. Scoped: a farm_manager only loads their own farm. */
export async function getAdminFarmDetail(user: SessionUser, farmId: string) {
  if (!canReadFarm(user, farmId)) return null;
  const farm = await prisma.farm.findUnique({
    where: { id: farmId },
    include: {
      certifications: { orderBy: { createdAt: "desc" } },
      profileEdits: {
        where: { status: "pending_review" },
        orderBy: { createdAt: "desc" },
      },
      offers: { include: { lots: true } },
    },
  });
  if (!farm) return null;

  // Public readiness: approved + active + not test + at least one active offer
  // backed by an eligible (non-withdrawn, in-stock) lot.
  const hasEligibleOffer = farm.offers.some(
    (o) =>
      o.isApproved &&
      o.isActive &&
      !o.isTest &&
      o.lots.some((l) => !l.isWithdrawn && l.units > 0),
  );
  const readiness = {
    approved: farm.isApproved,
    active: farm.isActive,
    notTest: !farm.isTest,
    hasEligibleOffer,
    publicReady:
      farm.isApproved && farm.isActive && !farm.isTest && hasEligibleOffer,
  };
  const approvedCertCount = farm.certifications.filter(
    (c) => c.status === "approved",
  ).length;
  return { farm, readiness, approvedCertCount };
}

function canReadFarm(user: SessionUser, farmId: string): boolean {
  const scope = visibleFarmScope(user);
  if (scope === null) return true;
  return scope.includes(farmId);
}

/** Offers grouped by definition, side-by-side per farm WITHOUT merging. */
export async function listOffersGroupedByDefinition(user: SessionUser) {
  const offers = await prisma.farmProductOffer.findMany({
    where: offerScopeWhere(user),
    include: { farm: true, productDefinition: true },
    orderBy: [{ productDefinitionId: "asc" }, { farmId: "asc" }],
  });
  const groups = new Map<
    string,
    {
      definitionId: string;
      definitionName: string;
      offers: Array<{
        id: string;
        farmId: string;
        farmName: string;
        publicName: string;
        priceLabel: string;
        priceAmountCents: number;
        lifecycle: string;
        isApproved: boolean;
        isActive: boolean;
      }>;
    }
  >();
  for (const o of offers) {
    const key = o.productDefinitionId;
    if (!groups.has(key)) {
      groups.set(key, {
        definitionId: key,
        definitionName: o.productDefinition.canonicalName,
        offers: [],
      });
    }
    groups.get(key)!.offers.push({
      id: o.id,
      farmId: o.farmId,
      farmName: o.farm.name,
      publicName: o.publicName,
      priceLabel: formatCents(o.priceAmountCents),
      priceAmountCents: o.priceAmountCents,
      lifecycle: o.lifecycle,
      isApproved: o.isApproved,
      isActive: o.isActive,
    });
  }
  return Array.from(groups.values());
}

/** Platform-managed definition catalogue (read; farms cannot create these). */
export async function listDefinitions() {
  return prisma.productDefinition.findMany({ orderBy: { canonicalName: "asc" } });
}

export async function listAdminLots(user: SessionUser) {
  return prisma.lot.findMany({
    where: offerScopeWhere(user),
    include: { farm: true, offer: { include: { productDefinition: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function listAdminPacks(user: SessionUser) {
  const scope = visibleFarmScope(user);
  const packs = await prisma.pack.findMany({
    include: {
      items: { include: { farm: true, offer: true } },
      acceptances: { include: { farm: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  // A farm_manager sees only packs their farm participates in.
  if (scope === null) return packs;
  return packs.filter((p) =>
    p.acceptances.some((a) => scope.includes(a.farmId)),
  );
}

export async function listAdminCycles(_user: SessionUser) {
  return prisma.reservationCycle.findMany({
    include: {
      farms: { include: { farm: true } },
      offerAvailability: true,
      _count: { select: { orders: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

/** Orders list, optionally filtered by status, scoped per farm. A farm_manager
 * sees only orders with a FulfilmentGroup for their farm. */
export async function listAdminOrders(
  user: SessionUser,
  status?: string,
) {
  const scope = visibleFarmScope(user);
  const where: Record<string, unknown> = {};
  if (status && status !== "all") where.status = status;
  if (scope !== null) {
    where.fulfilmentGroups = { some: { farmId: { in: scope } } };
  }
  return prisma.order.findMany({
    where,
    include: {
      cycle: true,
      items: true,
      fulfilmentGroups: { include: { farm: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}

/** Everything awaiting human review for the extended queue. */
export async function listReviewQueueExtended(user: SessionUser) {
  const scope = visibleFarmScope(user);
  const farmFilter =
    scope === null ? {} : { farmId: { in: scope } };

  const [offers, lots, certs, profileEdits, packs] = await Promise.all([
    prisma.farmProductOffer.findMany({
      where: { lifecycle: "pending_review", ...farmFilter },
      include: { farm: true, productDefinition: true },
    }),
    prisma.lot.findMany({
      where: {
        ...farmFilter,
        offer: { lifecycle: "pending_review" },
      },
      include: { farm: true, offer: true },
    }),
    prisma.farmCertification.findMany({
      where: { status: "pending_review", ...farmFilter },
      include: { farm: true },
    }),
    prisma.farmProfileEdit.findMany({
      where: { status: "pending_review", ...farmFilter },
      include: { farm: true },
    }),
    prisma.pack.findMany({
      where: { lifecycle: { in: ["draft", "pending_review"] } },
      include: { acceptances: { include: { farm: true } }, items: true },
    }),
  ]);

  const visiblePacks =
    scope === null
      ? packs
      : packs.filter((p) => p.acceptances.some((a) => scope.includes(a.farmId)));

  return { offers, lots, certs, profileEdits, packs: visiblePacks };
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

// ---------------------------------------------------------------------------
// FEAT-006: audit-log browser. Read-only, farm-scoped, filterable view over the
// AdminAudit (human actions) and AiRun (AI runs) tables. The FEAT-007
// AI-assistant decision history will slot in as a third source here: see the
// `assistantDecisions` extension point below, which is tolerant of that table
// being absent/empty for now.
// ---------------------------------------------------------------------------

export interface AuditEntryRow {
  id: string;
  /** "human" | "ai" | "assistant" — which log the row came from. */
  source: "human" | "ai" | "assistant";
  action: string;
  actor: string;
  entityType: string;
  entityId: string;
  detail: string;
  createdAt: Date;
}

export interface AuditFilters {
  source?: string; // human | ai | assistant | all
  action?: string;
  entityType?: string;
}

/**
 * Browse the activity log. A platform_admin sees everything; a farm_manager
 * sees only entries attributable to their own farm:
 *  - AdminAudit rows they performed (actorId) OR that target their farm.
 *  - AiRun rows are platform-level and are hidden from farm managers.
 * The result is a merged, newest-first list the UI renders read-only.
 */
export async function listAuditEntries(
  user: SessionUser,
  filters: AuditFilters = {},
): Promise<AuditEntryRow[]> {
  const scope = visibleFarmScope(user);
  const isPlatform = scope === null;
  const wantSource = filters.source && filters.source !== "all" ? filters.source : null;

  const entries: AuditEntryRow[] = [];

  // --- Human actions (AdminAudit). -----------------------------------------
  if (!wantSource || wantSource === "human") {
    const where: Record<string, unknown> = {};
    if (filters.action) where.action = filters.action;
    if (filters.entityType) where.entityType = filters.entityType;
    // Farm managers: restrict to their own actions (their farm's entries).
    if (!isPlatform) where.actorId = user.id;
    const rows = await prisma.adminAudit.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 300,
    });
    for (const r of rows) {
      entries.push({
        id: r.id,
        source: "human",
        action: r.action,
        actor: r.actorEmail || r.actorId,
        entityType: r.entityType,
        entityId: r.entityId,
        detail: r.detail,
        createdAt: r.createdAt,
      });
    }
  }

  // --- AI runs (AiRun). Platform-level only; hidden from farm managers. -----
  if ((!wantSource || wantSource === "ai") && isPlatform) {
    const where: Record<string, unknown> = {};
    if (filters.action) where.useCase = filters.action;
    const rows = await prisma.aiRun.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 300,
    });
    for (const r of rows) {
      entries.push({
        id: r.id,
        source: "ai",
        action: `ai:${r.useCase}`,
        actor: `${r.provider}/${r.model}`,
        entityType: "ai_run",
        entityId: r.inputRef,
        detail: `outcome=${r.outcome} valid=${r.outputValid} flag=${r.flagEnabled}`,
        createdAt: r.createdAt,
      });
    }
  }

  // --- AI-assistant decision history (FEAT-007). Each row is a human decision
  //     (accept/edit/reject + reason) over a bounded assistant suggestion. A
  //     platform_admin sees all; a farm_manager sees only rows scoped to their
  //     own farm (farmId). Platform-level rows (farmId null) are hidden from
  //     farm managers, matching the AiRun rule.
  if (!wantSource || wantSource === "assistant") {
    const where: Record<string, unknown> = {};
    if (filters.action) where.assistant = filters.action;
    if (!isPlatform) {
      // Farm managers: only their own farm's decisions (never platform-level).
      if (scope === null || scope.length === 0) {
        // no visible rows
        where.id = "__none__";
      } else {
        where.farmId = { in: scope };
      }
    }
    const rows = await prisma.aiAssistantDecision.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 300,
    });
    for (const r of rows) {
      entries.push({
        id: r.id,
        source: "assistant",
        action: `assistant:${r.assistant}`,
        actor: r.decidedByEmail || (r.decision === "pending" ? "(pendent)" : r.decidedByUserId || ""),
        entityType: "assistant_decision",
        entityId: r.inputRef,
        detail: `decision=${r.decision}${r.decisionReason ? ` reason=${r.decisionReason}` : ""}`,
        createdAt: r.createdAt,
      });
    }
  }

  entries.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return entries;
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
      } else {
        // Offer-model (M8): a "product" translation may key on a
        // FarmProductOffer id. Resolve the owning farm + source text from it so
        // offer copy is reviewable through the same queue.
        const offer = await prisma.farmProductOffer.findUnique({
          where: { id: r.entityId },
          include: { farm: true },
        });
        if (offer) {
          farmId = offer.farmId;
          farmName = offer.farm.name;
          const map: Record<string, string> = {
            name: offer.publicName,
            description: offer.description,
          };
          sourceText = map[r.field] ?? null;
        }
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
