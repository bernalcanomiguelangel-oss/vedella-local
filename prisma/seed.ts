/**
 * Seed two fantasy farms, their packs/cuts, pack items, lots, and one active
 * reservation cycle. Both farms are approved + active. At least one record is
 * marked isTest to exercise metric exclusion (R15).
 *
 * All prices are integer cents. Catalan is the default language.
 *
 * The seed validates every lot with the shared validateLot() guard so the data
 * can never violate the traceability invariants.
 */
import { PrismaClient } from "@prisma/client";
import { validateLot } from "../src/lib/validateLot";
import { hashPassword } from "../src/lib/password";
import { backfillOffers, verifyBackfill } from "../src/lib/migrate/backfill-offers";

const prisma = new PrismaClient();

// Temporary seed password for every seeded identity (including the main admin).
// Sourced from an env var so a deployment can override it; otherwise a clearly
// NON-SECRET, documented development default is used. Because this is a known,
// shared temporary value, EVERY seeded user starts with mustChangePassword=true
// and must set their own password on first login. The raw value is NEVER logged.
const SEED_TEMP_PASSWORD =
  process.env.SEED_ADMIN_TEMP_PASSWORD?.trim() || "ChangeMe123!";

// Main admin (the platform owner). New farms can be registered only by this
// account. Created with a temporary password and forced to change it on first
// login (the shared password is treated as compromised).
const MAIN_ADMIN_EMAIL = "miguel@admin.com";

// --- Pack base prices (cents) -------------------------------------------------
const PACK_PRICES = {
  A: 4200, // Pack A · Descoberta
  B: 7900, // Pack B · Graella
  C: 5800, // Pack C · Diari i cocció lenta
} as const;

// --- Individual cut prices (cents; already include +15% surcharge) ------------
interface CutSeed {
  key: string;
  name: string;
  priceCents: number;
  weight: string;
  thickness: string;
  maturation: string;
  packaging: string;
  shelfLife: string;
  description: string;
}

const CUTS: CutSeed[] = [
  {
    key: "entrecot",
    name: "Entrecot",
    priceCents: 1438,
    weight: "≈ 300 g",
    thickness: "2,5 cm",
    maturation: "21 dies",
    packaging: "Envasat al buit",
    shelfLife: "10 dies en fred (0–4 °C)",
    description: "Entrecot madurat, infiltrat i melós, ideal a la brasa o planxa.",
  },
  {
    key: "llom-baix",
    name: "Llom baix",
    priceCents: 1265,
    weight: "≈ 280 g",
    thickness: "2 cm",
    maturation: "21 dies",
    packaging: "Envasat al buit",
    shelfLife: "10 dies en fred (0–4 °C)",
    description: "Llom baix tendre i magre, perfecte per a filets a la planxa.",
  },
  {
    key: "hamburguesa-2u",
    name: "Hamburguesa 2u",
    priceCents: 748,
    weight: "2 × 150 g",
    thickness: "1,5 cm",
    maturation: "Carn fresca",
    packaging: "Safata atmosfera protectora",
    shelfLife: "7 dies en fred (0–4 °C)",
    description: "Dues hamburgueses 100% vedella, sense additius.",
  },
  {
    key: "carn-picada",
    name: "Carn picada",
    priceCents: 920,
    weight: "≈ 500 g",
    thickness: "—",
    maturation: "Carn fresca",
    packaging: "Safata atmosfera protectora",
    shelfLife: "5 dies en fred (0–4 °C)",
    description: "Carn picada de vedella per a bolonyeses, mandonguilles i farcits.",
  },
  {
    key: "galta",
    name: "Galta",
    priceCents: 1035,
    weight: "≈ 400 g",
    thickness: "—",
    maturation: "Carn fresca",
    packaging: "Envasat al buit",
    shelfLife: "8 dies en fred (0–4 °C)",
    description: "Galta de vedella gelatinosa, ideal per a cocció lenta i estofats.",
  },
  {
    key: "carn-per-estofar",
    name: "Carn per estofar",
    priceCents: 978,
    weight: "≈ 500 g",
    thickness: "Daus 3 cm",
    maturation: "Carn fresca",
    packaging: "Envasat al buit",
    shelfLife: "8 dies en fred (0–4 °C)",
    description: "Daus de vedella per a estofats, fricandó i guisats.",
  },
  {
    key: "brou-dos-1l",
    name: "Brou d'os 1L",
    priceCents: 700,
    weight: "1 L",
    thickness: "—",
    maturation: "—",
    packaging: "Ampolla de vidre",
    shelfLife: "4 dies en fred un cop obert",
    description: "Brou d'os de vedella cuit a foc lent 18 hores, ric en col·lagen.",
  },
];

