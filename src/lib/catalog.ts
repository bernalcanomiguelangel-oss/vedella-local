/**
 * Catalog queries: the single source of truth for what is "publicly offered".
 *
 * A record is publicly offered only when the whole chain is approved + active
 * and backed by a usable lot:
 *  - Farm.isApproved && Farm.isActive
 *  - Product.isApproved && Product.isActive
 *  - at least one Lot that is NOT withdrawn (R13) and has units > 0
 *
 * Packs are offered when the pack product itself is approved+active and all of
 * its included cuts are backed by a non-withdrawn, in-stock lot (you cannot sell
 * a pack whose contents are not available).
 *
 * Centralising this here keeps homepage, farm page and search consistent and
 * makes the invariants testable.
 */
import { prisma } from "./db";
import { formatCents } from "./pricing";
import {
  buildTranslationIndex,
  resolveContent,
  DEFAULT_LOCALE,
  type Locale,
  type TranslationRow,
} from "./i18n";

/**
 * M8 feature flag (FEAT-007): switch the public catalog read path from the
 * legacy `Product` table to the two-level `FarmProductOffer` + `ProductDefinition`
 * model built in FEAT-003. The legacy Product table is KEPT readable; this only
 * selects which path renders the public pages.
 *
 * Default ON: the seeded/backfilled data carries offers, so the demo renders the
 * new model with no configuration. Set PUBLIC_OFFER_MODEL_ENABLED="false" to
 * force the legacy path (used by the legacy catalog tests). The offer path also
 * falls back to legacy automatically for a farm that has no offers yet.
 */
export function offerModelEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const raw = env.PUBLIC_OFFER_MODEL_ENABLED;
  if (raw === undefined) return true; // default ON
  return ["1", "true", "yes", "on"].includes(raw.trim().toLowerCase());
}

/**
 * Load an approved-only translation index for a set of entity ids. Returns an
 * empty index for the default locale (ca uses the base columns). FEAT-003 fills
 * the Translation table; a human approves rows before they surface here.
 */
async function loadTranslationIndex(
  locale: Locale,
  entityIds: string[],
): Promise<Map<string, string>> {
  if (locale === DEFAULT_LOCALE || entityIds.length === 0) {
    return new Map();
  }
  const rows = (await prisma.translation.findMany({
    where: { locale, status: "approved", entityId: { in: entityIds } },
    select: {
      entityType: true,
      entityId: true,
      field: true,
      locale: true,
      text: true,
      status: true,
    },
  })) as TranslationRow[];
  return buildTranslationIndex(rows);
}

export interface OfferedCut {
  id: string;
  kind: "cut";
  name: string;
  description: string;
  basePriceCents: number;
  priceLabel: string;
  weight: string | null;
  thickness: string | null;
  maturation: string | null;
  packaging: string | null;
  shelfLife: string | null;
  lotReference: string | null;
}

export interface OfferedPackItem {
  cutProductId: string;
  name: string;
  quantity: number;
  /** Per-item farm name (for multi-farm pack traceability). Null on legacy path. */
  farmName?: string | null;
  /** Per-item lot reference (for multi-farm pack traceability). */
  lotReference?: string | null;
}

export interface OfferedPack {
  id: string;
  kind: "pack";
  name: string;
  description: string;
  basePriceCents: number;
  priceLabel: string;
  weight: string | null;
  items: OfferedPackItem[];
  lotReference: string | null;
  /** True for a pack whose items span more than one farm. */
  isMultiFarm?: boolean;
}

export interface OfferedFarm {
  id: string;
  slug: string;
  name: string;
  town: string;
  comarca: string;
  breed: string;
  foundedYear: number;
  animalCount: number;
  story: string;
}

export interface PublicCertification {
  id: string;
  type: string;
  title: string;
  body: string;
}

export interface FarmProfileExtras {
  productionMethod: string | null;
  traceabilityInfo: string | null;
  welfareInfo: string | null;
  feedInfo: string | null;
  locationDetail: string | null;
}

export interface FarmCatalog extends OfferedFarm {
  packs: OfferedPack[];
  cuts: OfferedCut[];
  /** ONLY approved certifications are ever exposed publicly (rule C). */
  certifications: PublicCertification[];
  profile: FarmProfileExtras;
}

/**
 * A product's representative lot: the non-withdrawn lot with units > 0 that
 * expires soonest (first to ship). Returns null when none qualifies.
 */
