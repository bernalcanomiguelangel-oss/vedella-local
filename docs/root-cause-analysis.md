# Root-cause analysis — the five known historical failures

> For each known historical failure from the brief, this states with code/migration
> evidence whether it is **ALREADY FIXED**, **PARTIALLY addressed**, or **STILL OPEN**,
> and names the test that proves it (or the gap where none exists). Evidence is on branch
> `audit/session8-9-hardening` at `bb1825e`. Nothing was changed in Phase 1.

## H1 — "Product not reliably assigned to a farm"

**Status: ALREADY FIXED (at the DB level).**

- Legacy `Product.farmId` is non-null (`schema.prisma:178-179`, "required: every product
  belongs to a farm (R8)").
- The sellable model is `FarmProductOffer` with a **non-null** `farmId`
  (`schema.prisma:245-247`) and a FK to `Farm`. `ProductDefinition` is intentionally
  non-sellable and carries no farm; only offers are sold.
- Composite candidate keys `Product(id, farmId)` (`migration.sql:565`) and
  `FarmProductOffer(id, farmId)` (`:580`) exist specifically so a `Lot` can reference
  `(offerId, farmId)` together.

**Proof:** `tests/integration/product-model.test.ts` (16), `tests/integration/offer-isolation.test.ts`
(9). A new offer always has a farm; a farm_manager cannot create an offer for another farm.

## H2 — "Lot not reliably linked to the correct farm + product"

**Status: ALREADY FIXED (DB-enforced, not only UI).**

- `Lot.offer` is a **composite FK** `FOREIGN KEY ("farmProductOfferId","farmId") REFERENCES
  "FarmProductOffer"("id","farmId")` (`migration.sql:811`). A lot whose `farmId` does not
  equal its offer's `farmId` is rejected by Postgres. The legacy path has the mirror FK
  `Lot_productId_farmId_fkey` (`:808`).
- `Lot_backed_by_product_or_offer` CHECK (`:878`) requires `productId OR farmProductOfferId`
  to be set, so a lot cannot be orphaned from both a product and an offer. This is a guarded
  invariant rather than a blanket NOT NULL (which would wrongly reject legitimate
  single-backing rows).
- The shared guard `validateLot()` (`src/lib/validateLot.ts`) adds defence-in-depth
  (`PRODUCT_MISMATCH`, `FARM_MISMATCH`).

**Proof:** `tests/integration/integrity.test.ts` (16, includes "composite FK rejects a
cross-farm lot"), `tests/validateLot.test.ts` (10), and `offer-isolation.test.ts`
"Farm A manager cannot create a lot against Farm B's offer" (`res.code === "FORBIDDEN"`).

## H3 — "Draft used instead of true inactive; history must remain"

**Status: ALREADY FIXED.**

- `src/lib/admin/lifecycle.ts` defines seven distinct states including both `draft` and
  `inactive`. `flagsForState`: `draft` → `{isApproved:false, isActive:false}`; `inactive`
  → `{isApproved:true, isActive:false}`. The two are **not** equivalent: `inactive` is an
  approved-but-unpublished record (retains approval + history), `draft` is unapproved.
- Transitions are explicit; deactivation is `active -> inactive` (not `-> draft`), and
  `inactive -> active` re-publishes. `archived` is a terminal shelf. No transition deletes
  history; every transition writes an `AdminAudit` row.

**Proof:** `tests/admin/lifecycle.test.ts` (13). The `offer-isolation` self-edit test also
shows deactivation does not drop the record.

## H4 — "Missing mandatory lot references/dates not sufficiently blocked/explained"

**Status: ALREADY FIXED.**

- `validateLot()` throws a **specific coded** `LotValidationError` per violation:
  `EMPTY_REFERENCE` ("Lot reference is required."), `DUPLICATE_REFERENCE`, `BAD_DATE`
  ("Lot has an invalid date."), `BAD_DATE_ORDER` ("slaughter <= cutting <= packing <
  expiry."), `NEGATIVE_UNITS`, `PRODUCT_MISMATCH`, `FARM_MISMATCH`.
- DB backstops: `Lot_date_order` CHECK (`migration.sql:870`), `Lot_units_nonneg` (`:867`),
  `Lot_reference_key` unique index (`:610`).
- An invalid record cannot be approved/activated because the public gate requires
  `isApproved && isActive` plus a usable lot (`catalog.ts`), and approval is a human-only
  lifecycle transition.

**Proof:** `tests/validateLot.test.ts` (10), `tests/integration/integrity.test.ts` (16,
unique reference + CHECK rejections with specific errors).

## H5 — "Customer data exposed before remediation (reported fixed)"

**Status: ALREADY FIXED — preserved and verified by regression.**

- Customer-facing data access is restricted to authorized admin workflows: data loaders use
  `offerScopeWhere` / `visibleFarmScope` (`src/lib/admin/data.ts`, `scope.ts`) so a
  `farm_manager` queries only their own farm; `requireAdmin`/`requirePlatformAdmin` gate
  every admin page and action; `getApiAdmin` gates the AI API routes; `/api/reserve` is the
  only public write path and is rate-limited.
- Analytics capture no unnecessary PII (opaque `vl_anon` session id; `InterestedContact`
  stores opt-in emails only).

**Proof:** `tests/api/auth.test.ts` (6, non-admin 401), `tests/api/auth-gate.test.ts` (6),
`tests/admin/scope.test.ts` (7), `tests/integration/offer-isolation.test.ts` (9, Farm A
cannot read Farm B), `tests/integration/settings-secrets.test.ts` (4, secrets never
exposed). Phase 2 should add an explicit regression that each of the five personas
(logged-out, customer, Farm A, Farm B, platform_admin) receives only its minimum authorized
data for customer-contact / order endpoints — see `docs/security-regression-plan.md`.

## Additional finding — medical/unsupported claim on a hand-typed description

**Status: PARTIALLY addressed (candidate Phase-2 work).**

- AI-proposed copy is guarded: the mock judge FAILs medical/nutrition/scarcity wording
  (`src/lib/ai/mock-provider.ts` forbidden keywords incl. "cures", "medicinal"), and the
  copy prompts forbid such claims (`src/lib/ai/copy-prompts.ts`). WebsiteText rejects
  operational facts but is generic copy, not product descriptions.
- There is **no automated detector** that blocks a medical claim typed by a human directly
  into a `FarmProductOffer.description` (`manage.ts applyOfferCreate` stores the description
  verbatim). The brief's Case 13 is satisfied today only via the **human-review gate** (a
  new/edited offer enters `pending_review` and cannot be public without approval), which the
  brief explicitly accepts ("blocked, OR non-public draft, OR enters human review and cannot
  appear publicly without authorised correction"). Phase 2 could add an explicit
  medical-claim detector + regression test for the stronger "blocked / flagged" outcome.
