/**
 * Integration tests for the two-level product model and its safe backfill
 * (FEAT-003, migration phases M2-M4) against a real SQLite database.
 *
 * These exercise the verification gates from docs/migration-plan.md §10:
 *  - every kind="cut" Product maps to exactly one ProductDefinition;
 *  - count(FarmProductOffer) == count(Product where kind='cut');
 *  - zero null Lot.farmProductOfferId on cut-backed lots;
 *  - lot.farmId == offer.farmId for every row;
 *  - visibility flags copied verbatim from the source Product;
 *  - the composite FK rejects a raw mismatched-farm Lot insert (mirrors R9);
 *  - Farm A and Farm B each have a DISTINCT Entrecot offer that references the
 *    single shared Entrecot definition, with independent prices.
 */
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createTestDb, type TestDb } from "../helpers/testDb";
import { makeFarm, makeLot, validLotDates } from "../helpers/fixtures";
import { backfillOffers, verifyBackfill, parseFacts } from "../../src/lib/migrate/backfill-offers";

let tdb: TestDb;
let db: PrismaClient;
let farmA: { id: string };
let farmB: { id: string };

/**
 * Seed a small two-farm fixture that mirrors the shape of the real seed: both
 * farms carry an "Entrecot" cut (shared canonical name) at INDEPENDENT prices,
 * farm A additionally carries a cut with blank facts (to exercise the
 * needs-review path) and each cut has a lot. Then run the backfill once.
 */
async function createCut(
  farmId: string,
  overrides: Partial<{
    name: string;
    basePriceCents: number;
    weight: string | null;
    thickness: string | null;
    maturation: string | null;
    packaging: string | null;
    shelfLife: string | null;
    lifecycle: string;
    isApproved: boolean;
    isActive: boolean;
    isTest: boolean;
  }> = {},
) {
  return db.product.create({
    data: {
      farmId,
      kind: "cut",
      name: overrides.name ?? "Entrecot",
      description: "Seeded cut.",
      basePriceCents: overrides.basePriceCents ?? 1438,
      weight: overrides.weight ?? "≈ 300 g",
      thickness: overrides.thickness ?? "2,5 cm",
      maturation: overrides.maturation ?? "21 dies",
      packaging: overrides.packaging ?? "Envasat al buit",
      shelfLife: overrides.shelfLife ?? "10 dies en fred (0–4 °C)",
      lifecycle: overrides.lifecycle ?? "active",
      isApproved: overrides.isApproved ?? true,
      isActive: overrides.isActive ?? true,
      isTest: overrides.isTest ?? false,
    },
  });
}

beforeAll(async () => {
  tdb = await createTestDb();
  db = tdb.prisma;
  // Guarantee the SQLite connection enforces foreign keys for this file's
  // connection (the composite-FK rejection below depends on it). The helper
  // already enables it; re-assert here so the gate is deterministic even if a
  // pooled connection reset the pragma.
  await db.$executeRawUnsafe("PRAGMA foreign_keys=ON;");

  farmA = await makeFarm(db, { slug: "farm-a-pm" });
  farmB = await makeFarm(db, { slug: "farm-b-pm" });

  // Shared canonical name, independent prices.
  const entrecotA = await createCut(farmA.id, { name: "Entrecot", basePriceCents: 1438 });
  const entrecotB = await createCut(farmB.id, { name: "Entrecot", basePriceCents: 1498 });
  // A second distinct cut on farm B.
  await createCut(farmB.id, { name: "Galta", basePriceCents: 1035, thickness: "—", maturation: "Carn fresca" });
  // A cut whose facts are all blank/placeholder -> needs-review on backfill.
  await createCut(farmA.id, {
    name: "Misteri",
    basePriceCents: 999,
    weight: "—",
    thickness: "—",
    maturation: "—",
    packaging: "—",
    shelfLife: "—",
  });
  // A pack product (kind="pack") that must NOT become an offer.
  await db.product.create({
    data: {
      farmId: farmA.id,
      kind: "pack",
      name: "Pack A",
      description: "A pack.",
      basePriceCents: 4200,
      lifecycle: "active",
      isApproved: true,
      isActive: true,
    },
  });

  // One lot per entrecot so the M4 re-point has something to do.
  await makeLot(db, farmA.id, entrecotA.id, { reference: "PM-A-1" });
  await makeLot(db, farmB.id, entrecotB.id, { reference: "PM-B-1" });

  await backfillOffers(db);
}, 60_000);

