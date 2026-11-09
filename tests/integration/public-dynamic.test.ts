/**
 * Dynamic public alignment (FEAT-007). Exercised through the REAL catalog
 * functions bound to a temp SQLite db. Proves:
 *  - the public catalog renders from the FarmProductOffer + ProductDefinition
 *    model with each farm's INDEPENDENT offer values;
 *  - packs come from the real V2 composition (per-item farm + lot), not one
 *    farm's hard-coded values;
 *  - the full Farm -> Lot -> Offer/Cut -> Pack traceability resolves from lot
 *    snapshots;
 *  - cycle facts + remaining capacity are DB-driven (close timestamp, delivery
 *    price, free places), and the close gate flips with the real timestamp;
 *  - the rendered public pages contain NO hard-coded cycle strings
 *    (November-2026 / 37 / 50 / a hard-coded price).
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, afterAll, describe, expect, it } from "vitest";

const projectRoot = fileURLToPath(new URL("../..", import.meta.url));

const dir = mkdtempSync(join(tmpdir(), "vedella-public-"));
const dbPath = join(dir, "test.db");
process.env.DATABASE_URL = `file:${dbPath}`;
process.env.PUBLIC_OFFER_MODEL_ENABLED = "true"; // M8 read path ON

execSync("npx prisma db push --skip-generate --accept-data-loss", {
  cwd: projectRoot,
  env: { ...process.env },
  stdio: "ignore",
});

const { prisma } = await import("../../src/lib/db");
const { getFarmCatalog, getActiveCycleFacts } = await import(
  "../../src/lib/catalog"
);
const { makeFarm, makeDefinition, makeOffer, makeOfferLot } = await import(
  "../helpers/fixtures"
);

const DAY = 86_400_000;

beforeAll(async () => {
  // Two approved+active farms, each offering "Entrecot" of the SAME shared
  // definition at DIFFERENT prices/weights (independent per-farm offer values).
  const farmA = await makeFarm(prisma, { slug: "dyn-a", name: "Dyn Farm A" });
  const farmB = await makeFarm(prisma, { slug: "dyn-b", name: "Dyn Farm B" });
  const def = await makeDefinition(prisma, { canonicalName: "Entrecot" });

  const offerA = await makeOffer(prisma, farmA.id, def.id, {
    publicName: "Entrecot",
    priceAmountCents: 1438,
  });
  await prisma.farmProductOffer.update({
    where: { id: offerA.id },
    data: { expectedUnitWeightMinG: 300, expectedUnitWeightMaxG: 300 },
  });
  await makeOfferLot(prisma, farmA.id, offerA.id, { reference: "DYNA-L1", units: 20 });

  const offerB = await makeOffer(prisma, farmB.id, def.id, {
    publicName: "Entrecot",
    priceAmountCents: 1588, // DIFFERENT price
  });
  await prisma.farmProductOffer.update({
    where: { id: offerB.id },
    data: { expectedUnitWeightMinG: 320, expectedUnitWeightMaxG: 320 },
  });
  await makeOfferLot(prisma, farmB.id, offerB.id, { reference: "DYNB-L1", units: 15 });

  // A single-farm V2 pack on farm A built from its offer, pinned to its lot.
  const lotA = await prisma.lot.findFirstOrThrow({
    where: { farmProductOfferId: offerA.id },
  });
  const pack = await prisma.pack.create({
    data: {
      farmId: farmA.id,
      isMultiFarm: false,
      publicName: "Pack Dyn A",
      description: "Pack de prova",
      priceAmountCents: 4200,
      lifecycle: "active",
      isApproved: true,
      isActive: true,
    },
  });
  await prisma.packItemV2.create({
    data: {
      packId: pack.id,
      farmProductOfferId: offerA.id,
      farmId: farmA.id,
      lotId: lotA.id,
      quantity: 2,
    },
  });

  // Active cycle with enriched facts (close in the future -> open).
  const now = Date.now();
  await prisma.reservationCycle.create({
    data: {
      name: "Cicle test dinàmic",
      zone: "Osona",
      closeDate: new Date(now + 10 * DAY),
      deliveryDate: new Date(now + 20 * DAY),
      totalPlaces: 42,
      freePlaces: 29,
      transportNote: "Transport refrigerat.",
      isActive: true,
      publicTitle: "Cicle test dinàmic",
      status: "open",
      closeAt: new Date(now + 10 * DAY),
      pickupDate: new Date(now + 20 * DAY),
      deliveryPriceCents: 650,
    },
  });
}, 60_000);

afterAll(async () => {
  await prisma.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});

describe("offer-model catalog renders independent per-farm values", () => {
  it("each farm shows its OWN offer price + weight for the shared definition", async () => {
    const a = await getFarmCatalog("dyn-a");
    const b = await getFarmCatalog("dyn-b");
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();

    const entA = a!.cuts.find((c) => c.name === "Entrecot");
    const entB = b!.cuts.find((c) => c.name === "Entrecot");
    expect(entA?.basePriceCents).toBe(1438);
    expect(entB?.basePriceCents).toBe(1588); // independent value, not merged
    expect(entA?.weight).toBe("≈ 300 g");
    expect(entB?.weight).toBe("≈ 320 g");
    // Each cut carries its own farm's lot reference.
    expect(entA?.lotReference).toBe("DYNA-L1");
    expect(entB?.lotReference).toBe("DYNB-L1");
  });
});

describe("pack spec table + traceability come from the real composition", () => {
  it("pack items carry per-item farm + lot from the V2 composition", async () => {
    const a = await getFarmCatalog("dyn-a");
    const pack = a!.packs.find((p) => p.name === "Pack Dyn A");
    expect(pack).toBeDefined();
    expect(pack!.items).toHaveLength(1);
    const item = pack!.items[0];
    expect(item.name).toBe("Entrecot");
    expect(item.quantity).toBe(2);
    expect(item.farmName).toBe("Dyn Farm A");
    expect(item.lotReference).toBe("DYNA-L1");
    // The pack's representative lot resolves from the item lot snapshot.
    expect(pack!.lotReference).toBe("DYNA-L1");
  });
});

describe("per-product traceability resolves to the backing offer/farm (FEAT-003)", () => {
  it("each offered cut carries its own Farm -> Lot -> Tall trace from the lot backing that offer", async () => {
    const a = await getFarmCatalog("dyn-a");
    const b = await getFarmCatalog("dyn-b");
    const entA = a!.cuts.find((c) => c.name === "Entrecot")!;
    const entB = b!.cuts.find((c) => c.name === "Entrecot")!;

    // The trace is populated per-product (not aggregated at farm level) and the
    // resolved lot matches the one that actually makes THIS offer offerable.
    expect(entA.trace.farmName).toBe("Dyn Farm A");
    expect(entA.trace.cutName).toBe("Entrecot");
    expect(entA.trace.lotReference).toBe("DYNA-L1");
    expect(entA.trace.lotReference).toBe(entA.lotReference);

    expect(entB.trace.farmName).toBe("Dyn Farm B");
    expect(entB.trace.lotReference).toBe("DYNB-L1");

    // The lot each card points to genuinely belongs to that offer + farm.
    const farmA = await prisma.farm.findFirstOrThrow({ where: { slug: "dyn-a" } });
    const lotA = await prisma.lot.findFirstOrThrow({
      where: { reference: entA.trace.lotReference! },
    });
    const offerA = await prisma.farmProductOffer.findFirstOrThrow({
      where: { id: lotA.farmProductOfferId! },
    });
    expect(lotA.farmId).toBe(farmA.id);
    expect(offerA.farmId).toBe(farmA.id);
    expect(offerA.id).toBe(entA.id);
  });

  it("each pack item carries its own Farm -> Lot -> Tall -> Paquet trace", async () => {
    const a = await getFarmCatalog("dyn-a");
    const pack = a!.packs.find((p) => p.name === "Pack Dyn A")!;
    expect(pack.trace).toHaveLength(pack.items.length);
    const t = pack.trace[0];
    expect(t.farmName).toBe("Dyn Farm A");
    expect(t.cutName).toBe("Entrecot");
    expect(t.lotReference).toBe("DYNA-L1");
    expect(t.packName).toBe("Pack Dyn A");

    // The pack item's resolved lot really belongs to the referenced offer/farm.
    const lot = await prisma.lot.findFirstOrThrow({
      where: { reference: t.lotReference! },
    });
    expect(lot.farmProductOfferId).toBeTruthy();
    const offer = await prisma.farmProductOffer.findFirstOrThrow({
      where: { id: lot.farmProductOfferId! },
    });
    expect(offer.publicName).toBe("Entrecot");
    expect(lot.farmId).toBe(offer.farmId);
  });
});

describe("cycle facts + remaining capacity are DB-driven", () => {
  it("reads zone, close timestamp, delivery price and free places from the DB", async () => {
    const cycle = await getActiveCycleFacts();
    expect(cycle).not.toBeNull();
    expect(cycle!.zone).toBe("Osona");
    expect(cycle!.totalPlaces).toBe(42);
    expect(cycle!.remainingPlaces).toBe(29);
    expect(cycle!.deliveryPriceCents).toBe(650);
    expect(cycle!.closed).toBe(false); // close is in the future
    // The countdown target is the real closeAt ISO timestamp.
    expect(new Date(cycle!.closeAtIso).getTime()).toBeGreaterThan(Date.now());
  });

  it("the close gate flips once the real close timestamp has passed", async () => {
    // Move the active cycle's close into the past.
    const active = await prisma.reservationCycle.findFirstOrThrow({
      where: { isActive: true },
    });
    await prisma.reservationCycle.update({
      where: { id: active.id },
      data: { closeAt: new Date(Date.now() - 1000) },
    });
    const cycle = await getActiveCycleFacts();
    expect(cycle!.closed).toBe(true);
    // restore
    await prisma.reservationCycle.update({
      where: { id: active.id },
      data: { closeAt: new Date(Date.now() + 10 * DAY) },
    });
  });
});

describe("no hard-coded cycle strings remain in the rendered public pages", () => {
  it("home + farm + basket page sources contain no November-2026/37/50/price literals", () => {
    const files = [
      "src/app/[locale]/page.tsx",
      "src/app/[locale]/farms/[slug]/page.tsx",
      "src/app/[locale]/basket/page.tsx",
    ];
    for (const rel of files) {
      const src = readFileSync(join(projectRoot, rel), "utf8");
      expect(src).not.toMatch(/novembre 2026/i);
      expect(src).not.toMatch(/November 2026/i);
      // No hard-coded "37/50" capacity literal.
      expect(src).not.toMatch(/37\s*\/\s*50/);
      // No hard-coded euro price literal like "42,00 €".
      expect(src).not.toMatch(/\d+,\d{2}\s*€/);
    }
  });
});
