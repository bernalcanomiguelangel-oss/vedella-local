# Migration plan (safe, backwards-compatible)

> **This plan is NOT executed in this pass.** No `prisma migrate` / `db push` is run; no
> committed migration or seed is mutated here. The plan describes the safe order to apply
> later, after the user reviews. Grounded in the real schema at commit `2adc95d`.

## 0. Principles

1. **Additive first.** New tables and new nullable columns only; never drop or rename a
   column in the same step that code still reads.
2. **Never delete uncertain data.** Rows we cannot confidently migrate are copied and
   flagged for human review, not discarded.
3. **Preserve historical orders.** `Order`/`OrderItem` snapshot columns
   (`nameSnapshot`, `priceCentsSnapshot`, `lotReferenceSnapshot`) stay intact; new
   foreign keys to offers/definitions are **nullable** so old rows remain valid (R14).
4. **Backfill, verify, then constrain.** Make a column non-null or add a cross-table
   constraint only after a verification query proves 100% of live rows satisfy it.
5. **SQLite reality.** SQLite cannot add UNIQUE/FK in place; table rebuilds follow the
   exact pattern already used in
   `prisma/migrations/20261109000000_lot_product_farm_composite_fk/migration.sql`
   (PRAGMA foreign_keys=OFF → create `_new` → copy rows → drop → rename → recreate indexes
   → PRAGMA foreign_keys=ON). Each rebuild is its own reversible step.

## 1. Phase M1 — add new tables (no change to existing rows)

Create (all nullable FKs, new tables only): `ProductDefinition`, `FarmProductOffer`,
`DeliveryMethod`, `DeliveryZone`, `OfferDeliveryMethod`, `Pack` (new), new `PackItem`
shape staged as `PackItemV2` if needed, `CycleOfferAvailability`, `Incident`,
`WebsiteText`, `Setting`, `AnalyticsEvent`, `ChannelAttribution`, `FulfilmentGroup`.

Risk: none to existing data (purely additive). App keeps running on the old `Product`
path.

## 2. Phase M2 — backfill definitions from existing cuts

For each distinct `Product.name` where `kind = "cut"`, create one `ProductDefinition`
(canonicalName = name, category = best-effort from name, else `needs-review`). Because
"Entrecot" appears once per farm, de-duplicate by canonical name. Write a mapping table
`product_to_definition(productId, definitionId, confidence)`.

Rows where the name does not map cleanly get `confidence = "needs-review"` and are listed
in `/admin/review`. **No row is dropped.**

## 3. Phase M3 — backfill offers from existing products

For each `Product` with `kind = "cut"`, create a `FarmProductOffer`:
- `farmId = Product.farmId`, `productDefinitionId` from the M2 map,
- `publicName = Product.name`, `priceAmountCents = Product.basePriceCents`,
- structured fields parsed best-effort from the free-text columns
  (`weight`→min/max g, `thickness`→mm, `maturation`→days, `shelfLife`→days + storageState,
  `packaging`→packagingMethod). **Keep the original strings** in a `legacyFacts` JSON/text
  column on the offer so a failed parse never loses data; flag such offers
  `needs-review`.
- Copy `lifecycle/isApproved/isActive/isTest` verbatim so public visibility is unchanged.

Packs (`kind = "pack"`) become `Pack` rows; their `PackItem`s are rewritten to reference
the new offers (via the M3 product→offer map) with `farmId` filled from the owning farm.

Record `product_to_offer(productId, offerId)` for later steps.

## 4. Phase M4 — re-point Lot to offers (verified)

1. Add nullable `Lot.farmProductOfferId`.
2. Backfill it from `product_to_offer[Lot.productId]`.
3. **Verify:** `SELECT count(*) FROM Lot WHERE farmProductOfferId IS NULL` must be 0 and
   `lot.farmId == offer.farmId` for every row. If any row fails, stop and route to review;
   do not proceed.
4. Rebuild `Lot` (SQLite pattern) so the composite FK targets
   `FarmProductOffer(id, farmId)` instead of `Product(id, farmId)` — mirroring the
   existing composite-FK migration exactly. Keep `reference` unique, `units ≥ 0`, and the
   date-ordering CHECK.
5. Keep `Lot.productId` as a nullable legacy column for one release, then drop in a later
   migration once nothing reads it.

## 5. Phase M5 — enrich Order / OrderItem (historical-safe)

1. Add nullable columns to `Order` (attribution, promisedDeliveryDate, deliveryMethod,
   pickup, expanded status default `pending`) and `OrderItem`
   (`farmProductOfferId?`, `farmId?`, `productDefinitionId?`, actual weight, snapshot
   extensions). All nullable.
2. Backfill new FK columns for **open** orders only, from `product_to_offer`. Historical
   fulfilled orders keep their text snapshots and leave the new FKs null — they remain
   fully readable (R14).
3. Create `FulfilmentGroup` rows for existing multi-item orders where farms differ.
4. Do **not** add a non-null constraint on the new order FKs (historical rows are
   legitimately null).

## 6. Phase M6 — cycle enrichment + availability

Add new nullable cycle columns (internalName, publicTitle, status, openAt, pickupDate,
deliveryPriceCents, etc.); backfill from the single existing active cycle. Populate
`CycleOfferAvailability` from offers that currently have a usable lot. Existing
`totalPlaces/freePlaces/closeDate/deliveryDate` stay authoritative until the richer model
is wired.

## 7. Phase M7 — indexes & constraints (after data passes)

Add indexes (`FarmProductOffer.farmId`, `.productDefinitionId`, `AnalyticsEvent` dims,
`Incident` link columns) and the cross-table integrity constraints only now, after M2–M6
verification queries report zero violations. Add the offer composite candidate key
`@@unique([id, farmId])` before M4's Lot rebuild depends on it.

## 8. Phase M8 — make columns non-null & enable

Only after verification: flip verified columns to non-null in a dedicated migration
(e.g. `FarmProductOffer.productDefinitionId`, `Lot.farmProductOfferId`). Then enable the
new read paths behind a feature flag so the public catalog/admin switch from `Product` to
offers in one controlled step, with the old `Product` table retained read-only until a
later cleanup migration.

## 9. Rollback

Each phase is a discrete migration. Because every change through M6 is additive/nullable,
rolling back = not applying the later migration; no data is lost. The only destructive
steps (dropping `Lot.productId`, dropping `Product`) are deferred to a final, separate
cleanup migration that runs only after the new model has shipped and been verified in
use.

## 10. Verification gates (must pass before advancing)

- M2: every `kind="cut"` Product maps to exactly one definition; unmapped → review, count
  logged.
- M3: `count(FarmProductOffer) == count(Product where kind='cut')`; visibility flags equal
  the source.
- M4: zero null `Lot.farmProductOfferId`; `lot.farmId == offer.farmId` for all rows.
- M5: every **open** order item has an offer FK; historical items unchanged; order totals
  unchanged.
- M6: the active cycle's public facts render identically to before.
- Full `npm test` + `npm run test:e2e` green after each phase.

## 11. Explicitly out of scope for THIS pass

No migration file is written or applied; `prisma/seed.ts`, `prisma/dev.db`, and all
committed migrations are left untouched. Implementation begins only after user review.