// --- Pack compositions: which cuts (by key) and quantities per pack ----------
const PACK_ITEMS: Record<"A" | "B" | "C", { cutKey: string; quantity: number }[]> = {
  A: [
    { cutKey: "entrecot", quantity: 1 },
    { cutKey: "hamburguesa-2u", quantity: 1 },
    { cutKey: "carn-picada", quantity: 1 },
  ],
  B: [
    { cutKey: "entrecot", quantity: 2 },
    { cutKey: "llom-baix", quantity: 2 },
    { cutKey: "hamburguesa-2u", quantity: 2 },
  ],
  C: [
    { cutKey: "galta", quantity: 1 },
    { cutKey: "carn-per-estofar", quantity: 2 },
    { cutKey: "carn-picada", quantity: 1 },
    { cutKey: "brou-dos-1l", quantity: 1 },
  ],
};

const PACKS: { key: "A" | "B" | "C"; name: string; priceCents: number; weight: string; description: string }[] = [
  {
    key: "A",
    name: "Pack A · Descoberta",
    priceCents: PACK_PRICES.A,
    weight: "≈ 1500–1700 g",
    description: "Una primera presa de contacte amb la vedella de proximitat.",
  },
  {
    key: "B",
    name: "Pack B · Graella",
    priceCents: PACK_PRICES.B,
    weight: "≈ 2300–2600 g",
    description: "Selecció pensada per a la brasa i la graella d'estiu.",
  },
  {
    key: "C",
    name: "Pack C · Diari i cocció lenta",
    priceCents: PACK_PRICES.C,
    weight: "≈ 3000–3300 g",
    description: "Peces de cocció lenta i carn per al dia a dia.",
  },
];

interface FarmSeed {
  slug: string;
  name: string;
  town: string;
  comarca: string;
  breed: string;
  foundedYear: number;
  animalCount: number;
  story: string;
  isTest: boolean;
}

const FARMS: FarmSeed[] = [
  {
    slug: "mas-vallgorguina",
    name: "Mas Vallgorguina",
    town: "Vallgorguina",
    comarca: "Vallès Oriental",
    breed: "Bruna dels Pirineus",
    foundedYear: 1987,
    animalCount: 64,
    story:
      "Explotació familiar al cor del Montnegre. Des de 1987 criem Bruna dels Pirineus en extensiu, amb pastures pròpies i engreix lent sense presses.",
    isTest: false,
  },
  {
    slug: "cal-serrat-del-bosc",
    name: "Cal Serrat del Bosc",
    town: "Sant Celoni",
    comarca: "Vallès Oriental",
    breed: "Bruna dels Pirineus",
    foundedYear: 1994,
    animalCount: 52,
    story:
      "Tres generacions de ramaders a les faldes del Montseny. A Cal Serrat del Bosc apostem per cicles tancats, benestar animal i una traçabilitat de granja a taula.",
    isTest: false,
  },
];

// Deterministic lot dates that satisfy slaughter <= cutting <= packing < expiry.
function lotDates(baseDaysAgo: number) {
  const day = 24 * 60 * 60 * 1000;
  const now = Date.now();
  const slaughterDate = new Date(now - (baseDaysAgo + 25) * day);
  const cuttingDate = new Date(now - (baseDaysAgo + 23) * day);
  const packingDate = new Date(now - (baseDaysAgo + 22) * day);
  const expiryDate = new Date(now - baseDaysAgo * day + 40 * day);
  return { slaughterDate, cuttingDate, packingDate, expiryDate };
}

