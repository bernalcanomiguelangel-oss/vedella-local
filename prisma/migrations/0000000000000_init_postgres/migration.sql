-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "role" TEXT NOT NULL DEFAULT 'customer',
    "passwordHash" TEXT,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "lastLoginAt" TIMESTAMP(3),
    "farmId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Farm" (
    "id" TEXT NOT NULL,
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
    "productionMethod" TEXT,
    "traceabilityInfo" TEXT,
    "welfareInfo" TEXT,
    "feedInfo" TEXT,
    "locationDetail" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "heroImageRef" TEXT,
    "galleryRefs" TEXT,
    "pendingHeroImageRef" TEXT,
    "pendingGalleryRefs" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "websiteUrl" TEXT,
    "otherInformation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Farm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FarmCertification" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "evidenceRef" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "submittedByUserId" TEXT,
    "approvedByUserId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FarmCertification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FarmProfileEdit" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "changes" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending_review',
    "submittedByUserId" TEXT,
    "approvedByUserId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FarmProfileEdit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductDefinition" (
    "id" TEXT NOT NULL,
    "canonicalName" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "defaultPrep" TEXT NOT NULL DEFAULT '',
    "translationKey" TEXT NOT NULL,
    "lifecycle" TEXT NOT NULL DEFAULT 'draft',
    "isApproved" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "isTest" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FarmProductOffer" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "productDefinitionId" TEXT NOT NULL,
    "publicName" TEXT NOT NULL,
    "internalSku" TEXT,
    "description" TEXT NOT NULL DEFAULT '',
    "priceAmountCents" INTEGER NOT NULL,
    "priceUnit" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "imageRef" TEXT,
    "pendingImageRef" TEXT,
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
    "archivedAt" TIMESTAMP(3),
    "isTest" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FarmProductOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackItem" (
    "id" TEXT NOT NULL,
    "packProductId" TEXT NOT NULL,
    "cutProductId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "PackItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pack" (
    "id" TEXT NOT NULL,
    "farmId" TEXT,
    "isMultiFarm" BOOLEAN NOT NULL DEFAULT false,
    "publicName" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "priceAmountCents" INTEGER NOT NULL DEFAULT 0,
    "lifecycle" TEXT NOT NULL DEFAULT 'draft',
    "isApproved" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "isTest" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackItemV2" (
    "id" TEXT NOT NULL,
    "packId" TEXT NOT NULL,
    "farmProductOfferId" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "lotId" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "PackItemV2_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackFarmAcceptance" (
    "id" TEXT NOT NULL,
    "packId" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "accepted" BOOLEAN NOT NULL DEFAULT false,
    "acceptedByUserId" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "declinedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PackFarmAcceptance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lot" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "productId" TEXT,
    "farmProductOfferId" TEXT,
    "reference" TEXT NOT NULL,
    "units" INTEGER NOT NULL DEFAULT 0,
    "isWithdrawn" BOOLEAN NOT NULL DEFAULT false,
    "isTest" BOOLEAN NOT NULL DEFAULT false,
    "slaughterDate" TIMESTAMP(3) NOT NULL,
    "cuttingDate" TIMESTAMP(3) NOT NULL,
    "packingDate" TIMESTAMP(3) NOT NULL,
    "expiryDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReservationCycle" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "zone" TEXT NOT NULL,
    "closeDate" TIMESTAMP(3) NOT NULL,
    "deliveryDate" TIMESTAMP(3) NOT NULL,
    "totalPlaces" INTEGER NOT NULL,
    "freePlaces" INTEGER NOT NULL,
    "transportNote" TEXT NOT NULL DEFAULT '',
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "isTest" BOOLEAN NOT NULL DEFAULT false,
    "internalName" TEXT,
    "publicTitle" TEXT,
    "status" TEXT DEFAULT 'open',
    "openAt" TIMESTAMP(3),
    "closeAt" TIMESTAMP(3),
    "pickupDate" TIMESTAMP(3),
    "deliveryPriceCents" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReservationCycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CycleFarm" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "allocatedPlaces" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CycleFarm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CycleOfferAvailability" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "farmProductOfferId" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "lotId" TEXT,
    "hasEligibleLot" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CycleOfferAvailability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "customerId" TEXT,
    "lotReferenceSnapshot" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'reserved',
    "subtotalCents" INTEGER NOT NULL DEFAULT 0,
    "discountCents" INTEGER NOT NULL DEFAULT 0,
    "deliveryFeeCents" INTEGER NOT NULL DEFAULT 600,
    "totalCents" INTEGER NOT NULL DEFAULT 0,
    "isTest" BOOLEAN NOT NULL DEFAULT false,
    "attributionChannel" TEXT,
    "attributionCampaign" TEXT,
    "promisedDeliveryDate" TIMESTAMP(3),
    "deliveryMethod" TEXT,
    "isPickup" BOOLEAN DEFAULT false,
    "pickupLocation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FulfilmentGroup" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "subtotalCents" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FulfilmentGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
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

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Translation" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'machine',
    "source" TEXT NOT NULL DEFAULT 'machine',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Translation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiRun" (
    "id" TEXT NOT NULL,
    "useCase" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "flagEnabled" BOOLEAN NOT NULL,
    "inputRef" TEXT NOT NULL DEFAULT '',
    "outputValid" BOOLEAN NOT NULL DEFAULT false,
    "outcome" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiAssistantDecision" (
    "id" TEXT NOT NULL,
    "assistant" TEXT NOT NULL,
    "inputRef" TEXT NOT NULL DEFAULT '',
    "suggestionJson" TEXT NOT NULL DEFAULT '',
    "aiRunId" TEXT,
    "decision" TEXT NOT NULL DEFAULT 'pending',
    "decisionReason" TEXT NOT NULL DEFAULT '',
    "decidedByUserId" TEXT,
    "decidedByEmail" TEXT NOT NULL DEFAULT '',
    "decidedAt" TIMESTAMP(3),
    "farmId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiAssistantDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminAudit" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorEmail" TEXT NOT NULL DEFAULT '',
    "actorRole" TEXT NOT NULL DEFAULT '',
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "fromState" TEXT NOT NULL DEFAULT '',
    "toState" TEXT NOT NULL DEFAULT '',
    "detail" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "anonSessionId" TEXT NOT NULL,
    "customerId" TEXT,
    "farmId" TEXT,
    "definitionId" TEXT,
    "offerId" TEXT,
    "packId" TEXT,
    "cycleId" TEXT,
    "language" TEXT,
    "deliveryMethod" TEXT,
    "channel" TEXT,
    "campaign" TEXT,
    "isTest" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalyticsEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChannelAttribution" (
    "id" TEXT NOT NULL,
    "anonSessionId" TEXT NOT NULL,
    "firstTouchChannel" TEXT NOT NULL DEFAULT 'unknown',
    "latestTouchChannel" TEXT NOT NULL DEFAULT 'unknown',
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "farmReferralCode" TEXT,
    "orderId" TEXT,
    "isTest" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChannelAttribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterestedContact" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "locale" TEXT,
    "anonSessionId" TEXT,
    "farmId" TEXT,
    "isTest" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InterestedContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Incident" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'low',
    "description" TEXT NOT NULL DEFAULT '',
    "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ownerUserId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "correctiveAction" TEXT,
    "resolution" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "farmId" TEXT,
    "productDefinitionId" TEXT,
    "farmProductOfferId" TEXT,
    "lotId" TEXT,
    "packId" TEXT,
    "cycleId" TEXT,
    "orderId" TEXT,
    "isTest" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Incident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebsiteText" (
    "id" TEXT NOT NULL,
    "pageKey" TEXT NOT NULL,
    "sectionKey" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "draftText" TEXT NOT NULL DEFAULT '',
    "publishedText" TEXT,
    "charLimit" INTEGER,
    "lastEditorUserId" TEXT,
    "lastPublishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebsiteText_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "valueType" TEXT NOT NULL DEFAULT 'string',
    "stringValue" TEXT,
    "numberValue" INTEGER,
    "booleanValue" BOOLEAN,
    "jsonValue" TEXT,
    "category" TEXT NOT NULL DEFAULT 'general',
    "label" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketPriceSnapshot" (
    "id" TEXT NOT NULL,
    "cutName" TEXT NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "avgPriceCents" INTEGER NOT NULL,
    "sampleCount" INTEGER NOT NULL,
    "generatedBy" TEXT NOT NULL DEFAULT 'mock',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketPriceSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_farmId_key" ON "User"("farmId");

-- CreateIndex
CREATE UNIQUE INDEX "Farm_slug_key" ON "Farm"("slug");

-- CreateIndex
CREATE INDEX "FarmCertification_farmId_idx" ON "FarmCertification"("farmId");

-- CreateIndex
CREATE INDEX "FarmCertification_status_idx" ON "FarmCertification"("status");

-- CreateIndex
CREATE INDEX "FarmProfileEdit_farmId_idx" ON "FarmProfileEdit"("farmId");

-- CreateIndex
CREATE INDEX "FarmProfileEdit_status_idx" ON "FarmProfileEdit"("status");

-- CreateIndex
CREATE INDEX "Product_farmId_idx" ON "Product"("farmId");

-- CreateIndex
CREATE UNIQUE INDEX "Product_id_farmId_key" ON "Product"("id", "farmId");

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

-- CreateIndex
CREATE INDEX "PackItem_packProductId_idx" ON "PackItem"("packProductId");

-- CreateIndex
CREATE UNIQUE INDEX "PackItem_packProductId_cutProductId_key" ON "PackItem"("packProductId", "cutProductId");

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
CREATE UNIQUE INDEX "Lot_reference_key" ON "Lot"("reference");

-- CreateIndex
CREATE INDEX "Lot_farmId_idx" ON "Lot"("farmId");

-- CreateIndex
CREATE INDEX "Lot_productId_idx" ON "Lot"("productId");

-- CreateIndex
CREATE INDEX "Lot_farmProductOfferId_idx" ON "Lot"("farmProductOfferId");

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
CREATE INDEX "Order_cycleId_idx" ON "Order"("cycleId");

-- CreateIndex
CREATE INDEX "FulfilmentGroup_orderId_idx" ON "FulfilmentGroup"("orderId");

-- CreateIndex
CREATE INDEX "FulfilmentGroup_farmId_idx" ON "FulfilmentGroup"("farmId");

-- CreateIndex
CREATE UNIQUE INDEX "FulfilmentGroup_orderId_farmId_key" ON "FulfilmentGroup"("orderId", "farmId");

-- CreateIndex
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");

-- CreateIndex
CREATE INDEX "OrderItem_farmProductOfferId_idx" ON "OrderItem"("farmProductOfferId");

-- CreateIndex
CREATE INDEX "Translation_entityType_entityId_idx" ON "Translation"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "Translation_entityType_entityId_field_locale_key" ON "Translation"("entityType", "entityId", "field", "locale");

-- CreateIndex
CREATE INDEX "AiRun_useCase_idx" ON "AiRun"("useCase");

-- CreateIndex
CREATE INDEX "AiAssistantDecision_assistant_idx" ON "AiAssistantDecision"("assistant");

-- CreateIndex
CREATE INDEX "AiAssistantDecision_farmId_idx" ON "AiAssistantDecision"("farmId");

-- CreateIndex
CREATE INDEX "AiAssistantDecision_decision_idx" ON "AiAssistantDecision"("decision");

-- CreateIndex
CREATE INDEX "AdminAudit_entityType_entityId_idx" ON "AdminAudit"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AdminAudit_actorId_idx" ON "AdminAudit"("actorId");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_type_idx" ON "AnalyticsEvent"("type");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_anonSessionId_idx" ON "AnalyticsEvent"("anonSessionId");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_farmId_idx" ON "AnalyticsEvent"("farmId");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_createdAt_idx" ON "AnalyticsEvent"("createdAt");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_offerId_idx" ON "AnalyticsEvent"("offerId");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_definitionId_idx" ON "AnalyticsEvent"("definitionId");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_packId_idx" ON "AnalyticsEvent"("packId");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_cycleId_idx" ON "AnalyticsEvent"("cycleId");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelAttribution_anonSessionId_key" ON "ChannelAttribution"("anonSessionId");

-- CreateIndex
CREATE INDEX "ChannelAttribution_anonSessionId_idx" ON "ChannelAttribution"("anonSessionId");

-- CreateIndex
CREATE INDEX "InterestedContact_farmId_idx" ON "InterestedContact"("farmId");

-- CreateIndex
CREATE INDEX "InterestedContact_createdAt_idx" ON "InterestedContact"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Incident_reference_key" ON "Incident"("reference");

-- CreateIndex
CREATE INDEX "Incident_farmId_idx" ON "Incident"("farmId");

-- CreateIndex
CREATE INDEX "Incident_status_idx" ON "Incident"("status");

-- CreateIndex
CREATE INDEX "Incident_lotId_idx" ON "Incident"("lotId");

-- CreateIndex
CREATE INDEX "Incident_productDefinitionId_idx" ON "Incident"("productDefinitionId");

-- CreateIndex
CREATE INDEX "Incident_farmProductOfferId_idx" ON "Incident"("farmProductOfferId");

-- CreateIndex
CREATE INDEX "Incident_packId_idx" ON "Incident"("packId");

-- CreateIndex
CREATE INDEX "Incident_cycleId_idx" ON "Incident"("cycleId");

-- CreateIndex
CREATE INDEX "Incident_orderId_idx" ON "Incident"("orderId");

-- CreateIndex
CREATE INDEX "WebsiteText_pageKey_idx" ON "WebsiteText"("pageKey");

-- CreateIndex
CREATE UNIQUE INDEX "WebsiteText_pageKey_sectionKey_locale_key" ON "WebsiteText"("pageKey", "sectionKey", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "Setting_key_key" ON "Setting"("key");

-- CreateIndex
CREATE INDEX "Setting_category_idx" ON "Setting"("category");

-- CreateIndex
CREATE UNIQUE INDEX "MarketPriceSnapshot_cutName_weekStart_key" ON "MarketPriceSnapshot"("cutName", "weekStart");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FarmCertification" ADD CONSTRAINT "FarmCertification_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FarmProfileEdit" ADD CONSTRAINT "FarmProfileEdit_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FarmProductOffer" ADD CONSTRAINT "FarmProductOffer_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FarmProductOffer" ADD CONSTRAINT "FarmProductOffer_productDefinitionId_fkey" FOREIGN KEY ("productDefinitionId") REFERENCES "ProductDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackItem" ADD CONSTRAINT "PackItem_packProductId_fkey" FOREIGN KEY ("packProductId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackItem" ADD CONSTRAINT "PackItem_cutProductId_fkey" FOREIGN KEY ("cutProductId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pack" ADD CONSTRAINT "Pack_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackItemV2" ADD CONSTRAINT "PackItemV2_packId_fkey" FOREIGN KEY ("packId") REFERENCES "Pack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackItemV2" ADD CONSTRAINT "PackItemV2_farmProductOfferId_fkey" FOREIGN KEY ("farmProductOfferId") REFERENCES "FarmProductOffer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackItemV2" ADD CONSTRAINT "PackItemV2_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackItemV2" ADD CONSTRAINT "PackItemV2_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackFarmAcceptance" ADD CONSTRAINT "PackFarmAcceptance_packId_fkey" FOREIGN KEY ("packId") REFERENCES "Pack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackFarmAcceptance" ADD CONSTRAINT "PackFarmAcceptance_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lot" ADD CONSTRAINT "Lot_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lot" ADD CONSTRAINT "Lot_productId_farmId_fkey" FOREIGN KEY ("productId", "farmId") REFERENCES "Product"("id", "farmId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lot" ADD CONSTRAINT "Lot_farmProductOfferId_farmId_fkey" FOREIGN KEY ("farmProductOfferId", "farmId") REFERENCES "FarmProductOffer"("id", "farmId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CycleFarm" ADD CONSTRAINT "CycleFarm_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "ReservationCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CycleFarm" ADD CONSTRAINT "CycleFarm_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CycleOfferAvailability" ADD CONSTRAINT "CycleOfferAvailability_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "ReservationCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CycleOfferAvailability" ADD CONSTRAINT "CycleOfferAvailability_farmProductOfferId_fkey" FOREIGN KEY ("farmProductOfferId") REFERENCES "FarmProductOffer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CycleOfferAvailability" ADD CONSTRAINT "CycleOfferAvailability_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CycleOfferAvailability" ADD CONSTRAINT "CycleOfferAvailability_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "ReservationCycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FulfilmentGroup" ADD CONSTRAINT "FulfilmentGroup_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FulfilmentGroup" ADD CONSTRAINT "FulfilmentGroup_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_farmProductOfferId_fkey" FOREIGN KEY ("farmProductOfferId") REFERENCES "FarmProductOffer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Integrity CHECK constraints.
--
-- `prisma migrate diff` emits tables, indexes and foreign keys but NOT CHECK
-- constraints (Prisma's schema language does not model them), so the six domain
-- invariants that the SQLite migrations enforced are re-expressed here as
-- standard Postgres ALTER TABLE ... ADD CONSTRAINT ... CHECK, preserving the
-- exact original constraint names and semantics. No PRAGMA is needed: Postgres
-- enforces foreign keys and CHECKs by default.
-- ---------------------------------------------------------------------------

-- Integrity: product base prices are non-negative integer cents.
ALTER TABLE "Product" ADD CONSTRAINT "Product_basePriceCents_nonneg" CHECK ("basePriceCents" >= 0);

-- Integrity: order item quantity is positive.
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_quantity_positive" CHECK ("quantity" >= 1);

-- Integrity R12: lot units are non-negative.
ALTER TABLE "Lot" ADD CONSTRAINT "Lot_units_nonneg" CHECK ("units" >= 0);

-- Integrity R10: slaughter <= cutting <= packing < expiry.
ALTER TABLE "Lot" ADD CONSTRAINT "Lot_date_order" CHECK (
    "slaughterDate" <= "cuttingDate"
    AND "cuttingDate" <= "packingDate"
    AND "packingDate" < "expiryDate"
);

-- M8 guarded backing invariant: a lot must reference a legacy product OR a new
-- offer (never both null).
ALTER TABLE "Lot" ADD CONSTRAINT "Lot_backed_by_product_or_offer" CHECK (
    "productId" IS NOT NULL OR "farmProductOfferId" IS NOT NULL
);

-- Integrity R18: places never go negative and free <= total (no oversell).
ALTER TABLE "ReservationCycle" ADD CONSTRAINT "ReservationCycle_places_valid" CHECK (
    "freePlaces" >= 0
    AND "totalPlaces" >= 0
    AND "freePlaces" <= "totalPlaces"
);

