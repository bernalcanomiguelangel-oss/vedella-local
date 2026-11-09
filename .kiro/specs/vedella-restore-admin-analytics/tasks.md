# Tasks: restore & improve the Vedella Local management platform

> Phased per feedback-prompt section 21. Each phase keeps the app building, seeding, and
> green; migrations advance only through the gated M1–M8 order in `docs/migration-plan.md`.
> **Status: all phases COMPLETE.** The blocking questions in
> `docs/pre-implementation-response.md` §12 were resolved by the user and Phases 2–12
> were implemented across FEAT-001 … FEAT-008, each keeping the app building, seeding and
> green. The migration set advanced through the full gated M1–M8 order.

## Phase 1 — Gap analysis & plan (docs)  ✅ done
Produce `docs/lovable-vs-github-gap-analysis.md`, `docs/admin-information-architecture.md`,
`docs/analytics-dictionary.md`, `docs/farm-product-data-model.md`,
`docs/migration-plan.md`, and the section-22 `docs/pre-implementation-response.md`. No
production data changed. STOP for review.

## Phase 2 — Admin shell + routes (feat)  ✅ done
Left-nav shell, 14 sections, Spanish labels translated ca/es/en, warm palette + serif
type, collapsible mobile. Server-side gating + scope on every route. No data model change.

## Phase 3 — Definition vs offer model (feat + migration M1–M3)  ✅ done
Add `ProductDefinition` + `FarmProductOffer` (additive); backfill definitions and offers
from existing `Product`, preserving legacy facts; flag uncertain rows for review.

## Phase 4 — Repair farm→offer→lot relationships (migration M4)  ✅ done
Re-point `Lot` to offers via composite FK; verify `lot.farmId == offer.farmId`; keep
legacy `productId` nullable for one release.

## Phase 5 — Management screens (feat)  ✅ done
Farms, Products & packs, Lots, Cycles, Orders — CRUD + lifecycle + farm scope; enrich
cycle/order models (M5–M6). Multi-farm fulfilment groups.

## Phase 6 — Analytics event model + dictionary (feat)  ✅ done
`AnalyticsEvent` + `ChannelAttribution` tables and emission; wire the dictionary formulas
into a metrics computation lib (deterministic, test-excluded, farm-scoped).

## Phase 7 — Dashboard cards/charts/filters/drill-downs (feat)  ✅ done
KPI + multi-farm cards, charts with empty/small-sample states, URL-encoded filters +
reset, drill-down to filtered lists.

## Phase 8 — Incidents / website-text / users / review / audit / settings (feat)  ✅ done
Remaining sections; browsable audit log; platform-only settings with no browser secrets.

## Phase 9 — Public alignment (feat)  ✅ done
Dynamic cycle facts + countdown, pack spec table from real composition, full item-level
traceability; audit and remove any hard-coded cycle strings.

## Phase 10 — Farm-manager restrictions + tests (feat)  ✅ done
Offer/lot/pack/incident isolation; permissions matrix tested with Farm A + Farm B.

## Phase 11 — Bounded AI assistants behind flags (feat)  ✅ done
Farm profile, offer compare, traceability review, metrics analyst, cycle recommendation;
each with prompt/model version, structured output, human accept/edit/reject + audit.

## Phase 12 — Full regression (chore)  ✅ done
Full unit + integration + e2e + build green; security regression; zero-config offline run;
final M7–M8 constraint/enable steps after all verification gates pass.
Result: Vitest 245 passing (33 files), Playwright 8 passing, `npm run build` green,
`npx tsc --noEmit` clean. M7 (`20261114000000_m7_indexes_constraints`) and M8
(`20261115000000_m8_lot_backing_guard`) migrations committed.
