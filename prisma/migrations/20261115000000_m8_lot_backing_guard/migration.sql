-- Phase M8 (migration-plan §8): make the verified Lot backing columns safe to
-- rely on, now that every M2-M6 gate passes.
--
-- FarmProductOffer.productDefinitionId is ALREADY NOT NULL (the FEAT-003
-- migration 20261109010000_add_product_definition_and_offer created it as a
-- required column), so M8 requires no change there — the verified non-null
-- guarantee already holds.
--
-- For Lot.farmProductOfferId the plan asked to flip the column to non-null "for
-- cut-backed lots". A blanket NOT NULL is WRONG here: receipt ingestion
-- (src/lib/admin/core.ts) legitimately pre-fills a legacy Product + Lot for
-- human review with farmProductOfferId still null, and pack-backed/other lots
-- may legitimately carry a null offer. A blanket NOT NULL would reject those
-- legitimate rows. Instead we enforce the guarded invariant that EVERY lot must
-- be backed by at least one of a legacy Product (productId) or a new offer
-- (farmProductOfferId) — never both null. Verified against live data: zero rows
-- have both columns null. The composite FKs already guarantee lot.farmId equals
-- the backing product's and offer's farmId (R9); this adds the "must be backed"
-- half so a lot can never dangle once the legacy column is eventually dropped.
--
-- SQLite cannot ALTER TABLE ADD CONSTRAINT, so Lot is rebuilt following the
-- established pattern (PRAGMA foreign_keys=OFF -> create _new -> copy -> drop ->
-- rename -> recreate indexes -> PRAGMA foreign_keys=ON). The existing composite
-- FKs and the units>=0 / date-order CHECKs are re-declared by hand because the
-- rebuild drops them. The legacy Product table and Lot.productId are KEPT
-- readable (destructive cleanup is deferred, migration-plan §9/§11).

PRAGMA foreign_keys=OFF;

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
    -- LEGACY composite FK (nullable this release): lot.farmId == product.farmId.
    CONSTRAINT "Lot_productId_farmId_fkey" FOREIGN KEY ("productId", "farmId") REFERENCES "Product" ("id", "farmId") ON DELETE RESTRICT ON UPDATE CASCADE,
    -- NEW composite FK (R9 under the two-level model): lot.farmId == offer.farmId.
    CONSTRAINT "Lot_farmProductOfferId_farmId_fkey" FOREIGN KEY ("farmProductOfferId", "farmId") REFERENCES "FarmProductOffer" ("id", "farmId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Lot_units_nonneg" CHECK ("units" >= 0),
    CONSTRAINT "Lot_date_order" CHECK (
        "slaughterDate" <= "cuttingDate"
        AND "cuttingDate" <= "packingDate"
        AND "packingDate" < "expiryDate"
    ),
    -- M8 guarded backing invariant: a lot must reference a legacy product OR a
    -- new offer (or both). Never both null.
    CONSTRAINT "Lot_backed_by_product_or_offer" CHECK (
        "productId" IS NOT NULL OR "farmProductOfferId" IS NOT NULL
    )
);

INSERT INTO "Lot_new" (
    "id", "farmId", "productId", "farmProductOfferId", "reference", "units",
    "isWithdrawn", "isTest", "slaughterDate", "cuttingDate", "packingDate",
    "expiryDate", "createdAt", "updatedAt"
)
SELECT
    "id", "farmId", "productId", "farmProductOfferId", "reference", "units",
    "isWithdrawn", "isTest", "slaughterDate", "cuttingDate", "packingDate",
    "expiryDate", "createdAt", "updatedAt"
FROM "Lot";

DROP TABLE "Lot";
ALTER TABLE "Lot_new" RENAME TO "Lot";

CREATE UNIQUE INDEX "Lot_reference_key" ON "Lot"("reference");
CREATE INDEX "Lot_farmId_idx" ON "Lot"("farmId");
CREATE INDEX "Lot_productId_idx" ON "Lot"("productId");
CREATE INDEX "Lot_farmProductOfferId_idx" ON "Lot"("farmProductOfferId");

PRAGMA foreign_keys=ON;
