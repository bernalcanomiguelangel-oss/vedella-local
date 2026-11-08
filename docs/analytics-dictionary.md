# Analytics dictionary

> Definitions for the restored Sales Metrics surface and the event model that feeds it.
> Grounded in the current data model (`prisma/schema.prisma`) and the feedback prompt
> sections 5, 15, 16. The event model and most KPIs **cannot be computed from current
> data** because no analytics events, channel attribution, margin inputs, or order
> status history exist yet. This document defines what must be captured.

## 1. Global rules

- **Test-data rule:** the default view **excludes** records where `isTest = true` at any
  level (farm, offer, lot, cycle, order, event). A "real vs test" filter can include test
  data explicitly. This extends the existing R15 convention already applied in
  `src/lib/ai/metrics.ts` and `src/lib/admin/metrics-data.ts`.
- **Default time/cycle scope:** current (or latest) cycle, with date-range override.
- **Status scope:** each metric names which order statuses count (see §3).
- **Farm scope:** a `farm_manager` sees only own-farm data. Platform aggregates must not
  reveal one farm's confidential per-record detail to another (prompt section 16): show
  totals/averages, not another farm's line items.
- **Small-sample caveat:** any metric computed on < 20 qualifying rows is flagged
  "sample too small"; charts show an empty state rather than a misleading line.
- **URL state:** every filter is URL-encoded; a reset returns to defaults.

## 2. Analytics event model

A new `AnalyticsEvent` table (see `docs/farm-product-data-model.md`). Events:

| Event | When |
| --- | --- |
| `session_started` | first request of an anonymous session |
| `farm_list_viewed` | homepage/marketplace list rendered |
| `farm_viewed` | `/farms/[slug]` rendered |
| `product_definition_viewed` | a canonical cut view |
| `farm_offer_viewed` | a specific farm offer view |
| `pack_viewed` | a pack view |
| `cycle_viewed` | cycle block view |
| `pack_selected` | pack added to basket |
| `offer_selected` | offer added to basket |
| `reservation_started` | reservation flow begun |
| `reservation_validation_failed` | server rejected a reservation attempt |
| `reservation_completed` | order created |
| `order_confirmed` | farm/platform confirmed |
| `order_fulfilled` | delivered/picked up |
| `next_cycle_interest_submitted` | "notify me next cycle" |
| `language_selected` | locale switch |
| `delivery_mode_selected` | delivery vs pickup chosen |

**Dimensions on each event:** anon session id, customer id (only when permitted by
consent), farm id, definition id, offer id, pack id, cycle id, language, delivery method,
channel, campaign, test flag, timestamp. Avoid unnecessary PII — never store free-text
that could identify a person beyond the opt-in customer id.

## 3. KPI definitions

Format: **numerator / denominator · status scope · time scope · test rule**.

| KPI | Definition |
| --- | --- |
| Recorded revenue | Σ `order.totalCents` / — · confirmed→fulfilled · selected range · exclude test |
| Reservations | count(orders) / — · pending→fulfilled · range · exclude test |
| AOV (avg order value) | Σ revenue / count(orders) · confirmed→fulfilled · range · exclude test |
| Conversion | count(`reservation_completed`) / count(`reservation_started`) · event-based · range · exclude test |
| Contribution margin / order | Σ(revenue − cost inputs) / count(orders) · fulfilled · range · exclude test. **Requires cost inputs** (offer cost, delivery cost) not in current schema. |
| Total contribution margin | Σ(revenue − cost inputs) · fulfilled · range · exclude test |
| Delivery cost / order | Σ `order.deliveryFeeCents` / count(orders) · confirmed→fulfilled · range · exclude test |
| Fulfilment according to promise | count(orders fulfilled by promised date within promised offer spec) / count(orders fulfilled) · fulfilled · range · exclude test. **Requires promised-date + actual-date capture.** |
| Incident rate | count(orders with ≥1 linked incident) / count(orders) · all · range · exclude test. **Requires Incident model.** |
| Avg weight variation | avg(`actual_weight − expected_weight`) / expected_weight · fulfilled · range · exclude test. **Requires actual-weight capture at fulfilment.** |
| Repeat purchase | count(customers with ≥2 orders across cycles) / count(customers with ≥1 order) · confirmed→fulfilled · all-time or range · exclude test |
| Interest next cycle | count(`next_cycle_interest_submitted`) / count(unique sessions) · event-based · range · exclude test |

**Multi-farm cards:** revenue by farm, margin by farm, reservations by farm, active farms,
low-availability offers (offers with no eligible lot in current cycle), orders awaiting
farm confirmation, lots used in current orders, % orders with complete traceability
(all items have farm+lot+offer snapshot).

## 4. Charts

Revenue over time; sales by pack/offer/farm; conversion funnel
(visits → reservation_started → reservation_completed → order_confirmed → order_fulfilled);
demand by language + delivery method; reservations by channel; revenue + reservations by
farm; product mix by farm; delivery vs pickup by zone; incident trend; promised-vs-actual
weight variation; cycle capacity utilisation; repeat cohorts. Each has an empty state and
a small-sample caveat. **No charting library is installed today** (`package.json`); one
must be added, or charts rendered as server-side SVG.

## 5. Channel attribution

Explicit channel values (closed set): `direct`, `organic_search`, `instagram`,
`facebook`, `whatsapp`, `email`, `farm_referral`, `butcher_referral`, `food_group`,
`paid_social`, `qr_code`, `event`, `other`, `unknown`.

Capture **first-touch** and **latest-touch** channel, UTM parameters, and an optional
**farm referral code**. When the channel cannot be determined, store `unknown` — never
guess. A `ChannelAttribution` record links to the session and the resulting order.

## 6. Drill-down

Every KPI card, chart segment, and multi-farm card links to the corresponding
pre-filtered record list (orders/offers/lots) via URL-encoded filters, so a number is
always traceable to the exact rows behind it.

## 7. Gaps that block specific metrics (surfaced to the pre-implementation response)

- Conversion / funnel / interest-next-cycle: need the `AnalyticsEvent` stream (none today).
- Contribution margin: needs per-offer cost + delivery cost inputs (none today).
- Fulfilment-to-promise + weight variation: need promised vs actual dates/weights captured
  on the order at fulfilment (none today).
- Channel breakdowns: need `ChannelAttribution` (none today).
