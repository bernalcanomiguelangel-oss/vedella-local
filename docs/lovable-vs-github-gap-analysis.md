# Gap analysis: Lovable operating model vs current GitHub implementation

> Read-only analysis. No schema, migration, or seed changes were made to produce this
> document. Every claim below is grounded in the actual files in this repository at
> commit `2adc95d`. Where a fact could not be verified from the code it is marked
> **UNVERIFIED** and surfaced as a blocking question in
> `docs/pre-implementation-response.md` (section 12).

## 0. How to read this

"Lovable" refers to the original design/operating model the feedback prompt asks us to
match and improve. There is no second repository to import; **this repository is the
real one**. The prompt lists capabilities that existed in the original management
experience and asks which ones the current GitHub build is missing.

Legend: ✅ present · 🟡 partial · ❌ missing.

---

## 1. Public marketplace (customer-facing)

| Capability | State | Evidence |
| --- | --- | --- |
| Marketplace homepage listing approved+active farms | ✅ | `src/app/[locale]/page.tsx` → `listOfferedFarms()` in `src/lib/catalog.ts` filters `isApproved && isActive && !isTest`. |
| Per-farm page `/farms/[slug]` showing only that farm | ✅ | `src/app/[locale]/farms/[slug]/page.tsx` → `getFarmCatalog()`. |
| Search by farm/cut | ✅ | `src/app/api/search/route.ts` → `search()` in `catalog.ts`. |
| Basket with quantity discounts + delivery fee | ✅ | `src/components/Basket*`, `src/lib/pricing.ts` (tiers 3/5/8 → 2/3/5%, 600c delivery). |
| Reserve now / pay on delivery, no oversell | ✅ | `src/lib/reserve.ts` atomic `updateMany(freePlaces > 0)`; `PaymentGateway` seam in `src/lib/payment/gateway.ts`. |
| ca/es/en with switcher | ✅ | `src/lib/i18n/` dictionaries + `LanguageSwitcher.tsx`. |
| Traceability chain shown publicly | 🟡 | A single representative `lotReference` is surfaced per product/pack (`catalog.ts` `pickLotReference`). The full Farm→Lot→Cut→Package→Order chain is **not** rendered item-by-item; packs borrow one included cut's lot. |
| Cycle block (zone, close date, delivery date, remaining places, countdown) | 🟡→❌ | A cycle exists in the DB and seed, but the public cycle facts are **not** proven to be rendered dynamically with a live countdown from the actual `closeDate`. The seed hard-codes "Cicle novembre 2026" / 37 of 50. **UNVERIFIED** whether any page hard-codes November 2026 strings; must be audited in phase 9. |
| Same cut, different values per farm, shown distinctly | ❌ | Because a cut is a per-farm `Product` row there is no "definition" grouping; the public UI cannot group by canonical cut and then show each farm's distinct price/weight. See section 3. |

---

## 2. Admin / internal management panel

The feedback prompt lists **14** sidebar sections: Resumen, Métricas, Granjas, Productos y
packs, Lotes, Ciclos, Pedidos, Incidencias, Textos web, Usuarios y permisos, Revisión,
Registro de actividad, Ajustes, Cerrar sesión.

The current admin has **4** working sections plus login/denied.

| Prompt section (ES) | Current route | State |
| --- | --- | --- |
| Resumen (Overview) | `src/app/admin/page.tsx` | 🟡 4 summary cards, no action lists ("Needs review / farm response / fulfilment / data correction"), no drill-down to filtered records. |
| Métricas (Sales metrics) | `src/app/admin/metrics/page.tsx` | 🟡 Shows **weekly average market price per cut** only (`loadMetricsDashboard`). No sales/revenue/AOV/conversion/margin KPIs, no filters, no charts, no channel attribution. See section 4. |
| Granjas (Farms) | — | ❌ No farm CRUD/approve/assign-manager/diagnose-visibility screen. Farms are only rows in `records` + seeded. |
| Productos y packs (Products & packs) | — | ❌ No product/offer/pack management screen. |
| Lotes (Lots) | — | ❌ No lot management screen. |
| Ciclos (Cycles) | — | ❌ No cycle management screen (create/duplicate/allocate capacity/open-close). |
| Pedidos (Orders) | — | ❌ No orders screen, no status workflow, no fulfilment groups. |
| Incidencias (Incidents) | — | ❌ No incident model or screen at all. |
| Textos web (Website text) | — | ❌ No website-text CMS (draft/publish/preview per ca/es/en). |
| Usuarios y permisos (Users & assignments) | — | ❌ No user/role/farm-assignment management UI. |
| Revisión (Review queue) | `src/app/admin/review/page.tsx` | ✅ Human-only approve/reject of pending farms/products + AI translations. |
| Registro de actividad (Audit log) | — | 🟡 `AdminAudit` + `AiRun` tables are written, but there is **no UI** to browse them. |
| Ajustes (Settings) | — | ❌ No settings screen. |
| Cerrar sesión (Logout) | `admin/layout.tsx` | ✅ `logout` server action. |
| Records / lifecycle | `src/app/admin/records/page.tsx` | ✅ (not in the prompt list; a generic lifecycle grid) |
| Receipts (AI ingestion) | `src/app/admin/receipts/page.tsx` | ✅ (belongs under the "AI assistant / AI review history" idea) |

