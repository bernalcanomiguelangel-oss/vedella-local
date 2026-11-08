/**
 * Integration-test database helper. Creates a real, isolated SQLite database
 * per test file (file-backed so Prisma works normally), applies the schema with
 * `prisma db push`, and returns a PrismaClient pointed at it. The CHECK
 * constraints from the init migration are reproduced here so the invariant tests
 * exercise real DB-level enforcement (prisma db push does not replay migration
 * SQL, so we add the CHECKs explicitly after pushing).
 */
import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const projectRoot = fileURLToPath(new URL("../..", import.meta.url));

export interface TestDb {
  prisma: PrismaClient;
  cleanup: () => Promise<void>;
}

export async function createTestDb(): Promise<TestDb> {
  const dir = mkdtempSync(join(tmpdir(), "vedella-test-"));
  const dbPath = join(dir, "test.db");
  const url = `file:${dbPath}`;

  // Apply the Prisma schema to the fresh database.
  execSync("npx prisma db push --skip-generate --accept-data-loss", {
    cwd: projectRoot,
    env: { ...process.env, DATABASE_URL: url },
    stdio: "ignore",
  });

  const prisma = new PrismaClient({ datasources: { db: { url } } });

  // Reproduce the integrity CHECK constraints that live in the init migration
  // (prisma db push creates tables without them). We rebuild the Lot and
  // ReservationCycle tables with CHECKs so DB-level invariants are testable.
  await addCheckConstraints(prisma);

  return {
    prisma,
    async cleanup() {
      await prisma.$disconnect();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

async function addCheckConstraints(prisma: PrismaClient): Promise<void> {
  // SQLite cannot ALTER TABLE ADD CONSTRAINT. Recreate the tables with CHECKs.
  // Tables are empty at this point (freshly pushed), so copying is trivial.
  await prisma.$executeRawUnsafe("PRAGMA foreign_keys=OFF;");

  // Lot: units >= 0 and date ordering.
  await prisma.$executeRawUnsafe(`
    CREATE TABLE "Lot_new" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "farmId" TEXT NOT NULL,
      "productId" TEXT NOT NULL,
      "reference" TEXT NOT NULL,
      "units" INTEGER NOT NULL DEFAULT 0,
      "isWithdrawn" BOOLEAN NOT NULL DEFAULT false,
      "isTest" BOOLEAN NOT NULL DEFAULT false,
      "slaughterDate" DATETIME NOT NULL,
      "cuttingDate" DATETIME NOT NULL,
      "packingDate" DATETIME NOT NULL,
      "expiryDate" DATETIME NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL,
      CONSTRAINT "Lot_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT "Lot_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT "Lot_units_nonneg" CHECK ("units" >= 0),
      CONSTRAINT "Lot_date_order" CHECK (
        "slaughterDate" <= "cuttingDate"
        AND "cuttingDate" <= "packingDate"
        AND "packingDate" < "expiryDate"
      )
    );
  `);
  await prisma.$executeRawUnsafe(`DROP TABLE "Lot";`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "Lot_new" RENAME TO "Lot";`);
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX "Lot_reference_key" ON "Lot"("reference");`,
  );
  await prisma.$executeRawUnsafe(`CREATE INDEX "Lot_farmId_idx" ON "Lot"("farmId");`);
  await prisma.$executeRawUnsafe(
    `CREATE INDEX "Lot_productId_idx" ON "Lot"("productId");`,
  );

  // ReservationCycle: freePlaces >= 0 and freePlaces <= totalPlaces (no oversell).
  await prisma.$executeRawUnsafe(`
    CREATE TABLE "ReservationCycle_new" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "name" TEXT NOT NULL,
      "zone" TEXT NOT NULL,
      "closeDate" DATETIME NOT NULL,
      "deliveryDate" DATETIME NOT NULL,
      "totalPlaces" INTEGER NOT NULL,
      "freePlaces" INTEGER NOT NULL,
      "transportNote" TEXT NOT NULL DEFAULT '',
      "isActive" BOOLEAN NOT NULL DEFAULT false,
      "isTest" BOOLEAN NOT NULL DEFAULT false,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL,
      CONSTRAINT "ReservationCycle_places_valid" CHECK (
        "freePlaces" >= 0
        AND "totalPlaces" >= 0
        AND "freePlaces" <= "totalPlaces"
      )
    );
  `);
  await prisma.$executeRawUnsafe(`DROP TABLE "ReservationCycle";`);
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "ReservationCycle_new" RENAME TO "ReservationCycle";`,
  );

  await prisma.$executeRawUnsafe("PRAGMA foreign_keys=ON;");
}