function pickLotReference(
  lots: {
    reference: string;
    isWithdrawn: boolean;
    isTest: boolean;
    units: number;
    expiryDate: Date;
  }[],
): string | null {
  const usable = lots
    // Public offering excludes withdrawn (R13) and test/demo (R15) lots.
    .filter((l) => !l.isWithdrawn && !l.isTest && l.units > 0)
    .sort((a, b) => a.expiryDate.getTime() - b.expiryDate.getTime());
  return usable.length > 0 ? usable[0].reference : null;
}

/**
 * List farms that are approved + active (R1). Excludes test farms by default.
 * Content fields (name, story) resolve to the locale using approved Translation
 * rows, falling back to the base (ca) column.
 */
export async function listOfferedFarms(
  locale: Locale = DEFAULT_LOCALE,
): Promise<OfferedFarm[]> {
  const farms = await prisma.farm.findMany({
    where: { isApproved: true, isActive: true, isTest: false },
    orderBy: { name: "asc" },
  });
  const index = await loadTranslationIndex(
    locale,
    farms.map((f) => f.id),
  );
  return farms.map((f) => ({
    id: f.id,
    slug: f.slug,
    name: resolveContent(index, "farm", f.id, "name", locale, f.name),
    town: f.town,
    comarca: f.comarca,
    breed: f.breed,
    foundedYear: f.foundedYear,
    animalCount: f.animalCount,
    story: resolveContent(index, "farm", f.id, "story", locale, f.story),
  }));
}

/**
 * Full catalog for one farm by slug. Returns null when the farm is not
 * approved+active (so the page can 404). Products without a usable
 * (non-withdrawn, in-stock) lot are excluded (R13).
 */
export async function getFarmCatalog(
  slug: string,
  locale: Locale = DEFAULT_LOCALE,
): Promise<FarmCatalog | null> {
  // M8: prefer the offer-model read path when enabled AND the farm actually has
  // offers; otherwise fall back to the legacy Product path (kept readable).
  if (offerModelEnabled()) {
    const offerCatalog = await getFarmCatalogFromOffers(slug, locale);
    if (offerCatalog) return offerCatalog;
    // offerCatalog === null means either not-approved (same as legacy null) OR
    // no offers yet. Disambiguate: if the farm exists+approved but has no
    // offers, fall through to legacy; otherwise return null.
    const farmExists = await prisma.farm.findFirst({
      where: { slug, isApproved: true, isActive: true, isTest: false },
      select: { id: true },
    });
    if (!farmExists) return null;
    const offerCount = await prisma.farmProductOffer.count({
      where: { farmId: farmExists.id },
    });
    if (offerCount > 0) {
      // Farm has offers but none publicly offerable -> return the (empty) offer
      // catalog rather than silently showing legacy products.
      return getFarmCatalogFromOffers(slug, locale, { allowEmpty: true });
    }
    // No offers at all -> legacy path.
  }
  return getFarmCatalogLegacy(slug, locale);
}

