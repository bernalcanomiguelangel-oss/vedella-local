# Pre-implementation response (feedback prompt section 22)

> This is the required Kiro response **before** any implementation. No production
> migration is applied. Every claim is grounded in the repository at commit `2adc95d`;
> unverifiable points are listed honestly in section 12 rather than guessed.

## 1. Features present today

- Public marketplace: homepage (approved+active farms), `/farms/[slug]`, search, basket
  with quantity discounts (3/5/8 → 2/3/5%) + 6,00 € delivery, reserve-now/pay-on-delivery
  with atomic no-oversell and an isolated `PaymentGateway` seam.
- i18n ca (default)/es/en with switcher; approved-translation resolution for content.
- Traceability chain Farm→Lot→Product(cut/pack)→Order with a lot reference on each order;
  DB-enforced integrity (unique lot ref, units≥0, date ordering, composite FK forcing
  `lot.farmId == product.farmId`, no-oversell CHECK).
- Role-gated admin (`platform_admin`/`farm_manager`/`customer`) with server-side gating,
  a human-only review/approval queue, a lifecycle grid, a weekly market-price metrics
  page, and AI receipt ingestion.
- Server-side, provider-abstracted AI layer (mock-by-default, offline) for translation,
  weekly market-price metric, receipt extraction; Zod validation, guardrail filter, and
  `AiRun` + `AdminAudit` audit tables.

## 2. Features missing vs this prompt

- Two-level product model (ProductDefinition + FarmProductOffer) — **does not exist**.
- 10 of 14 admin sections: Granjas, Productos y packs, Lotes, Ciclos, Pedidos,
  Incidencias, Textos web, Usuarios y permisos, Ajustes, and a browsable Registro de
  actividad (data exists, no UI).
- Full Sales Metrics: KPI/formula library, filters, charts, channel attribution,
  analytics event model, drill-downs, farm-scope confidentiality.
- Incidents, Website-text CMS, Settings, Users/assignments UI.
- Rich cycles (status/open-close/duplicate/per-farm capacity/eligible-lot detection) and
  rich orders (expanded statuses + multi-farm fulfilment groups).
- Dynamic public cycle facts + spec table generated from real pack composition + full
  item-level traceability rendering.
- Bounded in-panel AI assistants (farm profile, offer compare, traceability review,
  metrics analyst, cycle recommendation) with human accept/edit/reject + decision history.
- Left-nav admin shell with warm palette/serif type and Spanish labels translated ca/es/en.

## 3. Existing schema & conflicts with the proposed model

Current tables: `User, Farm, Product, PackItem, Lot, ReservationCycle, Order, OrderItem,
Translation, AiRun, AdminAudit, MarketPriceSnapshot` (see `prisma/schema.prisma`).

Conflicts:
- `Product` conflates *definition* and *offer*. Splitting it is the biggest change and
  touches `PackItem`, `Lot` (composite FK), `OrderItem`, `Translation`, `catalog.ts`,
  `reserve.ts`, and the seed.
- `Lot.product` composite FK targets `Product(id, farmId)`; it must be re-pointed to
  `FarmProductOffer(id, farmId)` via a SQLite table rebuild.
- `ReservationCycle` and `Order` are too thin for the required cycle/order workflows.
- Free-text facts (`weight`, `maturation`, …) must become structured fields without
  losing the original strings.

## 4. Do ProductDefinition and FarmProductOffer already exist separately?

**No.** They are a single `Product` table today. "Entrecot" is seeded as two unrelated
`Product` rows (one per farm) that share only a `name` string; there is no `category`,
no canonical definition, and no reusable cross-farm concept.

## 5. Cause of the missing admin management experience

Scope, not regression. The current spec (`.kiro/specs/vedella-multifarm-ai/requirements.md`,
R21–R26) only ever scoped a review queue, a lifecycle grid, and three AI use cases. The
14-section operational panel was never built; nothing was deleted.

## 6. Cause of the missing sales metrics

The only metric in scope was the weekly average market price per cut (R25). Revenue,
conversion, funnel, margin, and channel metrics require an **analytics event stream**,
**channel attribution**, **margin/cost inputs**, and **promised-vs-actual fulfilment
capture** — none of which exist in the schema. They are not computable from current data.

## 7. Cause of the second farm not appearing

**Not reproduced from code.** The seed creates two approved+active non-test farms and
`listOfferedFarms()` returns all such farms, so both should appear. A farm would be hidden
only if it were not approved+active, were `isTest`, or had no offer backed by a usable
(non-withdrawn, in-stock, non-test) lot. The real gap is the **absence of a "diagnose
public readiness" tool** (prompt section 6) to show operators *why* a farm is hidden. If
the user has observed a specific farm missing, we need the reproduction details (section
12, Q3).

## 8. Tables + migrations required

