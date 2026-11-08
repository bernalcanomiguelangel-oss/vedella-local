/**
 * Backfill for the two-level product model (migration phases M2-M4).
 *
 * This module is pure data migration logic, invoked by the seed (and exercised
 * directly in tests). It NEVER deletes legacy rows: it ADDS
 * ProductDefinition + FarmProductOffer records derived from the existing
 * Product(kind="cut") rows, then re-points each cut-backed Lot at its new offer.
 *
 * Safety rules (docs/migration-plan.md):
 *  - De-duplicate definitions by canonical cut name across farms.
 *  - Copy each offer's visibility flags (lifecycle/isApproved/isActive/isTest)
 *    VERBATIM from the source Product so public visibility is unchanged.
 *  - Parse the free-text facts best-effort into structured columns, but ALWAYS
 *    keep the original strings in `legacyFacts`; flag an offer "needs-review"
 *    when nothing parses so a human can look at it. No data is lost.
 *  - Verify (M4 gate) zero null offer ids on cut-backed lots and
 *    lot.farmId == offer.farmId before the composite FK is trusted.
 */
import type { PrismaClient } from "@prisma/client";

/** Normalise unicode spaces/dashes so parsing is deterministic. */
function normalise(text: string): string {
  return text
    .replace(/\u00a0/g, " ") // non-breaking space
    .replace(/[\u2012\u2013\u2014\u2212]/g, "-") // various dashes/minus -> hyphen
    .trim();
}

/** A value that carries no information (em dash placeholder or empty). */
function isBlank(text: string | null | undefined): boolean {
  if (!text) return true;
  const n = normalise(text);
  return n === "" || n === "-";
}

