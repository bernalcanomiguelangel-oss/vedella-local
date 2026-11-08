-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "role" TEXT NOT NULL DEFAULT 'customer',
    "farmId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "User_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Farm" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "town" TEXT NOT NULL,
    "comarca" TEXT NOT NULL,
    "breed" TEXT NOT NULL,
    "foundedYear" INTEGER NOT NULL,
    "animalCount" INTEGER NOT NULL,
    "story" TEXT NOT NULL,
    "lifecycle" TEXT NOT NULL DEFAULT 'draft',
    "isApproved" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "isTest" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "farmId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "basePriceCents" INTEGER NOT NULL,
    "weight" TEXT,
    "thickness" TEXT,
    "maturation" TEXT,
    "packaging" TEXT,
    "shelfLife" TEXT,
    "lifecycle" TEXT NOT NULL DEFAULT 'draft',
    "isApproved" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "isTest" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Product_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    -- Integrity: prices are non-negative integer cents.
    CONSTRAINT "Product_basePriceCents_nonneg" CHECK ("basePriceCents" >= 0)
);

-- CreateTable
CREATE TABLE "PackItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "packProductId" TEXT NOT NULL,
    "cutProductId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "PackItem_packProductId_fkey" FOREIGN KEY ("packProductId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PackItem_cutProductId_fkey" FOREIGN KEY ("cutProductId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Lot" (
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
    -- Integrity R12: units are non-negative.
    CONSTRAINT "Lot_units_nonneg" CHECK ("units" >= 0),
    -- Integrity R10: slaughter <= cutting <= packing < expiry.
    CONSTRAINT "Lot_date_order" CHECK (
        "slaughterDate" <= "cuttingDate"
        AND "cuttingDate" <= "packingDate"
        AND "packingDate" < "expiryDate"
    )
);

-- CreateTable
CREATE TABLE "ReservationCycle" (
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
    -- Integrity R18: places never go negative and free <= total (no oversell).
    CONSTRAINT "ReservationCycle_places_valid" CHECK (
        "freePlaces" >= 0
        AND "totalPlaces" >= 0
        AND "freePlaces" <= "totalPlaces"
    )
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cycleId" TEXT NOT NULL,
    "customerId" TEXT,
    "lotReferenceSnapshot" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'reserved',
    "subtotalCents" INTEGER NOT NULL DEFAULT 0,
    "discountCents" INTEGER NOT NULL DEFAULT 0,
    "deliveryFeeCents" INTEGER NOT NULL DEFAULT 600,
    "totalCents" INTEGER NOT NULL DEFAULT 0,
    "isTest" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Order_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "ReservationCycle" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "productId" TEXT,
    "nameSnapshot" TEXT NOT NULL,
    "priceCentsSnapshot" INTEGER NOT NULL,
    "lotReferenceSnapshot" TEXT NOT NULL DEFAULT '',
    "quantity" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    -- Integrity: order item quantity is positive.
    CONSTRAINT "OrderItem_quantity_positive" CHECK ("quantity" >= 1)
);

-- CreateTable
CREATE TABLE "Translation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'machine',
    "source" TEXT NOT NULL DEFAULT 'machine',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AiRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "useCase" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "flagEnabled" BOOLEAN NOT NULL,
    "inputRef" TEXT NOT NULL DEFAULT '',
    "outputValid" BOOLEAN NOT NULL DEFAULT false,
    "outcome" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "MarketPriceSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cutName" TEXT NOT NULL,
    "weekStart" DATETIME NOT NULL,
    "avgPriceCents" INTEGER NOT NULL,
    "sampleCount" INTEGER NOT NULL,
    "generatedBy" TEXT NOT NULL DEFAULT 'mock',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_farmId_key" ON "User"("farmId");

-- CreateIndex
CREATE UNIQUE INDEX "Farm_slug_key" ON "Farm"("slug");

-- CreateIndex
CREATE INDEX "Product_farmId_idx" ON "Product"("farmId");

-- CreateIndex
CREATE INDEX "PackItem_packProductId_idx" ON "PackItem"("packProductId");

-- CreateIndex
CREATE UNIQUE INDEX "PackItem_packProductId_cutProductId_key" ON "PackItem"("packProductId", "cutProductId");

-- CreateIndex
CREATE UNIQUE INDEX "Lot_reference_key" ON "Lot"("reference");

-- CreateIndex
CREATE INDEX "Lot_farmId_idx" ON "Lot"("farmId");

-- CreateIndex
CREATE INDEX "Lot_productId_idx" ON "Lot"("productId");

-- CreateIndex
CREATE INDEX "Order_cycleId_idx" ON "Order"("cycleId");

-- CreateIndex
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");

-- CreateIndex
CREATE INDEX "Translation_entityType_entityId_idx" ON "Translation"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "Translation_entityType_entityId_field_locale_key" ON "Translation"("entityType", "entityId", "field", "locale");

-- CreateIndex
CREATE INDEX "AiRun_useCase_idx" ON "AiRun"("useCase");

-- CreateIndex
CREATE UNIQUE INDEX "MarketPriceSnapshot_cutName_weekStart_key" ON "MarketPriceSnapshot"("cutName", "weekStart");
