/**
 * Playwright global setup: seed the database deterministically before the e2e
 * run so the flows (browse -> reserve, admin approve, language switch) always
 * have the same starting data (two approved farms, an active cycle, a
 * pending_review product + a machine translation to approve).
 *
 * This runs once, before the webServer and specs. It shells out to the existing
 * `npm run seed`, then inserts a machine translation for the admin-approve flow.
 */
import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";
import { seedE2ePostgres } from "../scripts/seed-e2e-postgres";
import {
  E2E_ADMIN_EMAIL,
  E2E_ADMIN_PASSWORD,
} from "./helpers";

/**
 * FEAT-002: when a Postgres e2e URL is provided (local Docker TEST_DATABASE_URL
 * or a Neon dev-branch E2E_DATABASE_URL, Vercel-realistic), point the Prisma
 * clients used by this setup at it and seed the synthetic Postgres fixtures.
 * When UNSET, fall back to the current behaviour (`npm run seed` against the
 * ambient DATABASE_URL). This keeps the local-SQLite dev flow untouched.
 */
const e2eDbUrl =
  process.env.TEST_DATABASE_URL?.trim() || process.env.E2E_DATABASE_URL?.trim();

/**
 * Create a dedicated e2e platform admin whose password is already set
 * (mustChangePassword=false) so the specs log in with a stable, known password
 * and reach the dashboard directly. The seeded production-like identities keep
 * their forced change-password flow (which the forced-change e2e exercises
 * separately); this account only makes the admin flows deterministic across the
 * shared DB without any test mutating another test's credentials.
 */
async function seedE2eAdmin() {
  const prisma = new PrismaClient();
  try {
    const passwordHash = await hashPassword(E2E_ADMIN_PASSWORD);
    await prisma.user.upsert({
      where: { email: E2E_ADMIN_EMAIL },
      create: {
        email: E2E_ADMIN_EMAIL,
        name: "E2E — administració",
        role: "platform_admin",
        passwordHash,
        mustChangePassword: false,
      },
      update: { passwordHash, mustChangePassword: false, role: "platform_admin" },
    });
  } finally {
    await prisma.$disconnect();
  }
}

async function seedMachineTranslation() {
  const prisma = new PrismaClient();
  try {
    // Add a machine (AI) translation on an active Entrecot OFFER so the
    // approve-translation flow has a concrete row to publish through the
    // offer-model public read path (M8 / FEAT-007). The public catalog renders
    // offers, so the translation must key on the offer id (entityType
    // "product", which the review + catalog paths resolve to an offer).
    const offer = await prisma.farmProductOffer.findFirst({
      where: { publicName: "Entrecot", isActive: true },
      orderBy: { createdAt: "asc" },
    });
    if (offer) {
      await prisma.translation.upsert({
        where: {
          entityType_entityId_field_locale: {
            entityType: "product",
            entityId: offer.id,
            field: "name",
            locale: "en",
          },
        },
        create: {
          entityType: "product",
          entityId: offer.id,
          field: "name",
          locale: "en",
          text: "[EN] Ribeye steak (machine)",
          status: "machine",
          source: "mock",
        },
        update: {
          text: "[EN] Ribeye steak (machine)",
          status: "machine",
          source: "mock",
        },
      });
    }
  } finally {
    await prisma.$disconnect();
  }
}

export default async function globalSetup() {
  if (e2eDbUrl) {
    // Vercel/Neon-realistic Postgres path: seed the synthetic e2e fixtures
    // directly (self-resetting wipe-then-insert) against the test URL. The
    // Prisma clients below read DATABASE_URL/DIRECT_URL, so set them here too so
    // seedE2eAdmin/seedMachineTranslation target the same database.
    process.env.DATABASE_URL = e2eDbUrl;
    process.env.DIRECT_URL = e2eDbUrl;
    const prisma = new PrismaClient();
    try {
      await seedE2ePostgres(prisma);
    } finally {
      await prisma.$disconnect();
    }
  } else {
    // Local fallback: deterministic seed (idempotent: the seed wipes + repopulates).
    execSync("npm run seed", { stdio: "inherit" });
  }
  await seedE2eAdmin();
  await seedMachineTranslation();
}