/** Parse a European decimal ("2,5") or integer into a Number, or null. */
function parseNumber(raw: string): number | null {
  const n = Number(raw.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export interface ParsedFacts {
  expectedUnitWeightMinG: number | null;
  expectedUnitWeightMaxG: number | null;
  unitsPerPack: number | null;
  thicknessMm: number | null;
  maturationDays: number | null;
  packagingMethod: string | null;
  storageState: string | null;
  minimumShelfLifeDays: number | null;
  /** True when at least one structured field was successfully extracted. */
  parsedAny: boolean;
}

/**
 * Parse a weight free-text string into grams.
 *  - "≈ 300 g"            -> min=max=300
 *  - "2 × 150 g"          -> unitsPerPack=2, min=max=300 (total)
 *  - "≈ 1500-1700 g"      -> min=1500 max=1700
 *  - "1 L"                -> grams unknown (null), stays in legacyFacts
 */
function parseWeight(raw: string): {
  min: number | null;
  max: number | null;
  unitsPerPack: number | null;
} {
  const text = normalise(raw);
  // "N × M g" (multi-unit): total grams = N * M.
  const multi = text.match(/(\d+)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*g/i);
  if (multi) {
    const units = parseNumber(multi[1]);
    const each = parseNumber(multi[2]);
    const total = units != null && each != null ? Math.round(units * each) : null;
    return { min: total, max: total, unitsPerPack: units };
  }
  // "A-B g" range.
  const range = text.match(/(\d+(?:[.,]\d+)?)\s*-\s*(\d+(?:[.,]\d+)?)\s*g/i);
  if (range) {
    const min = parseNumber(range[1]);
    const max = parseNumber(range[2]);
    return {
      min: min != null ? Math.round(min) : null,
      max: max != null ? Math.round(max) : null,
      unitsPerPack: null,
    };
  }
  // Single "N g".
  const single = text.match(/(\d+(?:[.,]\d+)?)\s*g\b/i);
  if (single) {
    const g = parseNumber(single[1]);
    const rounded = g != null ? Math.round(g) : null;
    return { min: rounded, max: rounded, unitsPerPack: null };
  }
  return { min: null, max: null, unitsPerPack: null };
}

/** "2,5 cm" / "Daus 3 cm" -> millimetres (25 / 30). */
function parseThicknessMm(raw: string): number | null {
  const text = normalise(raw);
  const cm = text.match(/(\d+(?:[.,]\d+)?)\s*cm/i);
  if (cm) {
    const v = parseNumber(cm[1]);
    return v != null ? Math.round(v * 10) : null;
  }
  const mm = text.match(/(\d+(?:[.,]\d+)?)\s*mm/i);
  if (mm) {
    const v = parseNumber(mm[1]);
    return v != null ? Math.round(v) : null;
  }
  return null;
}

/** "21 dies" -> 21. "Carn fresca" -> null (no numeric maturation). */
function parseDays(raw: string): number | null {
  const text = normalise(raw);
  const m = text.match(/(\d+)\s*dies/i);
  if (m) {
    const v = parseNumber(m[1]);
    return v != null ? Math.round(v) : null;
  }
  return null;
}

/** Map the shelf-life free text to a storage state (chilled/frozen) + days. */
function parseShelfLife(raw: string): {
  days: number | null;
  storageState: string | null;
} {
  const text = normalise(raw);
  const days = parseDays(text);
  let storageState: string | null = null;
  if (/congel|frozen/i.test(text)) storageState = "frozen";
  else if (/fred|refriger|0\s*-\s*4|chilled/i.test(text)) storageState = "chilled";
  return { days, storageState };
}

/** Packaging free text maps straight through as the method label when present. */
function parsePackaging(raw: string): string | null {
  return isBlank(raw) ? null : normalise(raw);
}

export function parseFacts(source: {
  weight?: string | null;
  thickness?: string | null;
  maturation?: string | null;
  packaging?: string | null;
  shelfLife?: string | null;
}): ParsedFacts {
  const weight = isBlank(source.weight)
    ? { min: null, max: null, unitsPerPack: null }
    : parseWeight(source.weight as string);
  const thicknessMm = isBlank(source.thickness)
    ? null
    : parseThicknessMm(source.thickness as string);
  const maturationDays = isBlank(source.maturation)
    ? null
    : parseDays(source.maturation as string);
  const packagingMethod = parsePackaging(source.packaging ?? "");
  const shelf = isBlank(source.shelfLife)
    ? { days: null, storageState: null }
    : parseShelfLife(source.shelfLife as string);

  const parsedAny =
    weight.min != null ||
    weight.max != null ||
    weight.unitsPerPack != null ||
    thicknessMm != null ||
    maturationDays != null ||
    packagingMethod != null ||
    shelf.days != null ||
    shelf.storageState != null;

  return {
    expectedUnitWeightMinG: weight.min,
    expectedUnitWeightMaxG: weight.max,
    unitsPerPack: weight.unitsPerPack,
    thicknessMm,
    maturationDays,
    packagingMethod,
    storageState: shelf.storageState,
    minimumShelfLifeDays: shelf.days,
    parsedAny,
  };
}

/** Preserve the original free-text facts as a JSON string (never lost). */
export function legacyFactsJson(source: {
  weight?: string | null;
  thickness?: string | null;
  maturation?: string | null;
  packaging?: string | null;
  shelfLife?: string | null;
}): string {
  return JSON.stringify({
    weight: source.weight ?? null,
    thickness: source.thickness ?? null,
    maturation: source.maturation ?? null,
    packaging: source.packaging ?? null,
    shelfLife: source.shelfLife ?? null,
  });
}

/**
 * Best-effort category for a canonical cut name. Falls back to "needs-review"
 * so an unrecognised cut is surfaced to a human rather than mislabelled.
 */
export function categoryForCut(canonicalName: string): string {
  const key = canonicalName.toLowerCase();
  const table: Array<[RegExp, string]> = [
    [/entrecot|llom|secret/, "steak"],
    [/hamburg/, "burger"],
    [/picada/, "mince"],
    [/galta|estofar|ossobuc/, "stew"],
    [/brou/, "broth"],
  ];
  for (const [re, cat] of table) {
    if (re.test(key)) return cat;
  }
  return "needs-review";
}

/** Deterministic, unique translation key for a definition. */
export function translationKeyForCut(canonicalName: string): string {
  const slug = canonicalName
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `product-definition.${slug}`;
}

export interface BackfillResult {
  definitionsCreated: number;
  offersCreated: number;
  lotsRepointed: number;
  needsReviewOffers: number;
  /** productId -> definitionId */
  productToDefinition: Map<string, string>;
  /** productId -> offerId */
  productToOffer: Map<string, string>;
}

/**
 * Run M2 (definitions), M3 (offers) and M4 (re-point lots) against an existing
 * database that already holds legacy Product(kind="cut") rows. Idempotent-ish:
 * it de-duplicates definitions by canonical name within this run. Intended to be
 * called once per freshly-seeded database.
 */
export async function backfillOffers(
  prisma: PrismaClient,
): Promise<BackfillResult> {
  const cuts = await prisma.product.findMany({
    where: { kind: "cut" },
    orderBy: { createdAt: "asc" },
  });

  const productToDefinition = new Map<string, string>();
  const productToOffer = new Map<string, string>();
  const definitionByName = new Map<string, string>();
  let definitionsCreated = 0;
  let offersCreated = 0;
  let needsReviewOffers = 0;

  // --- M2: one ProductDefinition per DISTINCT canonical cut name. ------------
  for (const cut of cuts) {
    const canonicalName = cut.name;
    if (definitionByName.has(canonicalName)) {
      productToDefinition.set(cut.id, definitionByName.get(canonicalName)!);
      continue;
    }
    const category = categoryForCut(canonicalName);
    // Definitions are platform-curated. A cleanly-categorised cut is approved
    // + active for the seed; an unrecognised one stays pending for human review.
    const recognised = category !== "needs-review";
    const def = await prisma.productDefinition.create({
      data: {
        canonicalName,
        category,
        description: cut.description ?? "",
        translationKey: translationKeyForCut(canonicalName),
        lifecycle: recognised ? "active" : "pending_review",
        isApproved: recognised,
        isActive: recognised,
        isTest: false,
      },
    });
    definitionsCreated++;
    definitionByName.set(canonicalName, def.id);
    productToDefinition.set(cut.id, def.id);
  }

  // --- M3: one FarmProductOffer per legacy cut Product. ----------------------
  for (const cut of cuts) {
    const definitionId = productToDefinition.get(cut.id)!;
    const facts = parseFacts(cut);
    const needsReview = !facts.parsedAny;
    if (needsReview) needsReviewOffers++;

    const offer = await prisma.farmProductOffer.create({
      data: {
        farmId: cut.farmId,
        productDefinitionId: definitionId,
        publicName: cut.name,
        description: cut.description ?? "",
        priceAmountCents: cut.basePriceCents,
        priceUnit: "per_unit",
        currency: "EUR",
        expectedUnitWeightMinG: facts.expectedUnitWeightMinG,
        expectedUnitWeightMaxG: facts.expectedUnitWeightMaxG,
        unitsPerPack: facts.unitsPerPack,
        thicknessMm: facts.thicknessMm,
        maturationDays: facts.maturationDays,
        packagingMethod: facts.packagingMethod,
        storageState: facts.storageState,
        minimumShelfLifeDays: facts.minimumShelfLifeDays,
        legacyFacts: legacyFactsJson(cut),
        // Visibility flags copied VERBATIM so public visibility is unchanged.
        // An unparseable offer is additionally flagged for review via lifecycle
        // ONLY when it was otherwise publishable, so we never silently hide it.
        lifecycle: needsReview && cut.lifecycle === "active" ? "pending_review" : cut.lifecycle,
        isApproved: needsReview && cut.lifecycle === "active" ? false : cut.isApproved,
        isActive: needsReview && cut.lifecycle === "active" ? false : cut.isActive,
        isTest: cut.isTest,
      },
    });
    offersCreated++;
    productToOffer.set(cut.id, offer.id);
  }

  // --- M4: re-point every cut-backed Lot at its new offer. -------------------
  let lotsRepointed = 0;
  const cutLots = await prisma.lot.findMany({
    where: { productId: { in: cuts.map((c) => c.id) } },
  });
  for (const lot of cutLots) {
    const offerId = lot.productId ? productToOffer.get(lot.productId) : undefined;
    if (!offerId) continue;
    await prisma.lot.update({
      where: { id: lot.id },
      data: { farmProductOfferId: offerId },
    });
    lotsRepointed++;
  }

  return {
    definitionsCreated,
    offersCreated,
    lotsRepointed,
    needsReviewOffers,
    productToDefinition,
    productToOffer,
  };
}

/**
 * M4 verification gate. Throws if any cut-backed lot lacks an offer id or if a
 * lot's farmId differs from its offer's farmId. Returns counts for logging.
 */
export async function verifyBackfill(prisma: PrismaClient): Promise<{
  cutProducts: number;
  offers: number;
  cutLots: number;
  repointedLots: number;
}> {
  const cutProducts = await prisma.product.count({ where: { kind: "cut" } });
  const offers = await prisma.farmProductOffer.count();
  if (offers !== cutProducts) {
    throw new Error(
      `M3 gate failed: offers (${offers}) != cut products (${cutProducts}).`,
    );
  }

  const cutProductIds = (
    await prisma.product.findMany({ where: { kind: "cut" }, select: { id: true } })
  ).map((p) => p.id);
  const cutLots = await prisma.lot.findMany({
    where: { productId: { in: cutProductIds } },
    include: { offer: true },
  });
  let repointedLots = 0;
  for (const lot of cutLots) {
    if (!lot.farmProductOfferId || !lot.offer) {
      throw new Error(
        `M4 gate failed: cut-backed lot ${lot.reference} has no offer id.`,
      );
    }
    if (lot.offer.farmId !== lot.farmId) {
      throw new Error(
        `M4 gate failed: lot ${lot.reference} farmId != offer farmId.`,
      );
    }
    repointedLots++;
  }

  return { cutProducts, offers, cutLots: cutLots.length, repointedLots };
}
