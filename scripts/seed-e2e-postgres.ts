/**
 * Synthetic PostgreSQL e2e seed (FEAT-002, condition 3).
 *
 * Builds a deterministic, Vercel/Neon-realistic dataset for the Playwright e2e
 * suite directly against the Postgres `@prisma/client` (provider=postgresql).
 * It is SEPARATE from prisma/seed.ts: that seed builds the full demo
 * marketplace and self-guards against re-running on a populated DB, whereas this
 * module is a focused, SELF-RESETTING e2e fixture (wipe-then-insert, mirroring
 * prisma/seed.ts) that is safe to run repeatedly before every e2e run.
 *
 * It creates exactly the condition-3 personas + data:
 *   - platform administrator (forced-change identity + a stable e2e admin)
 *   - Farm A manager, Farm B manager
 *   - a customer
 *   - (logged-out is implicit)
 *   - Farm A, Farm B (both approved + active)
 *   - one Entrecot OFFER per farm with DIFFERENT price AND weight
 *   - a VALID lot and an INVALID (withdrawn) lot
 *   - an OPEN reservation cycle and a CLOSED one
 *   - a test-labelled (isTest=true) and a production-labelled (isTest=false) order
 *
 * Conventions reused from the repo: tsx-run TS, prisma/seed.ts wipe pattern,
 * src/lib/password.ts hashPassword, and the shared validateLot guard.
 *
 * SAFETY: this must only ever run against a throwaway TEST database. It refuses
 * to run unless TEST_DATABASE_URL or E2E_DATABASE_URL is set (the e2e scripts
 * point DATABASE_URL at that value), so it can never wipe a real database by
 * accident.
 */
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";
import { validateLot } from "../src/lib/validateLot";
import {
  E2E_ADMIN_EMAIL,
  E2E_ADMIN_PASSWORD,
} from "../e2e/helpers";

const SEED_TEMP_PASSWORD =
  process.env.SEED_ADMIN_TEMP_PASSWORD?.trim() || "ChangeMe123!";

function dayMs(n: number): number {
  return n * 24 * 60 * 60 * 1000;
}

/** Deterministic lot dates satisfying slaughter <= cutting <= packing < expiry. */
function lotDates(baseDaysAgo: number) {
  const now = Date.now();
  return {
    slaughterDate: new Date(now - dayMs(baseDaysAgo + 25)),
    cuttingDate: new Date(now - dayMs(baseDaysAgo + 23)),
    packingDate: new Date(now - dayMs(baseDaysAgo + 22)),
    expiryDate: new Date(now - dayMs(baseDaysAgo) + dayMs(40)),
  };
}

/**
 * Wipe-then-insert, mirroring prisma/seed.ts's clean-slate order (children
 * before parents) so repeated e2e runs always start from the same state.
 */
async function wipe(prisma: PrismaClient): Promise<void> {
  await prisma.analyticsEvent.deleteMany();
  await prisma.channelAttribution.deleteMany();
  await prisma.interestedContact.deleteMany();
  await prisma.fulfilmentGroup.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.packItemV2.deleteMany();
  await prisma.packFarmAcceptance.deleteMany();
  await prisma.pack.deleteMany();
  await prisma.packItem.deleteMany();
  await prisma.cycleOfferAvailability.deleteMany();
  await prisma.cycleFarm.deleteMany();
  await prisma.lot.deleteMany();
  await prisma.farmCertification.deleteMany();
  await prisma.farmProfileEdit.deleteMany();
  await prisma.farmProductOffer.deleteMany();
  await prisma.productDefinition.deleteMany();
  await prisma.product.deleteMany();
  await prisma.reservationCycle.deleteMany();
  await prisma.translation.deleteMany();
  await prisma.aiRun.deleteMany();
  await prisma.user.deleteMany();
  await prisma.farm.deleteMany();
}

interface FarmSpec {
  slug: string;
  name: string;
  town: string;
  managerEmail: string;
  // Entrecot offer: distinct price + weight per farm (condition 3).
  entrecotPriceCents: number;
  entrecotWeightMinG: number;
  entrecotWeightMaxG: number;
}

