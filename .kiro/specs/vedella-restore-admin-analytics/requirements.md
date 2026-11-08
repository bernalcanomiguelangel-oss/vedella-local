# Requirements: restore & improve the full Vedella Local management platform

> Upgrade spec for the existing repository (not a greenfield rebuild). Companion analysis:
> `docs/lovable-vs-github-gap-analysis.md`, `docs/admin-information-architecture.md`,
> `docs/analytics-dictionary.md`, `docs/farm-product-data-model.md`,
> `docs/migration-plan.md`, `docs/pre-implementation-response.md`.
>
> **Gate:** no production migration is applied until the user approves the plan and the
> section-12 blocking questions in the pre-implementation response are resolved.

## 1. Purpose
Restore the full internal operating model that the Lovable design had, improve the
multi-farm architecture, and keep the public marketplace, traceability, reservation
cycles, analytics, and administration connected to one structured source of truth. All
existing security and AI-guardrail steering remains binding.

## 2. Actors
As today: `platform_admin`, `farm_manager`, `customer`. Farm managers are isolated to
their own farm's data at the DB layer.

## 3. Functional requirements

### 3.1 Product model
- R-PM1: A reusable `ProductDefinition` (canonical cut, category, translation keys) that
  is NOT directly sellable.
- R-PM2: A farm-specific `FarmProductOffer` referencing a definition and carrying the full
  field list in `docs/farm-product-data-model.md` §2.2.
- R-PM3: `Entrecot · Farm A` and `Entrecot · Farm B` are distinct offers of one definition
  with independent price/weight/thickness/maturation/packaging/storage/shelf-life/lot/
  cycle. The UI may group by definition for discovery but never merges farm-specific
  values.
- R-PM4: Packs contain offers (single-farm or explicitly multi-farm), with item-level
  farm + lot traceability; publishable only when all referenced offers are approved+active.
- R-PM5: Lots reference one offer (composite FK preserving `lot.farmId == offer.farmId`),
  keep unique reference, units≥0, date ordering.
- R-PM6: Orders snapshot offer + farm + definition + lot + commercial terms; historical
  orders stay intact.

### 3.2 Admin panel
- R-AD1: Left-nav shell, 14 sections, Spanish labels translated ca/es/en, warm
  cream/brown/gold/green palette, serif display; collapsible on mobile.
- R-AD2: Every section re-authenticates server-side; platform admin sees all, farm manager
  sees only own-farm data; Users/Website-text/Settings are platform-only.
- R-AD3: Overview with operational cards + four action lists, each deep-linking to a
  filtered record set.
- R-AD4: Management screens for Farms, Products & packs, Lots, Cycles, Orders, Incidents,
  Website text, Users & permissions; browsable Audit log; Settings. Behaviour per
  `docs/admin-information-architecture.md` §3.

### 3.3 Metrics & analytics
- R-MX1: `AnalyticsEvent` model + emission for the events in `docs/analytics-dictionary.md`
  §2, avoiding unnecessary PII and honouring consent.
- R-MX2: `ChannelAttribution` with the explicit channel set, first+latest touch, UTM, farm
  referral code; `unknown` when undetermined (never guessed).
- R-MX3: KPI cards + multi-farm cards with documented formulas (numerator/denominator/
  status-scope/time-scope/test-rule) per the dictionary.
- R-MX4: Filters (cycle, dates, language, farm, product/pack, channel, delivery method,
  order status, real-vs-test) with URL state, reset, and test-excluded default.
- R-MX5: Charts with empty states + small-sample caveats; drill-down from any metric to
  the filtered list.
- R-MX6: Farm managers see only own-farm metrics; platform aggregates never expose one
  farm's confidential line items to another.

### 3.4 Public alignment
- R-PX1: Cycle block fully DB-driven (zone, method, close timestamp, delivery/pickup dates,
  delivery price, remaining capacity, countdown from the real close timestamp). No
  hard-coded November 2026 / 37-50 / price.
- R-PX2: Pack spec table generated from the actual pack composition, not one farm's
  hard-coded values.
- R-PX3: Full dynamic Farm→Lot→Cut→Package/Pack→Order traceability chain.

### 3.5 AI
- R-AI1: Bounded in-panel assistants (farm profile, offer compare, traceability review,
  metrics analyst, cycle recommendation), each behind a feature flag, each with prompt
  version + model version + input refs + Zod-validated structured output + human
  accept/edit/reject + decision reason + audit history.
- R-AI2: AI never sets prices, approves, publishes, or creates traceability records;
  untrusted input never changes roles/permissions/status/price; mock fallback keeps the
  app working offline. (Carries over existing steering, now enforced per assistant.)

### 3.6 Security & permissions
- R-SE1: Keys only from git-ignored `.env`; a leaked key is compromised and never used;
  no secrets in browser-visible settings.
- R-SE2: Permissions matrix for platform admin / farm manager / public, enforced at the DB
  layer and tested with Farm A + Farm B accounts.
- R-SE3: New accounts never auto-admin.

## 4. Non-functional
- N1: App still runs fully offline with the mock AI provider, zero config.
- N2: `npm test` + `npm run test:e2e` + `npm run build` green after every phase.
- N3: Migrations follow the gated M1–M8 order; no uncertain data deleted; historical
  orders preserved.

## 5. Acceptance
Per `docs/pre-implementation-response.md` §11 and feedback-prompt section 20, including:
admin shell + nav; metrics with test-excluded defaults; admin creates Entrecot offers for
both farms with different values and Farm A manager cannot edit Farm B's; comparison does
not merge values; dynamic pack spec table; dynamic public traceability; security
regression (AI never prices/approves; injection changes no state).
