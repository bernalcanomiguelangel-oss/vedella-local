-- AlterTable
ALTER TABLE "Farm" ADD COLUMN "contactEmail" TEXT;
ALTER TABLE "Farm" ADD COLUMN "contactPhone" TEXT;
ALTER TABLE "Farm" ADD COLUMN "feedInfo" TEXT;
ALTER TABLE "Farm" ADD COLUMN "galleryRefs" TEXT;
ALTER TABLE "Farm" ADD COLUMN "heroImageRef" TEXT;
ALTER TABLE "Farm" ADD COLUMN "latitude" REAL;
ALTER TABLE "Farm" ADD COLUMN "locationDetail" TEXT;
ALTER TABLE "Farm" ADD COLUMN "longitude" REAL;
ALTER TABLE "Farm" ADD COLUMN "otherInformation" TEXT;
ALTER TABLE "Farm" ADD COLUMN "productionMethod" TEXT;
ALTER TABLE "Farm" ADD COLUMN "traceabilityInfo" TEXT;
ALTER TABLE "Farm" ADD COLUMN "websiteUrl" TEXT;
ALTER TABLE "Farm" ADD COLUMN "welfareInfo" TEXT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "attributionCampaign" TEXT;
ALTER TABLE "Order" ADD COLUMN "attributionChannel" TEXT;
ALTER TABLE "Order" ADD COLUMN "deliveryMethod" TEXT;
ALTER TABLE "Order" ADD COLUMN "isPickup" BOOLEAN DEFAULT false;
ALTER TABLE "Order" ADD COLUMN "pickupLocation" TEXT;
ALTER TABLE "Order" ADD COLUMN "promisedDeliveryDate" DATETIME;

-- AlterTable
ALTER TABLE "ReservationCycle" ADD COLUMN "closeAt" DATETIME;
ALTER TABLE "ReservationCycle" ADD COLUMN "deliveryPriceCents" INTEGER;
ALTER TABLE "ReservationCycle" ADD COLUMN "internalName" TEXT;
ALTER TABLE "ReservationCycle" ADD COLUMN "openAt" DATETIME;
ALTER TABLE "ReservationCycle" ADD COLUMN "pickupDate" DATETIME;
ALTER TABLE "ReservationCycle" ADD COLUMN "publicTitle" TEXT;
ALTER TABLE "ReservationCycle" ADD COLUMN "status" TEXT DEFAULT 'open';

-- CreateTable
CREATE TABLE "FarmCertification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "farmId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "evidenceRef" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "submittedByUserId" TEXT,
    "approvedByUserId" TEXT,
    "approvedAt" DATETIME,
    "rejectionReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FarmCertification_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FarmProfileEdit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "farmId" TEXT NOT NULL,
    "changes" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending_review',
    "submittedByUserId" TEXT,
    "approvedByUserId" TEXT,
    "approvedAt" DATETIME,
    "rejectionReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FarmProfileEdit_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Pack" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "farmId" TEXT,
    "isMultiFarm" BOOLEAN NOT NULL DEFAULT false,
    "publicName" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "priceAmountCents" INTEGER NOT NULL DEFAULT 0,
    "lifecycle" TEXT NOT NULL DEFAULT 'draft',
    "isApproved" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "isTest" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Pack_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PackItemV2" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "packId" TEXT NOT NULL,
    "farmProductOfferId" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "lotId" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "PackItemV2_packId_fkey" FOREIGN KEY ("packId") REFERENCES "Pack" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PackItemV2_farmProductOfferId_fkey" FOREIGN KEY ("farmProductOfferId") REFERENCES "FarmProductOffer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PackItemV2_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PackItemV2_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PackFarmAcceptance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "packId" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "accepted" BOOLEAN NOT NULL DEFAULT false,
    "acceptedByUserId" TEXT,
    "acceptedAt" DATETIME,
    "declinedReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PackFarmAcceptance_packId_fkey" FOREIGN KEY ("packId") REFERENCES "Pack" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PackFarmAcceptance_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CycleFarm" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cycleId" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "allocatedPlaces" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CycleFarm_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "ReservationCycle" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CycleFarm_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CycleOfferAvailability" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cycleId" TEXT NOT NULL,
    "farmProductOfferId" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "lotId" TEXT,
    "hasEligibleLot" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CycleOfferAvailability_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "ReservationCycle" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CycleOfferAvailability_farmProductOfferId_fkey" FOREIGN KEY ("farmProductOfferId") REFERENCES "FarmProductOffer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CycleOfferAvailability_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CycleOfferAvailability_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FulfilmentGroup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "subtotalCents" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FulfilmentGroup_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FulfilmentGroup_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_OrderItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "productId" TEXT,
    "nameSnapshot" TEXT NOT NULL,
    "priceCentsSnapshot" INTEGER NOT NULL,
    "lotReferenceSnapshot" TEXT NOT NULL DEFAULT '',
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "farmProductOfferId" TEXT,
    "farmId" TEXT,
    "productDefinitionId" TEXT,
    "actualWeightG" INTEGER,
    "farmNameSnapshot" TEXT,
    "definitionNameSnapshot" TEXT,
    CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "OrderItem_farmProductOfferId_fkey" FOREIGN KEY ("farmProductOfferId") REFERENCES "FarmProductOffer" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_OrderItem" ("id", "lotReferenceSnapshot", "nameSnapshot", "orderId", "priceCentsSnapshot", "productId", "quantity") SELECT "id", "lotReferenceSnapshot", "nameSnapshot", "orderId", "priceCentsSnapshot", "productId", "quantity" FROM "OrderItem";
