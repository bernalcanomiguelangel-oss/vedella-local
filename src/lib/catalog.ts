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

export interface FarmCatalog extends OfferedFarm {
  packs: OfferedPack[];
  cuts: OfferedCut[];
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
  const farm = await prisma.farm.findFirst({
    // Exclude test/demo farms from the public catalog (R15), matching
    // listOfferedFarms and search.
    where: { slug, isApproved: true, isActive: true, isTest: false },
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
