-- Phase M7 (migration-plan §7): add the remaining dimension/link indexes now
-- that the M2-M6 backfills have passed their verification gates. Purely
-- additive: every statement is CREATE INDEX IF NOT EXISTS so a database that
-- already carries an index (several were added by earlier feature migrations:
-- FarmProductOffer.farmId/.productDefinitionId, AnalyticsEvent type/
-- anonSessionId/farmId/createdAt, Incident farmId/status/lotId) is left
-- untouched and no index is duplicated. No table is rebuilt and no row changes.
--
-- Rationale: the admin dashboards group analytics by offer/definition/pack/
-- cycle and the incident browser filters/joins on every structured link
-- column, so these columns are indexed to keep those reads scalable.

-- AnalyticsEvent extra grouping dimensions (type/anonSessionId/farmId/createdAt
-- already exist from 20261111000000_add_analytics).
CREATE INDEX IF NOT EXISTS "AnalyticsEvent_offerId_idx" ON "AnalyticsEvent"("offerId");
CREATE INDEX IF NOT EXISTS "AnalyticsEvent_definitionId_idx" ON "AnalyticsEvent"("definitionId");
CREATE INDEX IF NOT EXISTS "AnalyticsEvent_packId_idx" ON "AnalyticsEvent"("packId");
CREATE INDEX IF NOT EXISTS "AnalyticsEvent_cycleId_idx" ON "AnalyticsEvent"("cycleId");

-- Incident structured link columns (farmId/status/lotId already exist from
-- 20261112000000_add_incident_websitetext_setting).
CREATE INDEX IF NOT EXISTS "Incident_productDefinitionId_idx" ON "Incident"("productDefinitionId");
CREATE INDEX IF NOT EXISTS "Incident_farmProductOfferId_idx" ON "Incident"("farmProductOfferId");
CREATE INDEX IF NOT EXISTS "Incident_packId_idx" ON "Incident"("packId");
CREATE INDEX IF NOT EXISTS "Incident_cycleId_idx" ON "Incident"("cycleId");
CREATE INDEX IF NOT EXISTS "Incident_orderId_idx" ON "Incident"("orderId");
