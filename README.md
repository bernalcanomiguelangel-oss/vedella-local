# Vedella Local

A multi-farm, traceable Catalan beef **marketplace**. Several approved farms list
their packs and individual cuts; customers browse, search, and **reserve now, pay on
delivery** within an active reservation cycle. The platform ships with a safe,
provider-abstracted AI layer that runs **fully offline** with a deterministic mock
provider.

> Prices are stored as integer cents. Catalan (`ca`) is the default language, with
> Spanish (`es`) and English (`en`) available.

## Stack

- **Next.js (App Router) + TypeScript**
- **Tailwind CSS** — warm pasture/beef palette
- **Prisma + SQLite** — zero external services; DB file at `prisma/dev.db`
- **Zod** — input and AI-output validation
- **Vitest** (unit/integration) + **Playwright** (e2e)

## Requirements

- Node.js 22+
- npm 11+

## Getting started

```bash
# 1. Install dependencies
npm install

# 2. Configure environment (defaults run fully offline with the mock AI provider)
cp .env.example .env

# 3. Create the SQLite database and generate the Prisma client
npx prisma db push

# 4. Seed two fantasy farms, packs, cuts, lots, and one active reservation cycle
npm run seed

# 5. Run the dev server
npm run dev
```

The app runs end-to-end with **no API key**. A real AI provider is only used when
`AI_API_KEY` is set *and* the relevant feature flag is enabled.

## Scripts

| Script             | Description                                      |
| ------------------ | ------------------------------------------------ |
| `npm run dev`      | Start the Next.js dev server                     |
| `npm run build`    | Generate the Prisma client and build the app     |
| `npm start`        | Start the production server                      |
| `npm run seed`     | Seed the database (`prisma/seed.ts`)             |
| `npm test`         | Run unit/integration tests (Vitest)              |
| `npm run test:e2e` | Run end-to-end tests (Playwright)                |

## Seeded data

Two approved + active fantasy farms (**Mas Vallgorguina**, **Cal Serrat del Bosc**),
each with:

- Three packs: `Pack A · Descoberta` (42,00 €), `Pack B · Graella` (79,00 €),
  `Pack C · Diari i cocció lenta` (58,00 €)
- Seven individual cuts (prices already include the +15% surcharge): Entrecot
  (14,38 €), Llom baix (12,65 €), Hamburguesa 2u (7,48 €), Carn picada (9,20 €),
  Galta (10,35 €), Carn per estofar (9,78 €), Brou d'os 1L (7,00 €)
- Pack items, valid lots with unique references, and one active cycle
  (`Cicle novembre 2026`, Vallès Oriental, 37/50 places free).

## Architecture

```
src/
  app/
    [locale]/            Public marketplace (ca default, es, en) — homepage, farm
                         pages, search, basket, reservation confirmation.
    admin/               Role-gated admin area: login (dev session), review queue,
                         records/lifecycle, metrics dashboard, receipt ingestion.
    api/
      ai/{translate,receipt,metrics}/  Server-side AI endpoints (admin-gated).
      reserve/           Public reservation endpoint (rate-limited).
      search/            Public search endpoint.
  lib/
    db.ts                Prisma client singleton.
    pricing.ts           Deterministic pricing (discount tiers, delivery fee,
                         +15% cut surcharge). No AI ever touches prices.
    i18n.ts              Locale dictionaries + approved-translation resolution.
    catalog.ts           Single source of truth for "what is publicly offered".
    reserve.ts           Atomic, no-oversell reservation logic + payment seam.
    rateLimit.ts         In-memory fixed-window limiter for the public reserve route.
    auth.ts              Server-side session + role gating (requireAdmin,
                         requirePlatformAdmin, getApiAdmin for route handlers).
    validateLot.ts       Shared traceability guard (R9–R12), used by seed + tests.
    payment/gateway.ts   PaymentGateway seam (pay-on-delivery; no provider wired).
    ai/                  Provider-abstracted AI layer (see below).
    admin/               Human-only lifecycle machine, gated server actions, audit.
prisma/                  schema.prisma, migrations (CHECK + composite-FK integrity),
                         seed.ts (two faithful fantasy farms).
tests/                   Vitest unit + integration (real SQLite).
e2e/                     Playwright flows (browse→reserve, admin approve, i18n,
                         receipt review, cycle-full / no-oversell).
```

