-- CreateTable
CREATE TABLE "ProductDefinition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "canonicalName" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "defaultPrep" TEXT NOT NULL DEFAULT '',
    "translationKey" TEXT NOT NULL,
    "lifecycle" TEXT NOT NULL DEFAULT 'draft',
    "isApproved" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "isTest" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "FarmProductOffer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "farmId" TEXT NOT NULL,
    "productDefinitionId" TEXT NOT NULL,
    "publicName" TEXT NOT NULL,
    "internalSku" TEXT,
    "description" TEXT NOT NULL DEFAULT '',
    "priceAmountCents" INTEGER NOT NULL,
    "priceUnit" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "expectedUnitWeightMinG" INTEGER,
    "expectedUnitWeightMaxG" INTEGER,
    "weightTolerancePercent" INTEGER,
    "unitsPerPack" INTEGER,
    "thicknessMm" INTEGER,
    "maturationDays" INTEGER,
    "packagingMethod" TEXT,
    "storageState" TEXT,
    "minimumShelfLifeDays" INTEGER,
    "pickupAvailable" BOOLEAN NOT NULL DEFAULT false,
    "legacyFacts" TEXT,
    "lifecycle" TEXT NOT NULL DEFAULT 'draft',
    "isApproved" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" DATETIME,
    "isTest" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FarmProductOffer_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "FarmProductOffer_productDefinitionId_fkey" FOREIGN KEY ("productDefinitionId") REFERENCES "ProductDefinition" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Lot" (
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
    -- Preserve the init-migration invariants that Prisma does not track in the
    -- schema file (units >= 0 and the slaughter<=cutting<=packing<expiry order).
    CONSTRAINT "Lot_units_nonneg" CHECK ("units" >= 0),
    CONSTRAINT "Lot_date_order" CHECK (
        "slaughterDate" <= "cuttingDate"
        AND "cuttingDate" <= "packingDate"
        AND "packingDate" < "expiryDate"
    )
);
INSERT INTO "new_Lot" ("createdAt", "cuttingDate", "expiryDate", "farmId", "id", "isTest", "isWithdrawn", "packingDate", "productId", "reference", "slaughterDate", "units", "updatedAt") SELECT "createdAt", "cuttingDate", "expiryDate", "farmId", "id", "isTest", "isWithdrawn", "packingDate", "productId", "reference", "slaughterDate", "units", "updatedAt" FROM "Lot";
DROP TABLE "Lot";
ALTER TABLE "new_Lot" RENAME TO "Lot";
CREATE UNIQUE INDEX "Lot_reference_key" ON "Lot"("reference");
CREATE INDEX "Lot_farmId_idx" ON "Lot"("farmId");
CREATE INDEX "Lot_productId_idx" ON "Lot"("productId");
CREATE INDEX "Lot_farmProductOfferId_idx" ON "Lot"("farmProductOfferId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "ProductDefinition_translationKey_key" ON "ProductDefinition"("translationKey");

-- CreateIndex
CREATE INDEX "ProductDefinition_canonicalName_idx" ON "ProductDefinition"("canonicalName");

-- CreateIndex
CREATE INDEX "FarmProductOffer_farmId_idx" ON "FarmProductOffer"("farmId");

-- CreateIndex
CREATE INDEX "FarmProductOffer_productDefinitionId_idx" ON "FarmProductOffer"("productDefinitionId");

-- CreateIndex
CREATE UNIQUE INDEX "FarmProductOffer_id_farmId_key" ON "FarmProductOffer"("id", "farmId");
