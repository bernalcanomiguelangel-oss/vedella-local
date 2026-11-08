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
import {
  E2E_ADMIN_EMAIL,
  E2E_ADMIN_PASSWORD,
} from "./helpers";

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
    // Pick the seeded pending_review product to also exercise approval, and add
    // a machine (AI) translation on an active product so the approve-translation
    // flow has a concrete row to publish.
    const product = await prisma.product.findFirst({
      where: { name: "Entrecot", isActive: true },
      orderBy: { createdAt: "asc" },
    });
    if (product) {
      await prisma.translation.upsert({
        where: {
          entityType_entityId_field_locale: {
            entityType: "product",
            entityId: product.id,
            field: "name",
            locale: "en",
          },
        },
        create: {
          entityType: "product",
          entityId: product.id,
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
  // Deterministic seed (idempotent: the seed wipes + repopulates).
  execSync("npm run seed", { stdio: "inherit" });
  await seedE2eAdmin();
  await seedMachineTranslation();
}
