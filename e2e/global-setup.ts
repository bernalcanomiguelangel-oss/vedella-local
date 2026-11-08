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
  await seedMachineTranslation();
}