const FARM_A: FarmSpec = {
  slug: "e2e-farm-a",
  name: "Granja A — e2e",
  town: "Vallgorguina",
  managerEmail: "manager-a@vedellalocal.example",
  entrecotPriceCents: 1438,
  entrecotWeightMinG: 280,
  entrecotWeightMaxG: 320,
};

const FARM_B: FarmSpec = {
  slug: "e2e-farm-b",
  name: "Granja B — e2e",
  town: "Sant Celoni",
  managerEmail: "manager-b@vedellalocal.example",
  // DIFFERENT price AND weight than Farm A.
  entrecotPriceCents: 1562,
  entrecotWeightMinG: 330,
  entrecotWeightMaxG: 380,
};

export async function seedE2ePostgres(prisma: PrismaClient): Promise<void> {
  await wipe(prisma);

  const tempHash = await hashPassword(SEED_TEMP_PASSWORD);
  const adminHash = await hashPassword(E2E_ADMIN_PASSWORD);

  // --- Personas ------------------------------------------------------------
  // Platform administrator with a FORCED change-password (exercises the forced
  // flow spec) ...
  await prisma.user.create({
    data: {
      email: "admin@vedellalocal.example",
      name: "Plataforma — administració (e2e)",
      role: "platform_admin",
      passwordHash: tempHash,
      mustChangePassword: true,
    },
  });
  // ... and a stable e2e admin whose password is already set so the admin flows
  // are deterministic (matches e2e/helpers.ts + global-setup expectations).
  await prisma.user.create({
    data: {
      email: E2E_ADMIN_EMAIL,
      name: "E2E — administració",
      role: "platform_admin",
      passwordHash: adminHash,
      mustChangePassword: false,
    },
  });
  // A customer (temporary password; used by the denied-access flow).
  await prisma.user.create({
    data: {
      email: "client@vedellalocal.example",
      name: "Client de prova (e2e)",
      role: "customer",
      passwordHash: tempHash,
      mustChangePassword: true,
    },
  });

  // --- Two farms, each with the SAME shared Entrecot definition but DIFFERENT
  // per-farm offer price + weight (condition 3 / R-PM3). ---------------------
  const entrecotDefinition = await prisma.productDefinition.create({
    data: {
      canonicalName: "Entrecot",
      category: "cut",
      description: "Entrecot madurat.",
      translationKey: "cut.entrecot.e2e",
      lifecycle: "active",
      isApproved: true,
      isActive: true,
      isTest: false,
    },
  });

  const openCycle = await prisma.reservationCycle.create({
    data: {
      name: "Cicle obert — e2e",
      zone: "Vallès Oriental",
      closeDate: new Date(Date.now() + dayMs(20)),
      deliveryDate: new Date(Date.now() + dayMs(30)),
      totalPlaces: 50,
      freePlaces: 37,
      transportNote: "Transport refrigerat (0–4 °C).",
      isActive: true,
      isTest: false,
      internalName: "e2e-open",
      publicTitle: "Cicle obert — e2e",
      status: "open",
      openAt: new Date(Date.now() - dayMs(5)),
      closeAt: new Date(Date.now() + dayMs(20)),
      pickupDate: new Date(Date.now() + dayMs(30)),
      deliveryPriceCents: 600,
    },
  });

  // A CLOSED cycle (reservations no longer accepted).
  await prisma.reservationCycle.create({
    data: {
      name: "Cicle tancat — e2e",
      zone: "Vallès Oriental",
      closeDate: new Date(Date.now() - dayMs(10)),
      deliveryDate: new Date(Date.now() - dayMs(2)),
      totalPlaces: 40,
      freePlaces: 0,
      transportNote: "Transport refrigerat (0–4 °C).",
      isActive: false,
      isTest: false,
      internalName: "e2e-closed",
      publicTitle: "Cicle tancat — e2e",
      status: "closed",
      openAt: new Date(Date.now() - dayMs(40)),
      closeAt: new Date(Date.now() - dayMs(10)),
      pickupDate: new Date(Date.now() - dayMs(2)),
      deliveryPriceCents: 600,
    },
  });

  const seenReferences = new Set<string>();
  let lotCounter = 0;
  const offersByFarm: { farmId: string; offerId: string; priceCents: number }[] = [];

  for (const spec of [FARM_A, FARM_B]) {
    const manager = await prisma.user.create({
      data: {
        email: spec.managerEmail,
        name: `${spec.name} — gestor`,
        role: "farm_manager",
        passwordHash: tempHash,
        mustChangePassword: true,
      },
    });

    const farm = await prisma.farm.create({
      data: {
        slug: spec.slug,
        name: spec.name,
        town: spec.town,
        comarca: "Vallès Oriental",
        breed: "Bruna dels Pirineus",
        foundedYear: 1990,
        animalCount: 50,
        story: `${spec.name}: explotació de prova per a l'e2e.`,
        lifecycle: "active",
        isApproved: true,
        isActive: true,
        isTest: false,
      },
    });
    await prisma.user.update({ where: { id: manager.id }, data: { farmId: farm.id } });

    // Legacy Product (the lot composite FK still points here) ...
    const product = await prisma.product.create({
      data: {
        farmId: farm.id,
        kind: "cut",
        name: "Entrecot",
        description: "Entrecot madurat.",
        basePriceCents: spec.entrecotPriceCents,
        weight: `${spec.entrecotWeightMinG}–${spec.entrecotWeightMaxG} g`,
        thickness: "2,5 cm",
        maturation: "21 dies",
        packaging: "Envasat al buit",
        shelfLife: "10 dies en fred (0–4 °C)",
        lifecycle: "active",
        isApproved: true,
        isActive: true,
        isTest: false,
      },
    });

    // ... and the per-farm OFFER carrying this farm's distinct price + weight.
    const offer = await prisma.farmProductOffer.create({
      data: {
        farmId: farm.id,
        productDefinitionId: entrecotDefinition.id,
        publicName: "Entrecot",
        description: "Entrecot madurat.",
        priceAmountCents: spec.entrecotPriceCents,
        priceUnit: "per_unit",
        expectedUnitWeightMinG: spec.entrecotWeightMinG,
        expectedUnitWeightMaxG: spec.entrecotWeightMaxG,
        maturationDays: 21,
        storageState: "chilled",
        minimumShelfLifeDays: 10,
        lifecycle: "active",
        isApproved: true,
        isActive: true,
        isTest: false,
      },
    });
    offersByFarm.push({ farmId: farm.id, offerId: offer.id, priceCents: spec.entrecotPriceCents });

    // A VALID, in-stock lot (passes the shared guard) ...
    lotCounter++;
    const validRef = `${spec.slug.toUpperCase().slice(0, 6)}-L${String(lotCounter).padStart(4, "0")}`;
    const validInput = {
      farmId: farm.id,
      productId: product.id,
      reference: validRef,
      units: 20,
      ...lotDates(2),
    };
    validateLot(validInput, {
      product: { id: product.id, farmId: farm.id },
      existingReferences: seenReferences,
    });
    seenReferences.add(validRef);
    await prisma.lot.create({
      data: {
        ...validInput,
        farmProductOfferId: offer.id,
        isWithdrawn: false,
        isTest: false,
      },
    });

    // ... and an INVALID (withdrawn, out-of-stock) lot: the guard still accepts
    // the shape, but the WITHDRAWN + zero-units state means it must never back a
    // public offer (R13). This is the "invalid lot" fixture.
    lotCounter++;
    const invalidRef = `${spec.slug.toUpperCase().slice(0, 6)}-WD${String(lotCounter).padStart(4, "0")}`;
    const invalidInput = {
      farmId: farm.id,
      productId: product.id,
      reference: invalidRef,
      units: 0,
      ...lotDates(30),
    };
    validateLot(invalidInput, {
      product: { id: product.id, farmId: farm.id },
      existingReferences: seenReferences,
    });
    seenReferences.add(invalidRef);
    await prisma.lot.create({
      data: {
        ...invalidInput,
        farmProductOfferId: offer.id,
        isWithdrawn: true,
        isTest: false,
      },
    });

    // Participate in the open cycle with an eligible lot entry.
    await prisma.cycleFarm.create({
      data: { cycleId: openCycle.id, farmId: farm.id, allocatedPlaces: 25 },
    });
    await prisma.cycleOfferAvailability.create({
      data: {
        cycleId: openCycle.id,
        farmProductOfferId: offer.id,
        farmId: farm.id,
        hasEligibleLot: true,
      },
    });
  }

  // --- Orders: one PRODUCTION (isTest=false) and one TEST (isTest=true) so
  // metric-exclusion behaviour has concrete rows (R15). ----------------------
  const prodOffer = offersByFarm[0];
  const testOffer = offersByFarm[1];

  await prisma.order.create({
    data: {
      cycleId: openCycle.id,
      status: "confirmed",
      lotReferenceSnapshot: "",
      subtotalCents: prodOffer.priceCents,
      discountCents: 0,
      deliveryFeeCents: 600,
      totalCents: prodOffer.priceCents + 600,
      isTest: false,
      deliveryMethod: "delivery",
      items: {
        create: [
          {
            farmProductOfferId: prodOffer.offerId,
            farmId: prodOffer.farmId,
            nameSnapshot: "Entrecot",
            priceCentsSnapshot: prodOffer.priceCents,
            quantity: 1,
          },
        ],
      },
      fulfilmentGroups: {
        create: [{ farmId: prodOffer.farmId, status: "preparing", subtotalCents: prodOffer.priceCents }],
      },
    },
  });

  await prisma.order.create({
    data: {
      cycleId: openCycle.id,
      status: "confirmed",
      lotReferenceSnapshot: "",
      subtotalCents: testOffer.priceCents,
      discountCents: 0,
      deliveryFeeCents: 600,
      totalCents: testOffer.priceCents + 600,
      isTest: true,
      deliveryMethod: "pickup",
      items: {
        create: [
          {
            farmProductOfferId: testOffer.offerId,
            farmId: testOffer.farmId,
            nameSnapshot: "Entrecot",
            priceCentsSnapshot: testOffer.priceCents,
            quantity: 1,
          },
        ],
      },
      fulfilmentGroups: {
        create: [{ farmId: testOffer.farmId, status: "preparing", subtotalCents: testOffer.priceCents }],
      },
    },
  });
}