New tables: `ProductDefinition`, `FarmProductOffer`, `DeliveryMethod`, `DeliveryZone`,
`OfferDeliveryMethod`, `Pack`, `CycleOfferAvailability`, `FulfilmentGroup`, `Incident`,
`WebsiteText`, `Setting`, `AnalyticsEvent`, `ChannelAttribution`.
Altered tables: `Product` (deprecated after migration), `PackItem`, `Lot` (re-pointed FK),
`ReservationCycle` (enriched), `Order`/`OrderItem` (attribution + statuses + snapshots).
Migration sequence M1–M8 with verification gates is specified in `docs/migration-plan.md`
(additive first, backfill + verify, constrain, then non-null + enable; destructive cleanup
deferred). **No migration is applied in this pass.**

## 9. Existing data at risk

- Historical orders: protected — snapshot columns are untouched and new FKs are nullable
  (R14).
- Free-text product facts: preserved verbatim in a `legacyFacts` field during the
  offer backfill; unparsed rows flagged `needs-review`, never dropped.
- The single active cycle "Cicle novembre 2026": enriched additively; public facts must
  render identically after M6 (verification gate).
- `Product` rows: retained read-only until a final, separate cleanup migration after the
  new model ships and is verified. Nothing is deleted while uncertain.

## 10. Proposed implementation phases

Following the prompt's section 21 sequence:
1. Gap analysis (this pass — the five docs + this response).
2. Restore admin shell + routes (left nav, 14 sections, labels ca/es/en, warm palette).
3. Correct definition-vs-offer model (M1–M3 additive + backfill).
4. Repair farm→offer→lot relationships (M4, verified).
5. Restore management screens (farms, products+packs, lots, cycles, orders).
6. Restore analytics event model + dictionary (M1 tables + emission).
7. Restore dashboard cards/charts/filters/drill-downs.
8. Restore incidents / website-text / users / review / audit / settings.
9. Connect public cycle facts + pack spec + traceability to structured data.
10. Add farm-manager restrictions + Farm A/Farm B tests.
11. Add bounded AI assistants behind flags.
12. Full regression.

Each phase leaves the app building, seeding, and green; migrations advance only through
the gated M1–M8 order.

## 11. Test plan

- **Unit:** pricing (unchanged), lifecycle, scope, new metric formulas (numerator/
  denominator/test-rule), attribution channel resolution, offer-field validation.
- **Integration (real SQLite):** offer isolation (Farm A manager cannot read/write Farm B
  offers/lots/packs/incidents); lot↔offer composite FK rejects a cross-farm lot; migration
  verification queries (M2–M6 gates); order snapshot immutability; no-oversell preserved.
- **Metrics:** KPIs exclude test data by default; small-sample flagging; farm-scoped
  metrics never leak another farm's line items.
- **e2e (Playwright):** admin creates `Entrecot` offers for both farms with different
  price/weight; comparison view shows both without merging; Farm A manager blocked from
  editing Farm B's Entrecot; pack spec table generated from real composition; public
  traceability chain renders Farm→Lot→Offer→Package→Order; cycle countdown from the real
  close timestamp; security regression (AI never approves/prices; prompt injection changes
  no state).
- **Gate:** `npm test` + `npm run test:e2e` + `npm run build` green after every phase.

## 12. Questions that genuinely block implementation

1. **Definition catalogue ownership:** should `ProductDefinition` be a fixed
   platform-curated list (the 7 seeded cuts + a few more), or may farm managers propose
   new definitions for platform approval? This changes the Users/permissions and Review
   flows.
2. **Margin/cost data source:** contribution-margin KPIs need per-offer cost and delivery
   cost. Is there a source for these, or should margin cards be deferred until cost inputs
   are captured?
3. **"Second farm not appearing":** can the user confirm whether this is an observed bug
   and, if so, provide the farm slug, its lifecycle/isApproved/isActive/isTest, and
   whether it has an in-stock non-withdrawn lot? From code both seeded farms should show.
4. **Analytics consent/PII:** what is the required consent model for storing `customerId`
   on events, and the retention period? This gates the AnalyticsEvent schema.
5. **Charting:** may we add a charting dependency (e.g. a lightweight SVG chart lib), or
   must charts be hand-rolled server-side SVG to keep the dependency surface minimal?
6. **Public cycle hard-coding:** are "Cicle novembre 2026 / 37 of 50 / Vallès Oriental"
   present as hard-coded strings in any **page** (not just the seed)? A phase-9 audit will
   confirm; if the user already knows, it saves a pass.
7. **Multi-farm pack scope:** are multi-farm packs needed for the first delivery, or can
   they ship after single-farm packs (the model supports both, but it affects ordering).
8. **Real AI provider:** will a real provider ever be enabled, or is mock-only the
   permanent target? (Affects how much assistant UI we build around the real path.)

**Per the prompt: STOP here for user review. No production migration will be applied until
these are resolved and the plan is approved.**