**Visual shell:** the prompt asks for warm cream background, dark-brown primary, golden
secondary, green operational accents, serif display type, left nav on desktop, collapsible
on mobile, with **Spanish** sidebar labels translated to ca/es/en. The current shell is a
**top horizontal nav** with **Catalan-only** labels and a pasture/beef palette (see
`admin/layout.tsx`, `tailwind.config`). This is a rebuild of the admin shell, not a tweak.

---

## 3. Product data model: the central structural gap

**The prompt's core correction:** a product name is NOT a global product shared by every
farm. `Entrecot · Farm A` and `Entrecot · Farm B` are the **same cut category** but
**different sellable offers** with different price/weight/thickness/maturation/packaging/
storage/shelf-life/lot/cycle.

**Current model (`prisma/schema.prisma`):** there is a single `Product` table with
`kind = "pack" | "cut"`, owned by one farm via a required `farmId`. There is **no
reusable definition layer**. Concretely:

- "Entrecot" is seeded **twice** as two independent `Product` rows, one per farm
  (`prisma/seed.ts` loops `FARMS` and recreates the same `CUTS` array). They share nothing
  but a coincidentally-equal `name` string.
- There is **no `category` / canonical cut concept**, so the platform cannot answer
  "show me Entrecot across all farms" without matching on a free-text name.
- Cut facts (`weight`, `thickness`, `maturation`, `packaging`, `shelfLife`) live directly
  on `Product`; there is no `internal_sku`, no `price_unit`, no min/max expected weight,
  no `weight_tolerance_percent`, no `units_per_pack`, no `storage_state`,
  no `minimum_shelf_life_days` (facts are free-text strings, e.g. `"10 dies en fred"`),
  no `delivery_method_ids`, no `pickup_available`, no per-cycle availability, no
  `archived_at`.
- Packs reference cuts via `PackItem(packProductId, cutProductId)` — both point at
  `Product` rows of the same farm, but there is **no explicit single-farm vs multi-farm
  pack concept** and **no item-level lot** on a pack item.

**Prompt's required two-level model:**

- **ProductDefinition** (reusable, NOT directly sellable): id, canonical name, category,
  general description, default prep, translation keys.
- **FarmProductOffer** (farm-specific, sellable): farm_id, product_definition_id,
  public_name, internal_sku, description, price_amount, price_unit, currency,
  expected_unit_weight_min/max_g, weight_tolerance_percent, units_per_pack, thickness_mm,
  maturation_days, packaging_method, storage_state, minimum_shelf_life_days,
  delivery_method_ids, pickup_available, cycle availability, approval_status, active,
  archived_at, timestamps.

**Delta:** today `Product` ≈ a conflation of *definition* + *offer* into one row. The
restoration must (a) extract a `ProductDefinition` layer, (b) turn `Product` cuts into
`FarmProductOffer` rows referencing a definition, and (c) re-point `PackItem`, `Lot`,
`OrderItem`, and `Translation` at offers. See `docs/farm-product-data-model.md` and
`docs/migration-plan.md`.

**Does definition-vs-offer already exist separately? No.** They are one table today.

---

## 4. Sales metrics & analytics

| Capability | State | Evidence / gap |
| --- | --- | --- |
| Weekly average market price per cut | ✅ | `src/lib/ai/metrics.ts` `computeWeeklyAverages` + `MarketPriceSnapshot`, test-excluding. |
| Sales KPIs (revenue, reservations, AOV, conversion, margin, delivery cost/order, fulfilment-to-promise, incident rate, weight variation, repeat purchase, next-cycle interest) | ❌ | None computed. `loadMetricsDashboard` returns only market price + raw counts. |
| Multi-farm cards (revenue/margin/reservations by farm, active farms, low-availability offers, orders awaiting confirmation, lots in current orders, % complete traceability) | ❌ | None. |
| Filters (cycle, dates, language, farm, product/pack, channel, delivery method, order status, real-vs-test) with URL state + reset + default-excludes-test | ❌ | No filter surface exists. |
| Charts (revenue over time, by pack/offer/farm, funnel, demand by language+delivery, by channel, product mix, delivery vs pickup by zone, incident trend, weight variation, capacity utilisation, repeat cohorts) | ❌ | No charting library installed (`package.json` deps: next/react/prisma/zod only). Metrics page renders tables. |
| Channel attribution (direct/organic/instagram/… + UTM + farm referral, first+latest touch, `unknown` default) | ❌ | No `channel`/`campaign`/attribution fields anywhere; `Order` has no attribution columns. |
| Analytics event model (session_started, …, next_cycle_interest_submitted, language_selected, delivery_mode_selected) with dimensions | ❌ | No event table, no event emission. Conversion/funnel/repeat metrics are therefore **impossible today** because visits/starts are never recorded. |
| Documented metric formulas (numerator/denominator/status-scope/time-scope/test-rule) | ❌ | Not documented. Provided now in `docs/analytics-dictionary.md`. |
| Farm-manager-scoped metrics vs platform aggregates | 🟡 | Scoping primitives exist (`visibleFarmScope`) but the metrics page itself is not scoped and has no per-farm confidentiality rule. |