afterAll(async () => {
  await tdb.cleanup();
});

describe("M2 gate: definitions de-duplicated by canonical name", () => {
  it("creates exactly one definition per distinct cut name", async () => {
    const defs = await db.productDefinition.findMany();
    const names = defs.map((d) => d.canonicalName).sort();
    // Entrecot (shared across 2 farms), Galta, Misteri -> 3 definitions.
    expect(names).toEqual(["Entrecot", "Galta", "Misteri"]);
  });

  it("every kind='cut' Product maps to exactly one definition", async () => {
    const cuts = await db.product.findMany({ where: { kind: "cut" } });
    const defs = await db.productDefinition.findMany();
    const byName = new Map(defs.map((d) => [d.canonicalName, d.id]));
    for (const cut of cuts) {
      expect(byName.has(cut.name)).toBe(true);
    }
    // Both Entrecot products resolve to the SAME definition id.
    const entrecots = cuts.filter((c) => c.name === "Entrecot");
    expect(entrecots.length).toBe(2);
    expect(byName.get("Entrecot")).toBeTruthy();
  });

  it("flags an unrecognised cut definition as needs-review", async () => {
    const misteri = await db.productDefinition.findFirst({
      where: { canonicalName: "Misteri" },
    });
    expect(misteri?.category).toBe("needs-review");
    expect(misteri?.isApproved).toBe(false);
  });
});

describe("M3 gate: one offer per cut product, flags copied verbatim", () => {
  it("count(FarmProductOffer) == count(Product where kind='cut')", async () => {
    const offers = await db.farmProductOffer.count();
    const cuts = await db.product.count({ where: { kind: "cut" } });
    expect(offers).toBe(cuts);
    expect(offers).toBe(4); // entrecotA, entrecotB, Galta, Misteri
  });

  it("does not create an offer for a pack product", async () => {
    const offers = await db.farmProductOffer.findMany();
    expect(offers.some((o) => o.publicName === "Pack A")).toBe(false);
  });

  it("copies visibility flags verbatim for a cleanly-parsed cut", async () => {
    const galta = await db.product.findFirst({ where: { name: "Galta" } });
    const offer = await db.farmProductOffer.findFirst({
      where: { farmId: farmB.id, publicName: "Galta" },
    });
    expect(offer?.lifecycle).toBe(galta?.lifecycle);
    expect(offer?.isApproved).toBe(galta?.isApproved);
    expect(offer?.isActive).toBe(galta?.isActive);
    expect(offer?.isTest).toBe(galta?.isTest);
  });

  it("preserves original free-text in legacyFacts and parses structured fields", async () => {
    const offer = await db.farmProductOffer.findFirst({
      where: { farmId: farmA.id, publicName: "Entrecot" },
    });
    expect(offer?.legacyFacts).toBeTruthy();
    const facts = JSON.parse(offer!.legacyFacts!);
    expect(facts.weight).toBe("≈ 300 g");
    expect(offer?.expectedUnitWeightMinG).toBe(300);
    expect(offer?.thicknessMm).toBe(25);
    expect(offer?.maturationDays).toBe(21);
    expect(offer?.storageState).toBe("chilled");
    expect(offer?.minimumShelfLifeDays).toBe(10);
  });

  it("flags an unparseable offer needs-review without hiding a hidden source", async () => {
    // The 'Misteri' source was active but has no parseable facts: it is moved
    // to pending_review (not active) so a human looks at it, yet nothing is lost.
    const offer = await db.farmProductOffer.findFirst({
      where: { farmId: farmA.id, publicName: "Misteri" },
    });
    expect(offer?.lifecycle).toBe("pending_review");
    expect(offer?.isActive).toBe(false);
    expect(offer?.legacyFacts).toBeTruthy();
  });
});