async function main() {
  console.log("Seeding Vedella Local...");

  // Clean slate (safe for a dev SQLite DB).
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.packItem.deleteMany();
  await prisma.lot.deleteMany();
  await prisma.farmProductOffer.deleteMany();
  await prisma.productDefinition.deleteMany();
  await prisma.product.deleteMany();
  await prisma.reservationCycle.deleteMany();
  await prisma.translation.deleteMany();
  await prisma.aiRun.deleteMany();
  await prisma.marketPriceSnapshot.deleteMany();
  await prisma.user.deleteMany();
  await prisma.farm.deleteMany();

  // Every seeded identity gets the shared TEMPORARY password hash and must
  // change it on first login (mustChangePassword=true). The hash is salted; the
  // raw value is never stored or logged.
  const tempHash = await hashPassword(SEED_TEMP_PASSWORD);

  // The MAIN ADMIN (platform owner). Only this account can register new farms.
  await prisma.user.create({
    data: {
      email: MAIN_ADMIN_EMAIL,
      name: "Miguel — administració principal",
      role: "platform_admin",
      passwordHash: tempHash,
      mustChangePassword: true,
    },
  });

  // Platform-wide demo users: one platform_admin (manages the whole
  // marketplace) and one customer (browses/reserves). A farm_manager per farm is
  // created below. These seeded identities let the demo exercise each role.
  await prisma.user.create({
    data: {
      email: "admin@vedellalocal.example",
      name: "Plataforma — administració",
      role: "platform_admin",
      passwordHash: tempHash,
      mustChangePassword: true,
    },
  });
  await prisma.user.create({
    data: {
      email: "client@vedellalocal.example",
      name: "Client de prova",
      role: "customer",
      passwordHash: tempHash,
      mustChangePassword: true,
    },
  });

  const seenReferences = new Set<string>();
  let lotCounter = 0;

  for (let fi = 0; fi < FARMS.length; fi++) {
    const f = FARMS[fi];

    // Farm manager user.
    const manager = await prisma.user.create({
      data: {
        email: `manager@${f.slug}.example`,
        name: `${f.name} — gestor`,
        role: "farm_manager",
        passwordHash: tempHash,
        mustChangePassword: true,
      },
    });

    const farm = await prisma.farm.create({
      data: {
        slug: f.slug,
        name: f.name,
        town: f.town,
        comarca: f.comarca,
        breed: f.breed,
        foundedYear: f.foundedYear,
        animalCount: f.animalCount,
        story: f.story,
        lifecycle: "active",
        isApproved: true,
        isActive: true,
        isTest: f.isTest,
      },
    });

    // Link manager to the farm (one manager per farm; farmId is unique on User).
    await prisma.user.update({
      where: { id: manager.id },
      data: { farmId: farm.id },
    });

    // Create cuts first (packs reference them via PackItem). Each farm prices
    // its own cuts independently: the second farm applies a small per-farm
    // delta so that, after the M3 backfill, Farm A and Farm B carry DISTINCT
    // FarmProductOffer prices for the SAME shared ProductDefinition (R-PM3).
    const farmPriceDelta = fi * 60; // cents; farm 0 = +0, farm 1 = +60
    const cutByKey: Record<string, string> = {};
    for (const c of CUTS) {
      const product = await prisma.product.create({
        data: {
          farmId: farm.id,
          kind: "cut",
          name: c.name,
          description: c.description,
          basePriceCents: c.priceCents + farmPriceDelta,
          weight: c.weight,
          thickness: c.thickness,
          maturation: c.maturation,
          packaging: c.packaging,
          shelfLife: c.shelfLife,
          lifecycle: "active",
          isApproved: true,
          isActive: true,
          isTest: false,
        },
      });
      cutByKey[c.key] = product.id;
    }

    // Create packs and their PackItems.
    const packByKey: Record<string, string> = {};
    for (const p of PACKS) {
      const pack = await prisma.product.create({
        data: {
          farmId: farm.id,
          kind: "pack",
          name: p.name,
          description: p.description,
          basePriceCents: p.priceCents,
          weight: p.weight,
          lifecycle: "active",
          isApproved: true,
          isActive: true,
          isTest: false,
        },
      });
      packByKey[p.key] = pack.id;

      for (const item of PACK_ITEMS[p.key]) {
        await prisma.packItem.create({
          data: {
            packProductId: pack.id,
            cutProductId: cutByKey[item.cutKey],
            quantity: item.quantity,
          },
        });
      }
    }

    // Create one lot per cut (valid, unique references). The first farm also
    // gets one isTest lot to exercise metric exclusion (R15).
    for (let ci = 0; ci < CUTS.length; ci++) {
      const c = CUTS[ci];
      lotCounter++;
      const reference = `${f.slug.toUpperCase().slice(0, 3)}-L${String(lotCounter).padStart(4, "0")}`;
      const dates = lotDates(ci);
      const units = 20 + ci * 3;

      const lotInput = {
        farmId: farm.id,
        productId: cutByKey[c.key],
        reference,
        units,
        ...dates,
      };

      validateLot(lotInput, {
        product: { id: cutByKey[c.key], farmId: farm.id },
        existingReferences: seenReferences,
      });
      seenReferences.add(reference);

      await prisma.lot.create({
        data: {
          ...lotInput,
          isWithdrawn: false,
          isTest: false,
        },
      });
    }

    // A product whose only lot is withdrawn (R13): it must NOT be publicly
    // offered. Seeded on the second farm so the marketplace has a concrete
    // example the integration tests and demo can rely on.
    if (fi === 1) {
      const withdrawnProduct = await prisma.product.create({
        data: {
          farmId: farm.id,
          kind: "cut",
          name: "Ossobuc (exhaurit)",
          description:
            "Ossobuc de vedella per a cocció lenta. Lot retirat: no disponible.",
          basePriceCents: 1120,
          weight: "≈ 450 g",
          thickness: "3 cm",
          maturation: "Carn fresca",
          packaging: "Envasat al buit",
          shelfLife: "8 dies en fred (0–4 °C)",
          lifecycle: "active",
          isApproved: true,
          isActive: true,
          isTest: false,
        },
      });
      lotCounter++;
      const reference = `${f.slug.toUpperCase().slice(0, 3)}-WD-${String(lotCounter).padStart(4, "0")}`;
      const dates = lotDates(3);
      const withdrawnLot = {
        farmId: farm.id,
        productId: withdrawnProduct.id,
        reference,
        units: 8,
        ...dates,
      };
      validateLot(withdrawnLot, {
        product: { id: withdrawnProduct.id, farmId: farm.id },
        existingReferences: seenReferences,
      });
      seenReferences.add(reference);
      await prisma.lot.create({
        data: { ...withdrawnLot, isWithdrawn: true, isTest: false },
      });
    }

    // A product awaiting human review (lifecycle = pending_review, not yet
    // approved/active) seeded on the first farm. It must NOT appear publicly
    // until a platform_admin approves + activates it in /admin/review. It is
    // backed by a usable lot so that, once approved+active, it is immediately
    // offerable. This gives the admin approval e2e flow a concrete record.
    if (fi === 0) {
      const pendingProduct = await prisma.product.create({
        data: {
          farmId: farm.id,
          kind: "cut",
          name: "Secret de vedella",
          description:
            "Peça jugosa i melosa, pendent de revisió per la plataforma.",
          basePriceCents: 1320,
          weight: "≈ 300 g",
          thickness: "2 cm",
          maturation: "15 dies",
          packaging: "Envasat al buit",
          shelfLife: "9 dies en fred (0–4 °C)",
          lifecycle: "pending_review",
          isApproved: false,
          isActive: false,
          isTest: false,
        },
      });
      lotCounter++;
      const reference = `${f.slug.toUpperCase().slice(0, 3)}-PND-${String(lotCounter).padStart(4, "0")}`;
      const dates = lotDates(4);
      const pendingLot = {
        farmId: farm.id,
        productId: pendingProduct.id,
        reference,
        units: 12,
        ...dates,
      };
      validateLot(pendingLot, {
        product: { id: pendingProduct.id, farmId: farm.id },
        existingReferences: seenReferences,
      });
      seenReferences.add(reference);
      await prisma.lot.create({
        data: { ...pendingLot, isWithdrawn: false, isTest: false },
      });
    }

    // A CURRENT-WEEK lot per cut so the weekly metrics dashboard shows data out
    // of the box (the historical lots above are packed weeks ago and fall into
    // older ISO weeks). Packed two days ago, well inside the current ISO week.
    for (let ci = 0; ci < CUTS.length; ci++) {
      const c = CUTS[ci];
      lotCounter++;
      const reference = `${f.slug.toUpperCase().slice(0, 3)}-CW${String(lotCounter).padStart(4, "0")}`;
      const day = 24 * 60 * 60 * 1000;
      const now = Date.now();
      const currentWeekDates = {
        slaughterDate: new Date(now - 4 * day),
        cuttingDate: new Date(now - 3 * day),
        packingDate: new Date(now - 2 * day),
        expiryDate: new Date(now + 28 * day),
      };
      const cwLot = {
        farmId: farm.id,
        productId: cutByKey[c.key],
        reference,
        units: 15 + ci,
        ...currentWeekDates,
      };
      validateLot(cwLot, {
        product: { id: cutByKey[c.key], farmId: farm.id },
        existingReferences: seenReferences,
      });
      seenReferences.add(reference);
      await prisma.lot.create({
        data: { ...cwLot, isWithdrawn: false, isTest: false },
      });
    }

    // One explicit test/demo lot on the first farm (R15 metric exclusion).
    if (fi === 0) {
      lotCounter++;
      const reference = `${f.slug.toUpperCase().slice(0, 3)}-TEST-${String(lotCounter).padStart(4, "0")}`;
      const dates = lotDates(2);
      const testLot = {
        farmId: farm.id,
        productId: cutByKey["entrecot"],
        reference,
        units: 5,
        ...dates,
      };
      validateLot(testLot, {
        product: { id: cutByKey["entrecot"], farmId: farm.id },
        existingReferences: seenReferences,
      });
      seenReferences.add(reference);
      await prisma.lot.create({
        data: { ...testLot, isWithdrawn: false, isTest: true },
      });
    }

    console.log(`  ✓ ${f.name}: 3 packs, 7 cuts, lots seeded.`);
  }

  // One active reservation cycle: 50 places, 13 taken -> 37 free.
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  await prisma.reservationCycle.create({
    data: {
      name: "Cicle novembre 2026",
      zone: "Vallès Oriental",
      closeDate: new Date(now + 20 * day),
      deliveryDate: new Date(now + 30 * day),
      totalPlaces: 50,
      freePlaces: 37,
      transportNote: "Transport refrigerat (0–4 °C) fins al punt de lliurament.",
      isActive: true,
      isTest: false,
    },
  });

  console.log("  ✓ Active cycle: Cicle novembre 2026 (37/50 places free).");

  // Two-level product model backfill (migration M2-M4). Runs AFTER the legacy
  // Product/Lot rows exist so definitions+offers live alongside them (legacy
  // rows are NOT deleted). The verify step asserts the M3/M4 gates pass.
  const backfill = await backfillOffers(prisma);
  const verified = await verifyBackfill(prisma);
  console.log(
    `  ✓ Product model backfill: ${backfill.definitionsCreated} definitions, ${backfill.offersCreated} offers, ${backfill.lotsRepointed} lots re-pointed (${backfill.needsReviewOffers} needs-review).`,
  );
  console.log(
    `  ✓ Backfill gates OK: offers (${verified.offers}) == cut products (${verified.cutProducts}); ${verified.repointedLots}/${verified.cutLots} cut-lots carry an offer with matching farmId.`,
  );

  console.log(
    `  ✓ Main admin ${MAIN_ADMIN_EMAIL} created with a TEMPORARY password (must change on first login).`,
  );
  console.log("Seed complete.");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