---

## 5. Why the gaps exist (root causes)

- **Missing admin management experience:** the current spec (`.kiro/specs/vedella-multifarm-ai`)
  scoped the admin to exactly three AI use cases plus a review queue and a lifecycle grid
  (see its `requirements.md` R21–R26). The 14-section operational panel was simply never
  in scope; it was not removed, it was never built.
- **Missing sales metrics:** the only metric in scope was R25 "weekly average market price
  per cut." Revenue/conversion/funnel metrics require an **order attribution model and an
  analytics event stream** that the schema never defined, so they cannot be computed from
  current data.
- **Second farm not appearing (if observed):** **UNVERIFIED as a live bug.** The seed
  creates two approved+active farms and `listOfferedFarms` returns all approved+active
  non-test farms, so both *should* appear. A farm would be hidden if it were not
  `isApproved && isActive`, were `isTest`, or had no product with a usable
  (non-withdrawn, in-stock, non-test) lot. The most likely real-world cause is the
  **lack of a "diagnose public readiness" admin tool** (prompt section 6) so an operator
  cannot see *why* a farm is hidden. Listed as a blocking question.

---

## 6. AI layer

| Capability | State | Evidence |
| --- | --- | --- |
| Server-side, provider-abstracted, mock-by-default, offline | ✅ | `src/lib/ai/provider.ts`, `mock-provider.ts`, `openai-provider.ts` (lazy, flag+key gated). |
| Translation, weekly metrics, receipt extraction | ✅ | `translate.ts`, `metrics.ts`, `receipt.ts`. |
| Zod validation + guardrails (strip price/approval/role/status, flag WTP) + audit | ✅ | `schemas.ts`, `guardrails.ts`, `audit.ts` → `AiRun`. |
| Bounded in-panel assistants (farm profile, offer compare, traceability review, metrics analyst, cycle recommendation) with accept/edit/reject + decision reason + history | ❌ | Only the 3 batch use cases exist; no interactive assistant surfaces, no human-decision record, no per-assistant prompt-version UI. |

---

## 7. Permissions & tests

| Capability | State | Evidence |
| --- | --- | --- |
| Roles platform_admin / farm_manager / customer | ✅ | `src/lib/auth.ts`, `src/lib/admin/scope.ts`. |
| Server-side gating, farm-scoped loaders | ✅ | `requireAdmin`/`requirePlatformAdmin`/`getApiAdmin`, `visibleFarmScope`. |
| DB-level cross-farm isolation | 🟡 | Enforced for Lot↔Product via composite FK (R9). Offer-level isolation does not exist because offers do not exist yet. |
| Permissions matrix tested with Farm A + Farm B accounts | 🟡 | `tests/admin/scope.test.ts` covers scope logic; there is no test proving "Farm A manager cannot edit Farm B's Entrecot offer" because offers are not modelled. |
| Full test suite green | ✅ | 135 Vitest + 7 Playwright per `task.json` verification. |

---

## 8. Summary of what must be built (feeds the delivery sequence)

1. **Data model:** introduce `ProductDefinition` + `FarmProductOffer`; migrate `Product`
   cuts to offers; re-point `PackItem`/`Lot`/`OrderItem`/`Translation`; enrich `Cycle`,
   `Order`, `Pack`; add `Incident`, `WebsiteText`, `Setting`, `AnalyticsEvent`,
   `ChannelAttribution`, `DeliveryZone`, `FulfilmentGroup`.
2. **Admin shell:** rebuild as left-nav, 14 sections, Spanish labels translated ca/es/en,
   warm palette, serif display.
3. **Management screens:** Farms, Products & packs, Lots, Cycles, Orders, Incidents,
   Website text, Users & permissions, Audit log, Settings.
4. **Metrics:** event model, attribution, KPI/formula library, filters, charts,
   drill-downs, farm-scope confidentiality.
5. **Public alignment:** dynamic cycle facts, dynamic spec table from real pack
   composition, full dynamic traceability chain.
6. **Bounded AI assistants** behind flags with human decisions + history.
7. **Permissions matrix + acceptance tests** incl. Farm A / Farm B offer isolation.