describe("M4 gate: lots re-pointed with matching farmId", () => {
  it("verifyBackfill passes all gates", async () => {
    const result = await verifyBackfill(db);
    expect(result.offers).toBe(result.cutProducts);
    expect(result.repointedLots).toBe(result.cutLots);
  });

  it("zero null Lot.farmProductOfferId on cut-backed lots", async () => {
    const cutIds = (
      await db.product.findMany({ where: { kind: "cut" }, select: { id: true } })
    ).map((p) => p.id);
    const nullOfferLots = await db.lot.count({
      where: { productId: { in: cutIds }, farmProductOfferId: null },
    });
    expect(nullOfferLots).toBe(0);
  });

  it("lot.farmId == offer.farmId for every re-pointed lot", async () => {
    const lots = await db.lot.findMany({
      where: { farmProductOfferId: { not: null } },
      include: { offer: true },
    });
    expect(lots.length).toBeGreaterThan(0);
    for (const lot of lots) {
      expect(lot.offer?.farmId).toBe(lot.farmId);
    }
  });
});

describe("composite FK: a raw mismatched-farm lot insert is rejected (R9 analogue)", () => {
  it("DB rejects a Lot whose farmId differs from its offer's farmId", async () => {
    const offerA = await db.farmProductOffer.findFirst({
      where: { farmId: farmA.id, publicName: "Entrecot" },
    });
    expect(offerA).toBeTruthy();

    // farmB + offerA(id, farmA) has no matching (id, farmId) pair -> rejected.
    await expect(
      db.lot.create({
        data: {
          farmId: farmB.id,
          farmProductOfferId: offerA!.id,
          reference: "PM-FK-BAD",
          units: 5,
          ...validLotDates(),
        },
      }),
    ).rejects.toThrow();

    // The matching farm (A) is accepted, proving the FK is selective.
    await expect(
      db.lot.create({
        data: {
          farmId: farmA.id,
          farmProductOfferId: offerA!.id,
          reference: "PM-FK-OK",
          units: 5,
          ...validLotDates(),
        },
      }),
    ).resolves.toBeTruthy();
  });
});

describe("R-PM3: distinct per-farm offers share one definition", () => {
  it("Farm A and Farm B each have a distinct Entrecot offer with independent prices", async () => {
    const def = await db.productDefinition.findFirst({
      where: { canonicalName: "Entrecot" },
    });
    expect(def).toBeTruthy();

    const offerA = await db.farmProductOffer.findFirst({
      where: { farmId: farmA.id, publicName: "Entrecot" },
    });
    const offerB = await db.farmProductOffer.findFirst({
      where: { farmId: farmB.id, publicName: "Entrecot" },
    });

    // Both reference the SAME shared definition.
    expect(offerA?.productDefinitionId).toBe(def!.id);
    expect(offerB?.productDefinitionId).toBe(def!.id);
    // But they are DISTINCT offer rows with INDEPENDENT prices.
    expect(offerA?.id).not.toBe(offerB?.id);
    expect(offerA?.priceAmountCents).toBe(1438);
    expect(offerB?.priceAmountCents).toBe(1498);
  });
});

describe("parseFacts unit coverage", () => {
  it("parses multi-unit weight into total grams and unitsPerPack", () => {
    const f = parseFacts({ weight: "2 × 150 g", thickness: "1,5 cm" });
    expect(f.expectedUnitWeightMinG).toBe(300);
    expect(f.unitsPerPack).toBe(2);
    expect(f.thicknessMm).toBe(15);
    expect(f.parsedAny).toBe(true);
  });

  it("parses a weight range", () => {
    const f = parseFacts({ weight: "≈ 1500–1700 g" });
    expect(f.expectedUnitWeightMinG).toBe(1500);
    expect(f.expectedUnitWeightMaxG).toBe(1700);
  });

  it("returns parsedAny=false when nothing parses", () => {
    const f = parseFacts({
      weight: "—",
      thickness: "—",
      maturation: "—",
      packaging: "—",
      shelfLife: "—",
    });
    expect(f.parsedAny).toBe(false);
  });
});
