# Current-state audit — Vedella Local (Session 8/9 hardening, Phase 1)

> Read-only audit. No code, schema, data, or production changes were made in this
> phase. Every claim below is grounded in a committed file; where something cannot
> be verified offline it is marked **Not verified offline**.
>
> Branch audited: `audit/session8-9-hardening` off `origin/main` at commit
> `bb1825e` (merge of PR #7). Network: offline (no Neon/Vercel/AI provider reachable).

## 1. Technology stack and versions

Source: `package.json`, `README.md`.

| Layer | Choice | Version (package.json) |
| --- | --- | --- |
| Framework | Next.js (App Router) | `next ^14.2.33` |
| Language | TypeScript | `typescript ^5.6.3` |
| UI | React | `react ^18.3.1` |
| Styling | Tailwind CSS | `tailwindcss ^3.4.14` |
| ORM | Prisma + Postgres (prod) / SQLite (test client) | `prisma`/`@prisma/client ^5.22.0` |
| Validation | Zod | `zod ^3.23.8` |
| Auth hashing | bcryptjs (pure JS, no native build) | `bcryptjs ^3.0.3` |
| Blob storage | `@vercel/blob` (lazy, prod only) | `^2.9.0` |
| Unit/integration tests | Vitest | `vitest ^2.1.4` |
| E2E tests | Playwright | `@playwright/test ^1.48.2` |
| Node engine | `>=22` | engines field |

Build scripts: `build` = `prisma generate && next build`; `vercel-build` =
`prisma generate && prisma migrate deploy && tsx prisma/seed.ts && next build`;
`test` = `vitest run` with a `pretest` that runs `prisma generate --schema
prisma/schema.test.prisma` (SQLite test client).

## 2. Public and admin routes

From `src/app/` and the `next build` route table.

**Public (`/[locale]`, locales ca/es/en):** homepage (marketplace), `/[locale]/farms/[slug]`
(single farm page), search, basket, reservation confirmation.

**API:** `/api/ai/translate`, `/api/ai/receipt`, `/api/ai/metrics` (admin-gated),
`/api/reserve` (public, rate-limited), `/api/search` (public).

**Admin (`/admin`, all server-rendered dynamic):** `/admin` (overview), `/admin/metrics`,
`/admin/farms`, `/admin/products`, `/admin/lots`, `/admin/cycles`, `/admin/orders`,
`/admin/incidents`, `/admin/website-text`, `/admin/users`, `/admin/review`, `/admin/audit`,
`/admin/settings`, `/admin/copy` (Copy A/B), `/admin/receipts`, `/admin/records`,
`/admin/login`, `/admin/change-password`, `/admin/denied`. The admin navigation set is
defined in `src/lib/admin/nav.ts` and covered by `tests/admin/nav.test.ts`.

## 3. Authentication implementation

Source: `src/lib/auth.ts`, `src/lib/admin/scope.ts`, `src/lib/password.ts`, `README.md`.

- Dev session: a seeded `User.id` stored in an httpOnly cookie (`vl_session`). No
  external auth provider is wired (per brief). `getCurrentUser()` always re-reads the
  DB, so a deleted/edited user loses access immediately.
- **Server-side gating only.** `requireAdmin()` (any admin role), `requireSession()`
  (change-password page), `requirePlatformAdmin()` (approvals/cross-farm), and
  `getApiAdmin()` (HTTP-edge, returns null instead of redirecting) all re-authenticate
  on the server. No client-only check is trusted.
- Passwords hashed with `bcryptjs`; never logged or returned. `mustChangePassword`
  forces the change-password flow before any admin page (`requireAdmin` redirects to
  `/admin/change-password`).
- **New users default to `customer`**; only a `platform_admin` can create users or
  assign `platform_admin` (`src/lib/admin/users-actions.ts`), each write audited.

Roles: `platform_admin`, `farm_manager`, `customer` (`scope.ts` `Role`).
Authorisation helpers (pure, unit-tested in `tests/admin/scope.test.ts`):
- `canActOnFarm(user, farmId)` — platform_admin: any farm; farm_manager: own farm only;
  customer: never.
- `visibleFarmScope(user)` — `null` = all (platform_admin); `[farmId]` = own; `[]` = none.

## 4. Database tables

Source: `prisma/schema.prisma` (33 models). Key models:

`User`, `Farm`, `FarmCertification`, `FarmProfileEdit`, `Product` (legacy),
`ProductDefinition` (non-sellable canonical cut), `FarmProductOffer` (sellable, farm-specific),
`PackItem` (legacy), `Pack` + `PackItemV2` + `PackFarmAcceptance` (V2 multi-farm packs),
`Lot`, `ReservationCycle` + `CycleFarm` + `CycleOfferAvailability`, `Order` +
`FulfilmentGroup` + `OrderItem`, `Translation`, `AiRun`, `AiAssistantDecision`,
`AdminAudit`, `AnalyticsEvent`, `ChannelAttribution`, `InterestedContact`, `Incident`,
`WebsiteText`, `Setting`, `MarketPriceSnapshot`, `CopyVariant`, `CopyExperiment`,
`JudgeRule`, `JudgeEvaluation`, `HumanDecisionExample`.

### Two-level product model (the "Entrecot Farm A vs Farm B" distinction)

- `ProductDefinition` (`schema.prisma:223`) is the platform-curated canonical cut
  ("Entrecot"). It is **not** directly sellable.
- `FarmProductOffer` (`schema.prisma:243`) is the farm-specific sellable listing:
  non-null `farmId`, its own `priceAmountCents`, `priceUnit`, weights, thickness,
  maturation, packaging, `storageState` (chilled/frozen), `minimumShelfLifeDays`,
  `pickupAvailable`, lifecycle flags. Two farms offering the same definition are two
  separate offer rows with independent commercial conditions.

## 5. Migrations, foreign keys, constraints

Source: `prisma/migrations/`. Provider lock: `migration_lock.toml` = `postgresql`.

Committed migrations:
- `0000000000000_init_postgres/migration.sql` — consolidated Postgres init.
- `20261116000000_add_copy_ab_judge`, `20261116010000_add_analytics_copy_variant`,
  `20261116020000_add_human_decision_copy_variant_id` — additive copy/AB tables.

**Composite foreign keys (DB-level farm/offer match):**
- `Product_id_farmId_key` unique index (`migration.sql:565`) + `Lot_productId_farmId_fkey`
  `FOREIGN KEY ("productId","farmId") REFERENCES "Product"("id","farmId")` (`:808`).
  Enforces `lot.farmId == product.farmId` (R9) at the DB, not only in the guard.
- `FarmProductOffer_id_farmId_key` unique index (`:580`) + `Lot_farmProductOfferId_farmId_fkey`
  `FOREIGN KEY ("farmProductOfferId","farmId") REFERENCES "FarmProductOffer"("id","farmId")`
  (`:811`). Enforces `lot.farmId == offer.farmId` under the two-level model.

**CHECK constraints (`migration.sql:850-888`):**
- `Product_basePriceCents_nonneg` — `basePriceCents >= 0`.
- `OrderItem_quantity_positive` — `quantity >= 1`.
- `Lot_units_nonneg` — `units >= 0` (R12).
- `Lot_date_order` — `slaughterDate <= cuttingDate <= packingDate < expiryDate` (R10).
- `Lot_backed_by_product_or_offer` — `productId IS NOT NULL OR farmProductOfferId IS NOT NULL`
  (M8 backing guard; a lot must point at a legacy product or an offer, never both null).
- `ReservationCycle_places_valid` — `freePlaces >= 0 AND totalPlaces >= 0 AND
  freePlaces <= totalPlaces` (R18 no-oversell).

**Unique:** `Lot_reference_key` (`:610`, R11 unique lot reference), `Incident_reference_key`,
`Farm.slug`, `User.email`, `ProductDefinition.translationKey`.

### SQLite test harness mirrors these

`tests/helpers/testDb.ts` reproduces the CHECK constraints + composite FKs for the
SQLite client so the offline suite enforces the same invariants. `src/lib/db.ts` loads
the SQLite test client (`node_modules/.prisma-test/client`) only when `process.env.VITEST`
is set, via a non-analyzable `eval("require")` so the Vercel (Postgres) build never
resolves it.

## 6. RLS / storage policy posture

- **No Postgres Row-Level Security policies** are defined (none in the migrations).
  Access control is enforced in the **application layer**: server actions and route
  handlers re-authenticate (`requireAdmin`/`requirePlatformAdmin`/`getApiAdmin`) and
  data loaders apply `offerScopeWhere` / `visibleFarmScope` so a `farm_manager` only
  ever queries their own farm. This is a deliberate architecture, stated accurately
  here: isolation rests on app-layer scoping + the composite FKs, not on DB RLS.
- **Storage policy:** image uploads go through `src/lib/media-storage.ts`. Backend is
  chosen by `BLOB_READ_WRITE_TOKEN`: local filesystem (`public/uploads`, git-ignored)
  offline, Vercel Blob in production (lazy import). DB stores only the path/URL, never
  bytes. Upload validation (`src/lib/media.ts`): jpg/png/webp only (extension + magic
  bytes), 5 MB max, randomised sanitised filename, path-traversal rejected, farm-scoped
  approval via `MEDIA_REQUIRES_APPROVAL` (default true → `pending*` field until a
  platform_admin promotes it).

## 7. Roles and lifecycle

Lifecycle machine: `src/lib/admin/lifecycle.ts`. States: `draft`, `pending_review`,
`approved`, `active`, `inactive`, `rejected`, `archived`.
- **Approval is separate from active.** `flagsForState`: `approved` → `isApproved=true,
  isActive=false`; `active` → both true; `inactive` → `isApproved=true, isActive=false`
  (distinct from `draft`, which is `isApproved=false`). Covered by `tests/admin/lifecycle.test.ts`.
- Transitions are explicit; `-> approved` only from `pending_review`; `-> active` only
  from `approved`/`inactive`. Illegal jumps throw `LifecycleError`.
- Human-only: these functions require a `SessionUser` and write an `AdminAudit` row; the
  AI layer never imports this module.

## 8. Existing tests inventory

**Vitest: 45 files, 332 tests** (see `docs/test-baseline.md` for the run). Grouped:

- Integrity/data model: `integration/integrity.test.ts` (16), `integration/product-model.test.ts`
  (16), `validateLot.test.ts` (10), `integration/offer-isolation.test.ts` (9),
  `integration/multifarm-pack.test.ts` (4), `integration/order-backfill.test.ts` (1).
- Catalog / public: `integration/catalog.test.ts` (9), `integration/public-dynamic.test.ts` (7),
  `i18n.test.ts` (11), `image-display.test.ts` (10).
- Reservation: `integration/reserve.test.ts` (6, includes no-oversell + closed/absent cycle).
- Pricing: `pricing.test.ts` (12).
- Admin / scope / lifecycle: `admin/scope.test.ts` (7), `admin/lifecycle.test.ts` (13),
  `admin/nav.test.ts` (10), `admin/core.integration.test.ts` (9), `admin/chart-series.test.ts` (6).
- Metrics / analytics: `integration/metrics-tiers.test.ts` (8), `integration/analytics.test.ts` (8),
  `admin/copy-ab-metrics.test.ts` (5), `ab-serving.test.ts` (4).
- Auth / API: `api/auth.test.ts` (6), `api/auth-gate.test.ts` (6), `api/auth-password.test.ts` (8),
  `api/rateLimit.test.ts` (6).
- AI layer: `ai/guardrails.test.ts` (7), `ai/integration.test.ts` (5), `ai/assistants.test.ts` (8),
  `ai/copy-ab.test.ts` (12), `ai/copy-mock.test.ts` (6), `ai/copy-prompts.test.ts` (3),
  `ai/gemini-provider.test.ts` (12), `ai/gemini-audit.test.ts` (2), `ai/provider.test.ts` (8),
  `ai/mock-provider.test.ts` (3), `ai/sanitize.test.ts` (6), `ai/schemas.test.ts` (8).
- Media: `media-storage.test.ts` (6), `media-fs.test.ts` (3), `media-upload-action.test.ts` (1),
  `integration/media-upload.test.ts` (15).
- Other integration: `integration/cert-approval.test.ts` (4), `integration/incident.test.ts` (6),
  `integration/settings-secrets.test.ts` (4), `integration/website-text-guardrail.test.ts` (6).

**Playwright: 9 specs / 7 files** (`admin-approve`, `browse-reserve`, `copy-ab`,
`cycle-full`, `forced-password-change`, `language-switch`, `receipt-review`). Cannot run
offline — see §12 and `docs/test-baseline.md`.

## 9. Analytics events

Source: `src/lib/analytics*.ts`, `schema.prisma` `AnalyticsEvent`/`ChannelAttribution`/
`InterestedContact`.
- Opaque cookie session id `vl_anon` keys each `AnalyticsEvent`; `customerId` attached only
  for a signed-in/opt-in customer. No identifying free-text.
- Event types used in metrics: `reservation_started`, `reservation_completed`,
  `next_cycle_interest_submitted`, `session_started`.
- `ChannelAttribution`: first/latest-touch channel (closed set; `unknown` stored, never
  guessed), UTM params, optional farm referral code.
- `InterestedContact`: opt-in emails only (no marketing automation).
- Every event carries `isTest` so test traffic is excluded from production figures.

## 10. Metric formulas (as implemented)

Source: `src/lib/admin/analytics-metrics.ts` and `src/lib/admin/metrics-data.ts`.

Global rules: test records excluded by default (`isTest=false` unless `includeTest`);
a metric on `< 20` qualifying rows is flagged `sampleTooSmall` (`SMALL_SAMPLE_THRESHOLD`);
farm scope — a `farm_manager` sees only their farm, a `platform_admin` drilling into a farm
sees the identical number; platform aggregates never expose another farm's line items.
Status scopes: `CONFIRMED_STATUSES = [confirmed, fulfilling, fulfilled]`,
`RESERVATION_STATUSES = [reserved, confirmed, fulfilling, fulfilled]`.

| KPI | Numerator | Denominator | Status scope | Test rule |
| --- | --- | --- | --- | --- |
| Recorded revenue | Σ `order.totalCents` | — | confirmed | excluded |
| Reservations | count of orders | — | reservation | excluded |
| AOV | revenueCents | confirmed order count | confirmed | excluded |
| Conversion | `reservation_completed` events | `reservation_started` events | event-based | excluded |
| Delivery cost/order | Σ `deliveryFeeCents` | confirmed order count | confirmed | excluded |
| Repeat purchase | customers with ≥2 orders | customers with ≥1 order | confirmed | excluded |
| Interest next cycle | `next_cycle_interest_submitted` events | unique `session_started` sessions | event-based | excluded |

Division-by-zero is guarded everywhere (e.g. `started > 0 ? completed/started : 0`).
Multi-farm revenue-by-farm uses each farm's `FulfilmentGroup` subtotal slice, never another
farm's line items. **There is no margin/cost card anywhere** (cost is internal; decision 2).
The weekly average market price per cut (`metrics-data.ts` + `ai/metrics.ts`) is computed
deterministically from the DB with test records excluded; the AI only phrases a neutral headline.

## 11. Homepage and farm-page data source

Source: `src/lib/catalog.ts`.
- **Homepage:** `listOfferedFarms()` → `prisma.farm.findMany({ where: { isApproved:true,
  isActive:true, isTest:false } })`. Only approved + active + non-test farms appear.
- **Farm page `/[locale]/farms/[slug]`:** `getFarmCatalog(slug)`. With
  `PUBLIC_OFFER_MODEL_ENABLED` default ON, reads from `FarmProductOffer` +
  `ProductDefinition` (`getFarmCatalogFromOffers`), filtered to that farm's approved +
  active + non-test + non-archived offers, each backed by a non-withdrawn, non-test,
  in-stock lot (R13/R15). Falls back to the legacy `Product` path for a farm with no
  offers (kept readable). A transitional union still surfaces a human-approved
  legacy-Product-only cut (seeded "Secret de vedella") so nothing a human approved vanishes.
- **Cycle facts:** `getActiveCycleFacts()` reads every value from the `ReservationCycle`
  row — nothing hard-coded.

## 12. Product and lot forms; lifecycle fields

- Offer create/edit: `src/lib/admin/manage.ts` (`applyOfferCreate`, `applyOfferSelfEdit`).
  A new offer by a farm_manager lands in `pending_review` (not live); a self-edit of own
  price + units applies live without review and does not change lifecycle.
- Lot create: `applyLotCreate` (manage.ts) + shared guard `src/lib/validateLot.ts`
  (R9 farm/offer match, R10 date order, R11 unique reference, R12 units ≥ 0), enforced in
  addition to the DB FKs/CHECKs.
- Lifecycle fields on records: `lifecycle` (string enum), `isApproved`, `isActive`,
  `isTest`; offers additionally carry `archivedAt`; lots carry `isWithdrawn`.

## 13. Existing AI integrations

Source: `src/lib/ai/*`. Server-side only, single `AiProvider` boundary (`provider.ts`).
- Providers: `MockAiProvider` (default, deterministic, offline), `GeminiProvider`
  (free `gemini-1.5-flash`, lazy + flag + key gated), `OpenAIProvider` (OpenAI-compatible).
- Use cases: translation (stored `machine`, human-approved before publish), weekly metrics
  (deterministic numbers, AI phrases only), receipt ingestion (pre-fills a human review
  form, creates nothing), five bounded in-panel assistants (`assistants.ts`), Copy A/B +
  LLM-as-judge (`copy-proposer.ts`, `copy-judge.ts`).
- Guardrails (`guardrails.ts`): `applyGuardrails` deep-strips any price/approval/role/
  lifecycle/`status` field at any depth and flags WTP-proxy wording; `enforceEvidence`
  forces `needs-evidence` on unsourced claims. Every run writes an `AiRun` audit row.
- Untrusted-text handling (`sanitize.ts`): `wrapUntrusted` fences content as DATA;
  `looksLikeInjection` flags injection phrasing. Covered by `ai/sanitize.test.ts`,
  `ai/integration.test.ts`, `ai/assistants.test.ts`, `ai/copy-ab.test.ts`.

## 14. Hard-coded public content audit

- The public catalog, farm pages, search, and cycle facts all read from the database
  (`catalog.ts`); no prices/weights/capacity/dates are hard-coded on public pages.
- `WebsiteText` holds **generic copy only**: `detectOperationalFact` rejects any
  price/weight/capacity/date/lot-code and refuses to store or publish it
  (`src/lib/admin/website-text.ts`, covered by `integration/website-text-guardrail.test.ts`).
- The one deliberate exception is the fixed Catalan UI dictionary (`src/lib/i18n`), which
  is UI chrome, not product/farm/cycle/traceability data.

## 15. Current security controls (summary)

- Secrets read only from git-ignored `.env`; `.env.example` has placeholder names and empty
  secret values (verified `git check-ignore .env` → ignored, `git ls-files .env` → not tracked).
  The committed `.env` holds only `DATABASE_URL="file:./dev.db"` and `AI_PROVIDER="mock"`
  with empty keys. Config exposes a presence boolean only, never the key value.
- Authorization server-side on every admin action and API route; approvals/publishing
  human-only; `/api/reserve` public but rate-limited (`rateLimit.ts`).
- Prompt-injection defence: untrusted text fenced as data, Zod re-validation + guardrail
  filter on every AI response, full `AiRun` audit.
- Farm-to-farm isolation enforced in app scope + DB composite FKs (see
  `docs/security-regression-plan.md` for the persona matrix and test mapping).

## Known limitations observed in Phase 1

1. **No automated medical/unsupported-claim detector on the offer/product `description`
   field.** A medical claim typed by a human into an offer description is not string-blocked
   at write time; the safety net is that a new/edited offer enters `pending_review` and
   cannot be public without human approval (brief Case 13 accepts "non-public draft / enters
   human review"). The AI copy-judge path *does* FAIL medical/nutrition wording
   (`mock-provider.ts` forbidden-keywords, `copy-prompts.ts`), but that governs AI-proposed
   copy, not a hand-typed description. This is the clearest candidate gap for Phase 2.
2. **E2E cannot run offline** (committed Postgres schema vs SQLite `.env`, no Postgres) —
   quantified in `docs/test-baseline.md`.
3. **Live-DB data-quality checks** (duplicate lot refs / orphan rows in the actual Neon
   production data) cannot be verified offline — see `docs/data-quality-audit.md`.
