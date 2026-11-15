-- FEAT-003 (session8-9 phase2): medical-claim content guard review state.
--
-- ADDITIVE and REVERSIBLE: adds two nullable TEXT columns to the existing
-- FarmProductOffer table. No column is dropped or renamed; existing rows are
-- untouched (both columns default to NULL = "no content flag").
--
-- WHY: a deterministic content guard (src/lib/content-guard.ts) classifies an
-- offer description into prohibited treatment/prevention claims, nutrition
-- claims needing evidence, or ordinary text. A flagged draft STILL SAVES but is
-- forced into human review and must never become approved/active/public while
-- the flag is unresolved. These columns persist that gate:
--   contentReviewState : null/'clear' | 'flagged' | 'needs_evidence' | 'resolved'
--   contentFlagReason  : short human-readable reason for the flag (no PII)
-- The publication decision stays human-only; this is deterministic code, never
-- an AI decision.
--
-- STATUS: applied to LOCAL/TEST only. The production (Neon) deploy is PROPOSED
-- and awaits explicit user approval; do NOT run `prisma migrate deploy` against
-- any production database as part of this change.

-- AlterTable
ALTER TABLE "FarmProductOffer" ADD COLUMN "contentReviewState" TEXT;
ALTER TABLE "FarmProductOffer" ADD COLUMN "contentFlagReason" TEXT;
