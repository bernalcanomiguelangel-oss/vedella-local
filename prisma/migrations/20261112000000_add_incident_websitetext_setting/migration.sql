-- FEAT-006: operational / content / configuration tables.
--
-- Additive-only migration (docs/migration-plan.md safe pattern): three new
-- tables, no changes to existing tables, no data loss. Incident links to
-- existing structured records by nullable id columns (no FKs so an incident can
-- reference a record in any state and historical rows never block). WebsiteText
-- holds GENERIC copy only (operational facts are rejected in app code).
-- Setting stores NO secret VALUES — AI/provider keys stay in the git-ignored
-- .env and surface only as presence-only booleans.

-- CreateTable
CREATE TABLE "Incident" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reference" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'low',
    "description" TEXT NOT NULL DEFAULT '',
    "reportedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ownerUserId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "correctiveAction" TEXT,
    "resolution" TEXT,
    "resolvedAt" DATETIME,
    "farmId" TEXT,
    "productDefinitionId" TEXT,
    "farmProductOfferId" TEXT,
    "lotId" TEXT,
    "packId" TEXT,
    "cycleId" TEXT,
    "orderId" TEXT,
    "isTest" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Incident_reference_key" ON "Incident"("reference");
CREATE INDEX "Incident_farmId_idx" ON "Incident"("farmId");
CREATE INDEX "Incident_status_idx" ON "Incident"("status");
CREATE INDEX "Incident_lotId_idx" ON "Incident"("lotId");

-- CreateTable
CREATE TABLE "WebsiteText" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pageKey" TEXT NOT NULL,
    "sectionKey" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "draftText" TEXT NOT NULL DEFAULT '',
    "publishedText" TEXT,
    "charLimit" INTEGER,
    "lastEditorUserId" TEXT,
    "lastPublishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "WebsiteText_pageKey_sectionKey_locale_key" ON "WebsiteText"("pageKey", "sectionKey", "locale");
CREATE INDEX "WebsiteText_pageKey_idx" ON "WebsiteText"("pageKey");

-- CreateTable
CREATE TABLE "Setting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "valueType" TEXT NOT NULL DEFAULT 'string',
    "stringValue" TEXT,
    "numberValue" INTEGER,
    "booleanValue" BOOLEAN,
    "jsonValue" TEXT,
    "category" TEXT NOT NULL DEFAULT 'general',
    "label" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Setting_key_key" ON "Setting"("key");
CREATE INDEX "Setting_category_idx" ON "Setting"("category");
