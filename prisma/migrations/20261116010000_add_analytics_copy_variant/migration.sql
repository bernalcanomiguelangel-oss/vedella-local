-- FEAT-005 (blob/gemini/ab-testing): A/B copy-testing measurement dimension.
--
-- ADDITIVE and REVERSIBLE: adds one nullable TEXT column + one index to the
-- existing AnalyticsEvent table. No column is dropped or renamed. The column
-- holds the approved CopyVariant id the anonymous session was shown / converted
-- on; it is an id only and carries NO variant text and NO PII.

-- AlterTable
ALTER TABLE "AnalyticsEvent" ADD COLUMN "copyVariantId" TEXT;

-- CreateIndex
CREATE INDEX "AnalyticsEvent_copyVariantId_idx" ON "AnalyticsEvent"("copyVariantId");
