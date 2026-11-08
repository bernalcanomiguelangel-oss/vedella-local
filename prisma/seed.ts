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

const prisma = new PrismaClient();

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
  await prisma.product.deleteMany();
  await prisma.reservationCycle.deleteMany();
  await prisma.translation.deleteMany();
  await prisma.aiRun.deleteMany();
  await prisma.marketPriceSnapshot.deleteMany();
  await prisma.user.deleteMany();
  await prisma.farm.deleteMany();

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

    // Create cuts first (packs reference them via PackItem).
    const cutByKey: Record<string, string> = {};
    for (const c of CUTS) {
      const product = await prisma.product.create({
        data: {
          farmId: farm.id,
          kind: "cut",
          name: c.name,
          description: c.description,
          basePriceCents: c.priceCents,
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
