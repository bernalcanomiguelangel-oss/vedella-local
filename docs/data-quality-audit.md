# Data-quality audit — Vedella Local (Session 8/9 hardening, Phase 1)

> Offline-safe approach. The live Neon production DB cannot be queried (no network/
> credentials, and the brief forbids touching production). So each data-quality concern
> is checked at two levels: (1) the committed **schema + migrations** prove the bad state
> is *prevented*, and (2) the **seed** (`prisma/seed.ts`) is the known seeded dataset.
> Anything that can only be confirmed against live rows is marked
> **requires a read-only production/Neon check — Not verified offline.**

## Concern-by-concern

| # | Concern | Prevention mechanism (cite) | Live-row check |
| --- | --- | --- | --- |
| 1 | Products without a farm | `Product.farmId` non-null + FK to `Farm` (`schema.prisma:177-179`); sellable `FarmProductOffer.farmId` non-null + FK (`:245-247`). `ProductDefinition` is non-sellable by design. | Not verified offline |
| 2 | Lots without a farm | `Lot.farmId` non-null + FK to `Farm` (`schema.prisma:387-388`). | Not verified offline |
| 3 | Lots without a product/offer | `Lot_backed_by_product_or_offer` CHECK: `productId IS NOT NULL OR farmProductOfferId IS NOT NULL` (`migration.sql:878`). | Not verified offline |
| 4 | Lots pointing at another farm's product/offer | Composite FKs `Lot_productId_farmId_fkey` (`migration.sql:808`) and `Lot_farmProductOfferId_farmId_fkey` (`:811`) force `lot.farmId == product/offer.farmId`. Guard `validateLot()` raises `FARM_MISMATCH`/`PRODUCT_MISMATCH`. | Not verified offline |
| 5 | Farms missing from the homepage | By design `listOfferedFarms` shows only `isApproved && isActive && !isTest` (`catalog.ts`); exclusion is intentional, not a defect. A farm hidden for a missing condition is surfaced to admin with the precise reason (public-readiness concept). | Not verified offline |
| 6 | Products visible without approval | Public gate requires `isApproved && isActive` (+ usable lot) at every read path (`catalog.ts`); approval is a human-only lifecycle transition (`lifecycle.ts`). | Not verified offline |
| 7 | Duplicate lot references | `Lot_reference_key` UNIQUE index (`migration.sql:610`) + guard `DUPLICATE_REFERENCE` (R11). | Not verified offline |
| 8 | Invalid date sequences | `Lot_date_order` CHECK: `slaughterDate <= cuttingDate <= packingDate < expiryDate` (`migration.sql:870`) + guard `BAD_DATE_ORDER` (R10). | Not verified offline |
| 9 | Test records in production metrics | Every record carries `isTest`; metrics exclude `isTest` by default (`analytics-metrics.ts`, `metrics-data.ts`); public catalog excludes `isTest` lots/farms (`catalog.ts`). | Not verified offline |
| 10 | Public pages using hard-coded values | Homepage/farm-page/cycle facts read from the DB (`catalog.ts`); `WebsiteText` rejects operational facts (`website-text.ts`). Only the fixed Catalan UI dictionary is hard-coded (chrome, not data). | n/a (code-level) |

## Schema-level prevention proof (summary)

The migrations make the following **structurally impossible** (Postgres rejects the write):
negative lot units; out-of-order lot dates; a lot with neither product nor offer; a lot whose
farm differs from its product/offer; duplicate lot references; negative prices; a reservation
cycle oversell (`freePlaces` below 0 or above `totalPlaces`). The SQLite test harness
(`tests/helpers/testDb.ts`) reproduces these so the offline suite exercises the same rejections
(`tests/integration/integrity.test.ts`).

## Seed dataset check (`prisma/seed.ts`)

- Two approved + active **non-test** fantasy farms (Mas Vallgorguina, Cal Serrat del Bosc),
  each with three packs, seven cuts, valid lots with unique references, and one active cycle
  (`Cicle novembre 2026`, 37/50 places free). The seed is idempotent.
- The seed deliberately marks **one `isTest=true` lot** (`seed.ts` ~line 418, "gets one isTest
  lot to exercise metric exclusion (R15)") so the test-data-exclusion path has live data to
  prove against in the vitest suite.
- Every seeded lot is created through the same invariants (unique reference, ordered dates,
  farm == offer/product), so the seed itself contains no orphan/cross-farm/duplicate rows.

## What requires a live read-only production check (Phase 2, authorized)

The following cannot be confirmed offline and should be run as **read-only** queries against
a production/Neon snapshot (never a destructive test against production):

1. Are there any existing `Lot` rows in production that predate a constraint and violate it?
   (Postgres would have rejected new writes, but legacy/backfilled rows should be audited.)
2. Any `FarmProductOffer`/`Product` rows with a dangling `farmId`, or lots with units < 0 /
   bad dates that slipped in before the CHECKs were added?
3. Any duplicate lot references across the whole table (the UNIQUE index prevents new ones;
   confirm none pre-existed).
4. Any `isTest=true` rows leaking into any dashboard figure in the live data.

These are listed as Phase-2 live-env tasks, not Phase-1 claims. They are reported as
**Not verified offline**, never as PASS.
