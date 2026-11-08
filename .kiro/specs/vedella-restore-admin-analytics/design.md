# Design: restore & improve the Vedella Local management platform

> Design companion to `requirements.md`. Reuses existing patterns; see the five `docs/*`
> analysis files for the detailed data model, IA, and migration order.

## 1. Approach

Additive, phased, backwards-compatible. The public marketplace and the existing admin keep
working while the new two-level product model and the 14-section panel are built behind
the gated migration order (M1–M8 in `docs/migration-plan.md`). No production migration is
applied until the plan is approved.

## 2. Data model

Target schema in `docs/farm-product-data-model.md`:
- Split the current `Product` into `ProductDefinition` (reusable) + `FarmProductOffer`
  (farm-specific, sellable).
- Re-point `PackItem`, `Lot`, `OrderItem`, `Translation` at offers; preserve the composite
  FK pattern so `lot.farmId == offer.farmId` stays DB-enforced (mirror
  `prisma/migrations/20261109000000_lot_product_farm_composite_fk`).
- Add `DeliveryMethod/Zone`, `Pack`, `CycleOfferAvailability`, `FulfilmentGroup`,
  `Incident`, `WebsiteText`, `Setting`, `AnalyticsEvent`, `ChannelAttribution`.
- Enrich `ReservationCycle` and `Order`/`OrderItem` additively (nullable), preserving
  historical snapshots.

## 3. Admin shell & screens

Per `docs/admin-information-architecture.md`:
- Rebuild `src/app/admin/layout.tsx` as a left-nav shell with Spanish labels pulled from
  the i18n dictionaries; restyle the Tailwind theme to the warm palette + serif display.
- Each section is a route under `src/app/admin/*`; each page calls
  `requireAdmin`/`requirePlatformAdmin` then scopes data via `visibleFarmScope(user)`.
- Mutations are server actions in `src/lib/admin/*` that write an `AdminAudit` row — the
  existing pattern in `src/lib/admin/actions.ts` + `audit.ts`.
- Filters are URL-encoded so Overview action cards and metric drill-downs deep-link into
  filtered lists.

## 4. Metrics & analytics

Per `docs/analytics-dictionary.md`:
- Emit `AnalyticsEvent`s from public pages/flows (server-side where possible) honouring
  consent; store `ChannelAttribution` per session.
- Compute KPIs deterministically from orders + events + margin inputs; reuse the
  test-exclusion convention from `src/lib/ai/metrics.ts`. No AI ever computes a number.
- Charts: add a lightweight chart approach (decision pending Q5 in the pre-implementation
  response); each chart has an empty state + small-sample caveat.
- Farm-scope confidentiality enforced in the data loaders.

## 5. Public alignment

- Drive the cycle block and pack spec table from structured records; add a client
  countdown computed from the real `closeAt`/`closeDate` timestamp.
- Render the full traceability chain item-by-item from offer + lot snapshots.
- Audit and remove any hard-coded cycle strings found in phase 9 (Q6).

## 6. AI assistants

- Add an `AiAssistantRun`/decision table (extends the `AiRun` audit) capturing prompt
  version, model version, input refs, structured output, human decision (accept/edit/
  reject), and reason.
- Each assistant is a server-side use case behind a feature flag with a mock
  implementation; outputs pass the existing Zod + guardrail filter; none can approve,
  publish, price, or write traceability.

## 7. Security

- Keys stay in `.env`; settings UI exposes only presence booleans (existing `src/lib/ai`
  pattern). Offer/lot/pack/incident isolation enforced server-side and tested with Farm A
  / Farm B. New users default to `customer`.

## 8. Testing

Vitest (unit + real-SQLite integration) and Playwright e2e per `requirements.md` §5 and
the pre-implementation test plan. Migration verification queries (M2–M6 gates) run as
integration tests before any non-null/constraint step.
