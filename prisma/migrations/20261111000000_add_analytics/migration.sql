-- Analytics (FEAT-005): anonymous visitor tracking + channel attribution +
-- a notify-me interest list. All additive new tables; nothing existing is
-- altered or dropped.

-- CreateTable
CREATE TABLE "AnalyticsEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "AnalyticsEvent_type_idx" ON "AnalyticsEvent"("type");
CREATE INDEX "AnalyticsEvent_anonSessionId_idx" ON "AnalyticsEvent"("anonSessionId");
CREATE INDEX "AnalyticsEvent_farmId_idx" ON "AnalyticsEvent"("farmId");
CREATE INDEX "AnalyticsEvent_createdAt_idx" ON "AnalyticsEvent"("createdAt");

-- CreateTable
CREATE TABLE "ChannelAttribution" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "anonSessionId" TEXT NOT NULL,
    "firstTouchChannel" TEXT NOT NULL DEFAULT 'unknown',
    "latestTouchChannel" TEXT NOT NULL DEFAULT 'unknown',
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "farmReferralCode" TEXT,
    "orderId" TEXT,
    "isTest" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "ChannelAttribution_anonSessionId_key" ON "ChannelAttribution"("anonSessionId");
CREATE INDEX "ChannelAttribution_anonSessionId_idx" ON "ChannelAttribution"("anonSessionId");

-- CreateTable
CREATE TABLE "InterestedContact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "locale" TEXT,
    "anonSessionId" TEXT,
    "farmId" TEXT,
    "isTest" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "InterestedContact_farmId_idx" ON "InterestedContact"("farmId");
CREATE INDEX "InterestedContact_createdAt_idx" ON "InterestedContact"("createdAt");