DROP TABLE "OrderItem";
ALTER TABLE "new_OrderItem" RENAME TO "OrderItem";
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");
CREATE INDEX "OrderItem_farmProductOfferId_idx" ON "OrderItem"("farmProductOfferId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "FarmCertification_farmId_idx" ON "FarmCertification"("farmId");

-- CreateIndex
CREATE INDEX "FarmCertification_status_idx" ON "FarmCertification"("status");

-- CreateIndex
CREATE INDEX "FarmProfileEdit_farmId_idx" ON "FarmProfileEdit"("farmId");

-- CreateIndex
CREATE INDEX "FarmProfileEdit_status_idx" ON "FarmProfileEdit"("status");

-- CreateIndex
CREATE INDEX "Pack_farmId_idx" ON "Pack"("farmId");

-- CreateIndex
CREATE INDEX "PackItemV2_packId_idx" ON "PackItemV2"("packId");

-- CreateIndex
CREATE INDEX "PackItemV2_farmProductOfferId_idx" ON "PackItemV2"("farmProductOfferId");

-- CreateIndex
CREATE INDEX "PackItemV2_farmId_idx" ON "PackItemV2"("farmId");

-- CreateIndex
CREATE INDEX "PackFarmAcceptance_packId_idx" ON "PackFarmAcceptance"("packId");

-- CreateIndex
CREATE INDEX "PackFarmAcceptance_farmId_idx" ON "PackFarmAcceptance"("farmId");

-- CreateIndex
CREATE UNIQUE INDEX "PackFarmAcceptance_packId_farmId_key" ON "PackFarmAcceptance"("packId", "farmId");

-- CreateIndex
CREATE INDEX "CycleFarm_cycleId_idx" ON "CycleFarm"("cycleId");

-- CreateIndex
CREATE INDEX "CycleFarm_farmId_idx" ON "CycleFarm"("farmId");

-- CreateIndex
CREATE UNIQUE INDEX "CycleFarm_cycleId_farmId_key" ON "CycleFarm"("cycleId", "farmId");

-- CreateIndex
CREATE INDEX "CycleOfferAvailability_cycleId_idx" ON "CycleOfferAvailability"("cycleId");

-- CreateIndex
CREATE INDEX "CycleOfferAvailability_farmId_idx" ON "CycleOfferAvailability"("farmId");

-- CreateIndex
CREATE UNIQUE INDEX "CycleOfferAvailability_cycleId_farmProductOfferId_key" ON "CycleOfferAvailability"("cycleId", "farmProductOfferId");

-- CreateIndex
CREATE INDEX "FulfilmentGroup_orderId_idx" ON "FulfilmentGroup"("orderId");

-- CreateIndex
CREATE INDEX "FulfilmentGroup_farmId_idx" ON "FulfilmentGroup"("farmId");

-- CreateIndex
CREATE UNIQUE INDEX "FulfilmentGroup_orderId_farmId_key" ON "FulfilmentGroup"("orderId", "farmId");