### Integrity invariants

Traceability/data rules are enforced at the **database** layer wherever possible, with
a shared `validateLot()` guard as defence in depth:

- **R9** `lot.farmId == product.farmId` — enforced by a **composite foreign key**:
  `Product` has a `(id, farmId)` candidate key and `Lot.product` targets it, so the DB
  rejects any lot whose farm does not match its product (not only the guard).
- **R10** date ordering, **R12** units ≥ 0 — SQLite `CHECK` constraints.
- **R11** unique lot reference — unique index.
- **R18** no oversell — `freePlaces >= 0` CHECK + a single atomic conditional
  `updateMany` in `reserve()` (zero rows affected ⇒ `CYCLE_FULL`).

## AI layer

The AI layer is **server-side only** and goes through a single provider boundary
(`AiProvider`). Two implementations exist:

- **MockAiProvider** — deterministic, offline, zero-config. This is the default.
- A real, OpenAI-compatible provider — imported **lazily** and constructed **only**
  when `AI_API_KEY` is present *and* the relevant feature flag is on.

Three use cases, each with a safe mock fallback and a Zod-validated, audited output:

1. **Translation** — machine-translates product/farm/pack copy into `ca`/`es`/`en`.
   Output is stored as `machine` and **never auto-published**; a `platform_admin`
   approves it in the review queue before it surfaces. Re-running a field that a human
   already approved demotes it back to `machine` (unpublished) and **surfaces a
   warning** in the result/audit so it is never silently unpublished.
2. **Weekly metrics** — the average market price per cut per ISO week, computed
   **deterministically from the database** (test records excluded). The model only
   phrases a neutral headline; it can never change a number. The admin dashboard shows
   the current week by default and has a **week selector** for historical weeks.
3. **Receipt ingestion** — upload an image/PDF; the AI extracts structured lot/product
   fields to **pre-fill a human review form**. It creates no records and approves
   nothing; a human enters the price and submits to create a `pending_review` record.

### Feature flags

Per-use-case flags gate the real provider (the mock is always available as a fallback):

| Variable                  | Purpose                                  |
| ------------------------- | ---------------------------------------- |
| `AI_PROVIDER`             | `mock` (default) or a real provider name |
| `AI_API_KEY`              | Real provider key (empty ⇒ mock only)    |
| `AI_TRANSLATION_ENABLED`  | Enable the real translation provider     |
| `AI_METRICS_ENABLED`      | Enable the real metrics provider         |
| `AI_RECEIPT_ENABLED`      | Enable the real receipt provider         |

When a flag is off, the key is missing, or the model is unavailable, the layer falls
back to the mock / a no-op and never crashes.

## Security posture

- **Secrets:** API keys are read **only** from a git-ignored `.env`. `.env.example`
  carries placeholder names and no real values. A leaked key is treated as compromised
  and is never used, hardcoded, logged, or stored. The config reader exposes only a
  *presence boolean*, never the key value; the key is read solely inside the real
  provider at construction and used only as a request header.
- **Authorization:** all admin work goes through server actions and route handlers that
  re-authenticate on the server (`requireAdmin` / `requirePlatformAdmin` /
  `getApiAdmin`). The `/api/ai/*` endpoints require an admin role; `/api/reserve` is
  public (customers reserve without logging in) but **rate-limited per client** so a
  loop cannot anonymously drain a cycle. Approvals and publishing are **human-only**.
- **Prompt injection:** all uploaded documents and user text are treated as
  **untrusted data**. Untrusted content is fenced as data (never concatenated as
  instructions), and every AI response is re-validated with Zod and passed through a
  guardrail filter that strips any price/approval/role/status field at any depth and
  flags willingness-to-pay wording. Embedded instructions cannot change roles,
  permissions, approval state, prices, or behaviour. Every AI run is persisted as an
  audit record (use case, provider, model/version, flag state, outcome).

> Note on the guardrail filter: it strips any field named `status` (among
> price/approval/role patterns). Current schemas intentionally contain no such field; a
> future use case that needs a legitimate `status` field must rename it (see
> `src/lib/ai/guardrails.ts`).

## Payment

Reservation only: **pay on delivery / on the spot**. No payment provider is wired; a
clean `PaymentGateway` seam (`src/lib/payment/gateway.ts`) is kept so a real provider
can be added later without refactoring the reservation flow.