async function main(): Promise<void> {
  const testUrl =
    process.env.TEST_DATABASE_URL?.trim() || process.env.E2E_DATABASE_URL?.trim();
  if (!testUrl) {
    throw new Error(
      "seed-e2e-postgres: refusing to run without TEST_DATABASE_URL or " +
        "E2E_DATABASE_URL set. This seed WIPES its target database and must only " +
        "run against a throwaway e2e Postgres (local Docker or a Neon dev branch). " +
        "See docs/postgres-e2e-env.md.",
    );
  }
  // Point the Postgres client at the test URL (both pooled + direct map to it).
  process.env.DATABASE_URL = testUrl;
  process.env.DIRECT_URL = testUrl;

  const prisma = new PrismaClient();
  try {
    console.log("Seeding synthetic Postgres e2e fixtures (self-resetting)...");
    await seedE2ePostgres(prisma);
    console.log(
      "  ✓ e2e fixtures: 2 farms, per-farm Entrecot offers (distinct price+weight), " +
        "valid + withdrawn lots, open + closed cycles, production + test orders.",
    );
    console.log("e2e Postgres seed complete.");
  } finally {
    await prisma.$disconnect();
  }
}

// Only run as a script when invoked directly (tsx scripts/seed-e2e-postgres.ts),
// so the fixture builder can also be imported by global-setup.
if (process.argv[1] && process.argv[1].includes("seed-e2e-postgres")) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
