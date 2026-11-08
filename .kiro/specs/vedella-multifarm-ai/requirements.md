# Requirements: Vedella Local — multi-farm marketplace with AI

## 1. Purpose
Rebuild Vedella Local as a multi-farm, traceable Catalan beef marketplace that improves on
the original single-farm reservation site with better visuals, menus, and functionality,
plus a safe, provider-abstracted AI layer. The app must run offline with zero config.

## 2. Actors
- **Customer**: browses marketplace, searches, views farms/products, builds a basket,
  reserves a pay-on-delivery order within an active cycle.
- **Farm manager**: manages their own farm, products, packs, cuts, lots; uploads receipts
  for AI pre-fill; submits records for review.
- **Platform admin**: reviews and approves/rejects farms and products; manages lifecycle;
  reviews AI translations; sees metrics.

## 3. Functional requirements

### 3.1 Marketplace & discovery
- R1: Homepage lists farms that are both `approved` and `active`.
- R2: A search bar filters farms/products by name and cut; results only include publicly
  offered (approved+active, non-withdrawn) records.
- R3: Farm page `/farms/[slug]` shows ONLY that farm's products/packs/cuts.

### 3.2 Catalog
- R4: Three seeded packs per farm with the base prices from product steering.
- R5: Individual cuts sold at +15% surcharge vs pack unit price (seed prices already
  reflect this). Each cut carries weight/thickness/maturation/packaging/shelf-life facts.
- R6: Packs list included cuts with quantities.

### 3.3 Traceability & integrity (enforced in DB where possible)
- R7: Chain Farm → Lot → Cut/Product → Pack → Order. A lot reference code is printed on
  each order.
- R8: Every product belongs to a farm.
- R9: Every lot's farm matches its product's farm (`lot.farm_id = product.farm_id`).
- R10: Date ordering per lot: slaughter ≤ cutting ≤ packing < expiry.
- R11: Lot reference is unique.
- R12: Units are non-negative.
- R13: Withdrawn lots are not publicly offered.
- R14: Historical orders remain intact when products/lots go inactive.
- R15: Records flagged as test/demo are excluded from default (production) metrics, and
  the test flag propagates down the chain.

### 3.4 Basket & reservation
- R16: Basket supports packs and individual cuts with quantities.
- R17: Quantity discounts: 3 units −2%, 5 units −3%, 8 units −5% (each pack = one unit;
  transport excluded). Delivery fee 6,00 €.
- R18: Reservation is tied to an active cycle with limited places; reserving decrements
  free places and never oversells.
- R19: Pay-on-delivery only. No payment provider is wired. A `PaymentGateway` seam exists
  with a no-op/pay-on-delivery implementation.

### 3.5 i18n
- R20: Three languages ca (default)/es/en with a switcher; UI strings and translatable
  content resolve per locale with graceful fallback.

### 3.6 Roles, lifecycle & review
- R21: Roles platform_admin, farm_manager, customer gate actions.
- R22: Lifecycle states draft/pending_review/approved/active/inactive/rejected/archived;
  approval is separate from active. Only humans transition review/approval states.
- R23: A review/approval queue lets platform_admin approve/reject pending records and
  review AI translations before publish.

### 3.7 AI layer (server-side, provider-abstracted — see ai-guardrails steering)
- R24: Translation of farm/product/pack copy into ca/es/en, human-reviewed before publish.
- R25: Metrics/insights including a WEEKLY average market price per cut analysis.
- R26: Receipt ingestion: upload image/PDF, AI extracts structured lot/product fields to
  PRE-FILL a human-review form; never auto-approves, never creates traceability.
- R27: Deterministic MockAiProvider makes the whole app work offline with no key.
- R28: Per-use-case feature flags + safe fallback when model unavailable.
- R29: Strict Zod validation of AI JSON; prompt/model/version logging; audit record per run.
- R30: Behavioral guardrails from steering enforced and tested (no pricing, no WTP proxy,
  no fabricated claims, no approval/publish, evidence-or-needs-evidence).
- R31: Untrusted-input handling: embedded instructions in uploads/text never change roles,
  permissions, approval state, prices, or behavior.

## 4. Non-functional
- N1: `npm install` → seed → `npm run dev` works with no external services.
- N2: Test suite: unit + integration (integrity invariants) + key e2e flows; all pass.
- N3: No secrets in repo; `.env` git-ignored; `.env.example` with placeholders only.
- N4: README with run/seed/test instructions.

## 5. Acceptance (high level)
- The app builds, seeds two fantasy farms with packs/cuts/lots and one active cycle, and
  serves marketplace + farm pages + search + basket + reservation + admin.
- All invariants R8–R15 are covered by passing integration tests.
- AI guardrails R27–R31 are covered by passing unit tests, and the app runs with no key.