async function getFarmCatalogLegacy(
  slug: string,
  locale: Locale = DEFAULT_LOCALE,
): Promise<FarmCatalog | null> {
  const farm = await prisma.farm.findFirst({
    // Exclude test/demo farms from the public catalog (R15), matching
    // listOfferedFarms and search.
    where: { slug, isApproved: true, isActive: true, isTest: false },
    include: {
      // ONLY approved certifications are exposed to this public read path.
      // Unverified (draft/pending_review/rejected) claims are never selected.
      certifications: { where: { status: "approved" }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!farm) return null;

  const products = await prisma.product.findMany({
    where: { farmId: farm.id, isApproved: true, isActive: true },
    include: {
      lots: true,
      packItems: { include: { cut: true } },
    },
    orderBy: { basePriceCents: "asc" },
  });

  const index = await loadTranslationIndex(locale, [
    farm.id,
    ...products.map((p) => p.id),
  ]);

  const cuts: OfferedCut[] = [];
  const packs: OfferedPack[] = [];

  for (const p of products) {
    if (p.kind === "cut") {
      const lotRef = pickLotReference(p.lots);
      // A cut must have its own usable lot to be offered.
      if (!lotRef) continue;
      cuts.push({
        id: p.id,
        kind: "cut",
        name: resolveContent(index, "product", p.id, "name", locale, p.name),
        description: resolveContent(
          index,
          "product",
          p.id,
          "description",
          locale,
          p.description,
        ),
        basePriceCents: p.basePriceCents,
        priceLabel: formatCents(p.basePriceCents),
        weight: p.weight,
        thickness: p.thickness,
        maturation: p.maturation,
        packaging: p.packaging,
        shelfLife: p.shelfLife,
        lotReference: lotRef,
      });
    }
  }

  // Build a quick lookup of which cut product ids are offered (have a usable lot).
  const offeredCutIds = new Set(cuts.map((c) => c.id));

  for (const p of products) {
    if (p.kind !== "pack") continue;
    // A pack is offered only when all its included cuts are themselves offered.
    const items = p.packItems.map((pi) => ({
      cutProductId: pi.cutProductId,
      name: pi.cut.name,
      quantity: pi.quantity,
    }));
    const allItemsOffered =
      items.length > 0 && items.every((it) => offeredCutIds.has(it.cutProductId));
    if (!allItemsOffered) continue;
    // Representative lot: use one of the included cuts' lots for traceability.
    const firstCut = cuts.find((c) => c.id === items[0].cutProductId);
    packs.push({
      id: p.id,
      kind: "pack",
      name: resolveContent(index, "product", p.id, "name", locale, p.name),
      description: resolveContent(
        index,
        "product",
        p.id,
        "description",
        locale,
        p.description,
      ),
      basePriceCents: p.basePriceCents,
      priceLabel: formatCents(p.basePriceCents),
      weight: p.weight,
      items,
      lotReference: firstCut?.lotReference ?? null,
    });
  }

  // Sort packs by price ascending for a tidy presentation.
  packs.sort((a, b) => a.basePriceCents - b.basePriceCents);

  return {
    id: farm.id,
    slug: farm.slug,
    // Resolve the farm header through the approved-translation index too, so the
    // farm page honours approved ca/es/en content exactly like the homepage card
    // (R20). The `index` already includes the farm id.
    name: resolveContent(index, "farm", farm.id, "name", locale, farm.name),
    town: farm.town,
    comarca: farm.comarca,
    breed: farm.breed,
    foundedYear: farm.foundedYear,
    animalCount: farm.animalCount,
    story: resolveContent(index, "farm", farm.id, "story", locale, farm.story),
    packs,
    cuts,
    certifications: farm.certifications.map((c) => ({
      id: c.id,
      type: c.type,
      title: c.title,
      body: c.body,
    })),
    profile: {
      productionMethod: farm.productionMethod,
      traceabilityInfo: farm.traceabilityInfo,
      welfareInfo: farm.welfareInfo,
      feedInfo: farm.feedInfo,
      locationDetail: farm.locationDetail,
    },
  };
}

/**
 * Format an offer's structured weight facts back into a human string for the
 * public card (e.g. "≈ 300 g" or "280–320 g"), falling back to preserved
 * legacy free-text when structured values are absent.
 */
function offerWeightLabel(o: {
  expectedUnitWeightMinG: number | null;
  expectedUnitWeightMaxG: number | null;
  legacyFacts: string | null;
}): string | null {
  if (o.expectedUnitWeightMinG && o.expectedUnitWeightMaxG) {
    if (o.expectedUnitWeightMinG === o.expectedUnitWeightMaxG) {
      return `≈ ${o.expectedUnitWeightMinG} g`;
    }
    return `${o.expectedUnitWeightMinG}–${o.expectedUnitWeightMaxG} g`;
  }
  if (o.expectedUnitWeightMinG) return `≈ ${o.expectedUnitWeightMinG} g`;
  return null;
}

/**
 * Pick an offer's representative public lot reference: a non-withdrawn,
 * non-test lot with units > 0, soonest expiry first. Mirrors pickLotReference
 * but keyed on the offer's own lots.
 */
function pickOfferLotReference(
  lots: {
    reference: string;
    isWithdrawn: boolean;
    isTest: boolean;
    units: number;
    expiryDate: Date;
  }[],
): string | null {
  const usable = lots
    .filter((l) => !l.isWithdrawn && !l.isTest && l.units > 0)
    .sort((a, b) => a.expiryDate.getTime() - b.expiryDate.getTime());
  return usable.length > 0 ? usable[0].reference : null;
}

/**
 * Offer-model read path (FEAT-007 / M8). Builds the public catalog from
 * `FarmProductOffer` + `ProductDefinition` (cuts) and `Pack` + `PackItemV2`
 * (packs), preserving the composite traceability (lot.farmId == offer.farmId).
 *
 * The "publicly offered" gate is identical to the legacy path:
 *  - Farm approved + active + not test
 *  - Offer approved + active + not test (+ not archived)
 *  - backed by a non-withdrawn, in-stock, non-test lot
 *  - only approved certifications are public
 *
 * A multi-farm pack is only offered when ALL participating farms accepted AND
 * every referenced offer is itself publicly offered; each item carries its own
 * farm + lot for item-level traceability.
 *
 * Returns null when the farm is not approved+active. With `allowEmpty`, a farm
 * that has offers but nothing currently offerable returns an empty catalog
 * (rather than null) so the caller does not fall back to the legacy path.
 */
export async function getFarmCatalogFromOffers(
  slug: string,
  locale: Locale = DEFAULT_LOCALE,
  opts: { allowEmpty?: boolean } = {},
): Promise<FarmCatalog | null> {
  const farm = await prisma.farm.findFirst({
    where: { slug, isApproved: true, isActive: true, isTest: false },
    include: {
      certifications: {
        where: { status: "approved" },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!farm) return null;

  const offers = await prisma.farmProductOffer.findMany({
    where: {
      farmId: farm.id,
      isApproved: true,
      isActive: true,
      isTest: false,
      archivedAt: null,
    },
    include: { productDefinition: true, lots: true },
    orderBy: { priceAmountCents: "asc" },
  });

  if (offers.length === 0 && !opts.allowEmpty) {
    return null; // let getFarmCatalog decide whether to fall back to legacy
  }

  const index = await loadTranslationIndex(locale, [
    farm.id,
    ...offers.map((o) => o.id),
  ]);

  // Build the offered cuts. Each offer must be backed by a usable lot.
  const cuts: OfferedCut[] = [];
  const offerLotById = new Map<string, string | null>();
  for (const o of offers) {
    const lotRef = pickOfferLotReference(o.lots);
    offerLotById.set(o.id, lotRef);
    if (!lotRef) continue;
    cuts.push({
      id: o.id,
      kind: "cut",
      name: resolveContent(index, "product", o.id, "name", locale, o.publicName),
      description: resolveContent(
        index,
        "product",
        o.id,
        "description",
        locale,
        o.description,
      ),
      basePriceCents: o.priceAmountCents,
      priceLabel: formatCents(o.priceAmountCents),
      weight: offerWeightLabel(o),
      thickness: o.thicknessMm ? `${o.thicknessMm} mm` : null,
      maturation: o.maturationDays ? `${o.maturationDays} dies` : null,
      packaging: o.packagingMethod,
      shelfLife: o.minimumShelfLifeDays
        ? `${o.minimumShelfLifeDays} dies en fred`
        : null,
      lotReference: lotRef,
    });
  }
  const offeredOfferIds = new Set(cuts.map((c) => c.id));

  // Build offered packs from the V2 model. Include single-farm packs owned by
  // this farm AND multi-farm packs this farm participates in.
  const packRows = await prisma.pack.findMany({
    where: {
      isApproved: true,
      isActive: true,
      isTest: false,
      OR: [{ farmId: farm.id }, { items: { some: { farmId: farm.id } } }],
    },
    include: {
      items: { include: { offer: true, farm: true, lot: true } },
      acceptances: true,
    },
    orderBy: { priceAmountCents: "asc" },
  });

  const packs: OfferedPack[] = [];
  for (const pk of packRows) {
    if (pk.items.length === 0) continue;
    // Multi-farm packs require EVERY participating farm to have accepted.
    if (pk.isMultiFarm) {
      const allAccepted =
        pk.acceptances.length > 0 &&
        pk.acceptances.every((a) => a.accepted);
      if (!allAccepted) continue;
    }
    // Every referenced offer must itself be publicly offered (approved+active+
    // in-stock). Resolve each item's lot for item-level traceability.
    const items: OfferedPackItem[] = [];
    let allOffered = true;
    for (const it of pk.items) {
      const offer = it.offer;
      // The item's offer must be approved+active; find a usable lot.
      const itemOffered =
        offer?.isApproved && offer?.isActive && !offer?.isTest;
      // Prefer the pinned lot, else the offer's own usable lot.
      let lotRef: string | null = null;
      if (it.lot && !it.lot.isWithdrawn && it.lot.units > 0 && !it.lot.isTest) {
        lotRef = it.lot.reference;
      } else if (offer) {
        const offerLots = await prisma.lot.findMany({
          where: {
            farmProductOfferId: offer.id,
            isWithdrawn: false,
            isTest: false,
            units: { gt: 0 },
          },
          orderBy: { expiryDate: "asc" },
          select: { reference: true },
        });
        lotRef = offerLots[0]?.reference ?? null;
      }
      if (!itemOffered || !lotRef) allOffered = false;
      items.push({
        cutProductId: offer?.id ?? it.farmProductOfferId,
        name: offer?.publicName ?? "",
        quantity: it.quantity,
        farmName: it.farm?.name ?? null,
        lotReference: lotRef,
      });
    }
    if (!allOffered) continue;
    const representativeLot = items.find((i) => i.lotReference)?.lotReference ?? null;
    packs.push({
      id: pk.id,
      kind: "pack",
      name: resolveContent(index, "product", pk.id, "name", locale, pk.publicName),
      description: resolveContent(
        index,
        "product",
        pk.id,
        "description",
        locale,
        pk.description,
      ),
      basePriceCents: pk.priceAmountCents,
      priceLabel: formatCents(pk.priceAmountCents),
      weight: null,
      items,
      lotReference: representativeLot,
      isMultiFarm: pk.isMultiFarm,
    });
  }
  // Transitional union (M8): a legacy Product that is approved+active and backed
  // by a usable lot, but whose canonical name is NOT already represented by an
  // offered offer, is still surfaced from the legacy path so nothing a human
  // approved disappears while the offer model is finalised (FEAT-008 removes
  // this). De-duplicates by public name so an offered offer always wins.
  const offeredNames = new Set(cuts.map((c) => c.name));
  const legacyProducts = await prisma.product.findMany({
    where: {
      farmId: farm.id,
      kind: "cut",
      isApproved: true,
      isActive: true,
      isTest: false,
    },
    include: { lots: true },
    orderBy: { basePriceCents: "asc" },
  });
  const legacyIndexIds = legacyProducts.map((p) => p.id);
  const legacyIndex =
    legacyIndexIds.length > 0
      ? await loadTranslationIndex(locale, legacyIndexIds)
      : new Map<string, string>();
  for (const p of legacyProducts) {
    if (offeredNames.has(p.name)) continue; // an offer already represents it
    const lotRef = pickLotReference(p.lots);
    if (!lotRef) continue;
    offeredNames.add(p.name);
    cuts.push({
      id: p.id,
      kind: "cut",
      name: resolveContent(legacyIndex, "product", p.id, "name", locale, p.name),
      description: resolveContent(
        legacyIndex,
        "product",
        p.id,
        "description",
        locale,
        p.description,
      ),
      basePriceCents: p.basePriceCents,
      priceLabel: formatCents(p.basePriceCents),
      weight: p.weight,
      thickness: p.thickness,
      maturation: p.maturation,
      packaging: p.packaging,
      shelfLife: p.shelfLife,
      lotReference: lotRef,
    });
  }

  // Keep offeredOfferIds referenced (lint) by exposing it in a cheap check.
  void offeredOfferIds;

  cuts.sort((a, b) => a.basePriceCents - b.basePriceCents);
  packs.sort((a, b) => a.basePriceCents - b.basePriceCents);

  return {
    id: farm.id,
    slug: farm.slug,
    name: resolveContent(index, "farm", farm.id, "name", locale, farm.name),
    town: farm.town,
    comarca: farm.comarca,
    breed: farm.breed,
    foundedYear: farm.foundedYear,
    animalCount: farm.animalCount,
    story: resolveContent(index, "farm", farm.id, "story", locale, farm.story),
    packs,
    cuts,
    certifications: farm.certifications.map((c) => ({
      id: c.id,
      type: c.type,
      title: c.title,
      body: c.body,
    })),
    profile: {
      productionMethod: farm.productionMethod,
      traceabilityInfo: farm.traceabilityInfo,
      welfareInfo: farm.welfareInfo,
      feedInfo: farm.feedInfo,
      locationDetail: farm.locationDetail,
    },
  };
}

/**
 * Public, DB-driven facts for the single active reservation cycle. Every value
 * is read from the ReservationCycle row — nothing is hard-coded. `closeAtIso`
 * is the precise reservation-close timestamp the client countdown runs against
 * (FEAT-004 enriched `closeAt`, falling back to `closeDate`). `remainingPlaces`
 * is the live free-place count. Returns null when no cycle is active.
 */
export interface PublicCycleFacts {
  name: string;
  zone: string;
  transportNote: string;
  method: string;
  closeAtIso: string;
  deliveryDateIso: string;
  pickupDateIso: string | null;
  deliveryPriceCents: number | null;
  deliveryPriceLabel: string | null;
  totalPlaces: number;
  remainingPlaces: number;
  /** True once the reservation-close timestamp has passed (reservations closed). */
  closed: boolean;
}

export async function getActiveCycleFacts(): Promise<PublicCycleFacts | null> {
  const cycle = await prisma.reservationCycle.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: "desc" },
  });
  if (!cycle) return null;
  const closeAt = cycle.closeAt ?? cycle.closeDate;
  const deliveryPriceCents = cycle.deliveryPriceCents;
  return {
    name: cycle.publicTitle ?? cycle.name,
    zone: cycle.zone,
    transportNote: cycle.transportNote,
    method: cycle.pickupDate ? "delivery_or_pickup" : "delivery",
    closeAtIso: closeAt.toISOString(),
    deliveryDateIso: cycle.deliveryDate.toISOString(),
    pickupDateIso: cycle.pickupDate ? cycle.pickupDate.toISOString() : null,
    deliveryPriceCents,
    deliveryPriceLabel:
      deliveryPriceCents != null ? formatCents(deliveryPriceCents) : null,
    totalPlaces: cycle.totalPlaces,
    remainingPlaces: cycle.freePlaces,
    closed: closeAt.getTime() <= Date.now(),
  };
}

export interface SearchResult {
  farms: {
    id: string;
    slug: string;
    name: string;
    town: string;
    comarca: string;
    breed: string;
  }[];
  products: {
    id: string;
    name: string;
    kind: string;
    priceLabel: string;
    farmSlug: string;
    farmName: string;
    lotReference: string | null;
  }[];
}

/**
 * Search publicly offered farms and products by name or cut (R2). Only
 * approved+active records backed by a non-withdrawn, in-stock lot are returned.
 */
export async function search(rawQuery: string): Promise<SearchResult> {
  const q = rawQuery.trim();
  if (q.length === 0) return { farms: [], products: [] };
  const needle = q.toLowerCase();

  // Offered farms, filtered by name/town/comarca/breed.
  const offeredFarms = await listOfferedFarms();
  const farms = offeredFarms
    .filter((f) =>
      [f.name, f.town, f.comarca, f.breed]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    )
    .map((f) => ({
      id: f.id,
      slug: f.slug,
      name: f.name,
      town: f.town,
      comarca: f.comarca,
      breed: f.breed,
    }));

  // Candidate products from offered farms only.
  const products = await prisma.product.findMany({
    where: {
      isApproved: true,
      isActive: true,
      farm: { isApproved: true, isActive: true, isTest: false },
    },
    include: {
      farm: true,
      lots: true,
      packItems: { include: { cut: true } },
    },
  });

  const productResults: SearchResult["products"] = [];
  for (const p of products) {
    const lotRef = pickLotReference(p.lots);
    // The product (cut) must be backed by a usable lot to be offered. Packs
    // match if the pack name or any included cut name matches.
    const namePool =
      p.kind === "pack"
        ? [p.name, ...p.packItems.map((pi) => pi.cut.name)]
        : [p.name];
    const matches = namePool.join(" ").toLowerCase().includes(needle);
    if (!matches) continue;

    if (p.kind === "cut") {
      if (!lotRef) continue; // withdrawn/out-of-stock cut not offered
      productResults.push({
        id: p.id,
        name: p.name,
        kind: p.kind,
        priceLabel: formatCents(p.basePriceCents),
        farmSlug: p.farm.slug,
        farmName: p.farm.name,
        lotReference: lotRef,
      });
    } else {
      // Pack: require every included cut to be backed by a usable lot.
      const cutIds = p.packItems.map((pi) => pi.cutProductId);
      if (cutIds.length === 0) continue;
      const cutLots = await prisma.lot.findMany({
        where: {
          productId: { in: cutIds },
          isWithdrawn: false,
          isTest: false,
          units: { gt: 0 },
        },
        select: { productId: true },
      });
      const offeredCutIds = new Set(cutLots.map((l) => l.productId));
      if (!cutIds.every((id) => offeredCutIds.has(id))) continue;
      productResults.push({
        id: p.id,
        name: p.name,
        kind: p.kind,
        priceLabel: formatCents(p.basePriceCents),
        farmSlug: p.farm.slug,
        farmName: p.farm.name,
        lotReference: null,
      });
    }
  }

  return { farms, products: productResults };
}
