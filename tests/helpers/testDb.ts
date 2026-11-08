/**
 * Integration-test database helper. Creates a real, isolated SQLite database
 * per test file (file-backed so Prisma works normally), applies the schema with
 * `prisma db push`, and returns a PrismaClient pointed at it. The CHECK
 * constraints from the init migration are reproduced here so the invariant tests
 * exercise real DB-level enforcement (prisma db push does not replay migration
 * SQL, so we add the CHECKs explicitly after pushing).
 */
import { execSync } from "node:child_process";
import { mkdtempSync, rmSync, openSync, closeSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const projectRoot = fileURLToPath(new URL("../..", import.meta.url));

// Cross-file lock for the schema push. Vitest runs test files in parallel
// workers; concurrent `prisma db push` invocations share Prisma's engine/
// migration state and collide ("table or index Lot already exists"). An
// exclusive lock file serialises the push so each temp DB is created cleanly.
const LOCK_PATH = join(tmpdir(), "vedella-dbpush.lock");

function acquirePushLock(): () => void {
  const deadline = Date.now() + 60_000;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const fd = openSync(LOCK_PATH, "wx"); // fails if the lock already exists
      return () => {
        try {
          closeSync(fd);
        } catch {
          /* ignore */
        }
        try {
          rmSync(LOCK_PATH, { force: true });
        } catch {
          /* ignore */
        }
      };
    } catch {
      if (Date.now() > deadline) {
        // Stale lock: break it and retry.
        try {
          rmSync(LOCK_PATH, { force: true });
        } catch {
          /* ignore */
        }
      }
      // Busy-wait briefly (synchronous context in setup).
      const until = Date.now() + 25;
      while (Date.now() < until) {
        /* spin */
      }
    }
  }
}

export interface TestDb {
  prisma: PrismaClient;
  cleanup: () => Promise<void>;
}

export async function createTestDb(): Promise<TestDb> {
  const dir = mkdtempSync(join(tmpdir(), "vedella-test-"));
  const dbPath = join(dir, "test.db");
  const url = `file:${dbPath}`;

  // Apply the Prisma schema to the fresh database (serialised across workers).
  const release = acquirePushLock();
  try {
    execSync("npx prisma db push --skip-generate --accept-data-loss", {
      cwd: projectRoot,
      env: { ...process.env, DATABASE_URL: url },
      stdio: "ignore",
    });
  } finally {
    release();
  }

  // connection_limit=1 forces a single SQLite connection so the per-connection
  // `PRAGMA foreign_keys=ON` set below persists for every query (a fresh
  // connection would default FK enforcement OFF, which under parallel load made
  // composite-FK rejection tests intermittently fail).
  const prisma = new PrismaClient({
    datasources: { db: { url: `${url}?connection_limit=1` } },
  });

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

  // R9 backstop: Product needs a (id, farmId) candidate key so Lot's composite
  // FK can target it (prisma db push does not add this index).
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "Product_id_farmId_key" ON "Product"("id", "farmId");`,
  );

  // FarmProductOffer candidate key so Lot's new composite FK can target it. db
  // push creates @@unique([id, farmId]) from the schema, so this is defensive.
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "FarmProductOffer_id_farmId_key" ON "FarmProductOffer"("id", "farmId");`,
  );

  // Lot: units >= 0, date ordering, and BOTH composite FKs enforcing R9
  // (lot.farmId must equal the owning product's AND offer's farmId). productId
  // and farmProductOfferId are both nullable this release (two-level model M4).
  await prisma.$executeRawUnsafe(`
    CREATE TABLE "Lot_new" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "farmId" TEXT NOT NULL,
      "productId" TEXT,
      "farmProductOfferId" TEXT,
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
      CONSTRAINT "Lot_productId_farmId_fkey" FOREIGN KEY ("productId", "farmId") REFERENCES "Product" ("id", "farmId") ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT "Lot_farmProductOfferId_farmId_fkey" FOREIGN KEY ("farmProductOfferId", "farmId") REFERENCES "FarmProductOffer" ("id", "farmId") ON DELETE RESTRICT ON UPDATE CASCADE,
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
  await prisma.$executeRawUnsafe(
    `CREATE INDEX "Lot_farmProductOfferId_idx" ON "Lot"("farmProductOfferId");`,
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
