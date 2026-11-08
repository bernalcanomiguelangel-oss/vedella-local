-- R9 DB-level enforcement: a Lot's farmId must equal its Product's farmId.
--
-- SQLite CHECK constraints cannot reference another table, so we enforce the
-- rule with a composite foreign key: Product gains a (id, farmId) candidate key
-- and Lot's product relation targets that pair. A lot whose (productId, farmId)
-- does not match an existing Product row is rejected by the database.
--
-- SQLite cannot ALTER TABLE to add a UNIQUE constraint or rebuild a foreign key
-- in place, so both tables are rebuilt. They are rebuilt preserving existing
-- rows (copied across), with foreign keys disabled during the swap.

PRAGMA foreign_keys=OFF;

-- 1. Add the (id, farmId) composite unique index on Product (candidate key the
--    composite FK can target). id is already the primary key, so this pair is
--    trivially unique; the index merely lets SQLite use it as an FK target.
CREATE UNIQUE INDEX "Product_id_farmId_key" ON "Product"("id", "farmId");

-- 2. Rebuild Lot so its product FK targets Product(id, farmId).
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
    -- Composite FK enforces R9 at the DB level.
    CONSTRAINT "Lot_productId_farmId_fkey" FOREIGN KEY ("productId", "farmId") REFERENCES "Product" ("id", "farmId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Lot_units_nonneg" CHECK ("units" >= 0),
    CONSTRAINT "Lot_date_order" CHECK (
        "slaughterDate" <= "cuttingDate"
        AND "cuttingDate" <= "packingDate"
        AND "packingDate" < "expiryDate"
    )
);

INSERT INTO "Lot_new" (
    "id", "farmId", "productId", "reference", "units", "isWithdrawn", "isTest",
    "slaughterDate", "cuttingDate", "packingDate", "expiryDate", "createdAt", "updatedAt"
)
SELECT
    "id", "farmId", "productId", "reference", "units", "isWithdrawn", "isTest",
    "slaughterDate", "cuttingDate", "packingDate", "expiryDate", "createdAt", "updatedAt"
FROM "Lot";

DROP TABLE "Lot";
ALTER TABLE "Lot_new" RENAME TO "Lot";

CREATE UNIQUE INDEX "Lot_reference_key" ON "Lot"("reference");
CREATE INDEX "Lot_farmId_idx" ON "Lot"("farmId");
CREATE INDEX "Lot_productId_idx" ON "Lot"("productId");

PRAGMA foreign_keys=ON;
