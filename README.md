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
- **Prisma + PostgreSQL**. PostgreSQL in production (Neon). The automated test
  suite runs on a local **SQLite test client** for zero-config offline testing.
- **Zod** — input and AI-output validation
- **Vitest** (unit/integration) + **Playwright** (e2e)

## Requirements

- Node.js 22+
- npm 11+

## Getting started

```bash
# 1. Install dependencies
npm install

# 2. Configure environment (the AI layer runs fully offline with the mock provider)
cp .env.example .env
#    The committed schema is Postgres, so set DATABASE_URL (pooled) and DIRECT_URL
#    (direct) to a Postgres/Neon connection string. A free Neon dev branch works;
#    paste both strings into your git-ignored .env. See docs/deploy-vercel-neon.md.

# 3. Apply the committed migrations and generate the client
#    (migrations under prisma/migrations/ are the source of truth).
npx prisma migrate deploy        # apply migrations to an existing/empty DB

# 4. Seed two fantasy farms, packs, cuts, lots, and one active reservation cycle
npm run seed

# 5. Run the dev server
npm run dev
```

> **Hosting.** To put the app online for free (Vercel + Neon Postgres), follow the
> step-by-step guide in [`docs/deploy-vercel-neon.md`](docs/deploy-vercel-neon.md).
> On Vercel the `vercel-build` script runs `prisma migrate deploy` and then the seed
> (`tsx prisma/seed.ts`) before `next build`, so the first deploy creates the schema
> AND the demo data (admin `miguel@admin.com` plus the two example farms) with no
> manual step. The seed is idempotent, so redeploys are safe no-ops that never
> duplicate or wipe data; a manual re-seed (`npm run seed`) is only needed in the
> rare case you want to seed a database by hand. The automated test suite needs no
> Postgres: it runs on a local SQLite test client (`npm test`), fully offline with
> zero setup.

The app runs end-to-end with **no API key**. A real AI provider is only used when
a key (`AI_API_KEY` or `GEMINI_API_KEY`) is set *and* the relevant feature flag is
enabled. The easiest real option is the **free** Google Gemini `gemini-1.5-flash`
model (`AI_PROVIDER="gemini"` + `GEMINI_API_KEY`).

> **Migrations are authoritative.** Schema changes ship as committed SQL under
> `prisma/migrations/` (applied with `migrate deploy` / `migrate reset`), not
> `prisma db push`. The migration set follows a safe additive plan
> (`docs/migration-plan.md`, phases M1–M8): add nullable columns/new tables →
> backfill → verify → add indexes/constraints (**M7**) → add the guarded
> non-null/backing invariants and switch the public read path to the offer model
> (**M8**). The legacy `Product` table and `Lot.productId` are kept **readable**;
> destructive cleanup is deferred.

### Where a real AI provider key goes

Paste a real key **only** into the git-ignored `.env` (locally) or the Vercel
project environment variables — never into the chat or the code. For the free
Gemini option, put the key in `GEMINI_API_KEY` and set `AI_PROVIDER="gemini"`; for
an OpenAI-compatible endpoint use `AI_API_KEY` and `AI_PROVIDER="openai"`. Then
turn on the specific feature flag(s) you want (see the table below). The admin
**Settings** page and each in-panel assistant show this as a **presence-only**
indicator (`hasApiKey=true/false` and the accepted env-var names
`AI_API_KEY or GEMINI_API_KEY`) — the key value is never read into the browser,
logged, or stored in the database. With both keys empty, everything falls back to
the deterministic **MockAiProvider** so the demo runs fully offline with zero
configuration.

## Authentication & passwords

Admin access uses real **email + password** login. Passwords are stored only as
salted hashes and are never logged or returned.

- **Hashing library: [`bcryptjs`](https://www.npmjs.com/package/bcryptjs).** It is
  a pure-JavaScript bcrypt implementation, so it installs from npm with **no
  native build step** and works offline. This matters because the project must
  build and test without a guaranteed native-compile toolchain or external
  network access; native bindings such as `bcrypt`/`argon2` were avoided for that
  reason. Hashing lives in `src/lib/password.ts` (`hashPassword`,
  `verifyPassword`, `validatePasswordPolicy`).
- **Main admin.** The seed creates `miguel@admin.com` as a `platform_admin` with a
  **temporary** password and `mustChangePassword=true`, so the account is forced
  through the change-password flow before any admin page is reachable. The
  temporary value is read from `SEED_ADMIN_TEMP_PASSWORD` (see `.env.example`),
  falling back to a documented **non-secret** development default. No real
  password is ever hardcoded or logged.
- **Forced change on first login.** Every seeded identity starts with
  `mustChangePassword=true`; `requireAdmin` redirects such a user to
  `/admin/change-password` until they set their own password.
- **New users default to `customer`** and are never auto-promoted; only a
  `platform_admin` can create users or assign the `platform_admin` role
  (`src/lib/admin/users-actions.ts`), and every such action is written to the
  `AdminAudit` log.

## Analytics & charts

Anonymous visitor tracking (no unnecessary PII) feeds the admin **Metrics**
dashboard. An opaque, cookie-based session id (`vl_anon`, no identifying
free-text) keys every `AnalyticsEvent`; a `customerId` is attached only when an
opt-in/signed-in customer is present. `ChannelAttribution` captures first- and
latest-touch channel (closed set — `unknown` is stored, never guessed), UTM
params and an optional farm referral code. A notify-me form captures opt-in
emails into `InterestedContact` (no marketing automation).

Metrics are **two-tier**: a `farm_manager` sees only their own farm's numbers;
a `platform_admin` sees platform-wide aggregates and can drill into any single
farm. There are **no margin/cost cards anywhere** (cost is internal). Test
records are excluded by default; any metric on fewer than 20 qualifying rows is
flagged "sample too small". Filters are URL-encoded with a reset.

**Charting choice:** charts are **server-rendered SVG** (`BarChart`,
`chart-series.ts`) with **no charting dependency**. The build is assumed to have
no reliable network, so a dependency-free, deterministic SVG render keeps the
dashboard working fully offline. Each chart has an empty state and a
small-sample caveat.

## Image uploads

Farms illustrate their catalogue with real photos. Uploads go through a small
storage seam (`src/lib/media-storage.ts`) with two backends, selected at
runtime, so the same code path works locally and on Vercel.

**Who can upload.** A `farm_manager` uploads images for their **own** product
offers and for their **own** farm profile (hero image plus gallery). A
`platform_admin` may manage media for **any** farm. Farm-to-farm isolation is
enforced server-side, the same way the rest of the admin area is.

**Where files live (two backends).** The backend is chosen by the presence of
the `BLOB_READ_WRITE_TOKEN` environment variable:

- **Local / offline (no token).** Uploads are **real local files** written to the
  git-ignored uploads directory `public/uploads` (see `.gitignore`), served as
  static assets. The DB stores **only** the relative path (for example
  `/uploads/<random>.jpg`). The directory is created on demand, so the app works
  offline with zero configuration. This is also what the tests use.
- **Production on Vercel (token set).** The serverless filesystem is
  read-only/ephemeral, so writes go to **Vercel Blob** instead. The
  `@vercel/blob` package is imported **lazily** only when a token is present, and
  the DB stores the returned `https://<id>.public.blob.vercel-storage.com/...`
  URL. The token is read only from the environment and is never logged. See
  `docs/deploy-vercel-neon.md` for how to enable the Blob store.

In both cases the stored ref is the only thing persisted (never the image
bytes), and only `/uploads/...` paths and `*.blob.vercel-storage.com` https URLs
are ever rendered on the public marketplace (`isPublicImageRef` in
`src/lib/image-display.ts`); any other host or scheme falls back to the gradient.

**Failing safely.** If storage is unavailable (for example the Vercel FS rejects
the write, or Blob errors), the upload action catches the error, best-effort
cleans up any partial object, and returns a friendly, handled message to the
admin/farm UI. It never throws an unhandled error that would crash the page.

**Untrusted-file handling.** Every upload is treated as untrusted
(`src/lib/media.ts`):

- Allowed types are **jpg/jpeg, png, and webp only**, validated by **both** the
  file extension **and** magic-byte sniffing of the buffer header. The
  client-supplied `Content-Type` is never trusted, and a file whose extension
  disagrees with its real content is rejected.
- Maximum size is **5 MB** (`MAX_IMAGE_BYTES`).
- The stored filename is **randomised and sanitised** (no path separators, no
  `..`, canonical safe extension), and the writer re-resolves the final path and
  refuses to write anything outside the uploads directory, so a crafted filename
  can never escape it (path traversal rejected). File contents are never logged.

**The single approval switch.** Farm media follows the same approval rule as
certifications and profile edits. The policy lives in exactly one place, the
constant `MEDIA_REQUIRES_APPROVAL` in `src/lib/media.ts`:

- **Default is `true`.** A farm-uploaded image is **submitted** (written to a
  `pending*` field) and becomes public only after a `platform_admin` approves it
  (the value is then promoted to the public field).
- To **auto-publish** uploads instead, flip `MEDIA_REQUIRES_APPROVAL` to
  `false`. That one-line change makes farm uploads write straight to the public
  field with no review. Every upload/approval path reads this constant, so no
  other code needs to change.

The schema change ships as the additive migration
`20261109111946_add_media_image_refs`, which adds the public media fields plus
the new `pending*` columns: `pendingHeroImageRef` and `pendingGalleryRefs` on the
farm profile and `pendingImageRef` on each product offer.

## Traceability placement and aesthetics

Traceability now renders **per product/offer**, inside each product card, rather
than as a single farm-wide list on the farm page. Each card shows that specific
product's Granja -> Lot -> Tall (-> Paquet) chain resolved from the lots that
actually back the offer, so provenance sits next to the product it describes.

For the visual benchmark against well-regarded competitors and the aesthetic
inspector findings, see [`docs/aesthetic-review.md`](docs/aesthetic-review.md).

## Scripts

| Script                         | Description                                          |
| ------------------------------ | ---------------------------------------------------- |
| `npm run dev`               | Start the Next.js dev server                           |
| `npm run build`             | Generate the Prisma client and build the app           |
| `npm run vercel-build`      | Production build: generate client, apply migrations, build |
| `npm start`                 | Start the production server                            |
| `npm run seed`              | Seed the database (`prisma/seed.ts`)                   |
| `npm run prisma:generate:test` | Generate the SQLite test client (runs via `pretest`) |
| `npm test`                  | Run unit/integration tests (Vitest, on SQLite)         |
| `npm run test:e2e`          | Run end-to-end tests (Playwright)                      |

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
    admin/               Role-gated admin area: email+password login, forced
                         change-password flow, review queue,
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
- **M8 backing guard** — a `Lot` must reference a legacy `Product` (`productId`)
  **or** a `FarmProductOffer` (`farmProductOfferId`); the DB `CHECK`
  `Lot_backed_by_product_or_offer` rejects a lot with both null. This replaces a
  blanket `NOT NULL` that would wrongly reject legitimately null rows (e.g. a
  receipt-pre-filled legacy lot that has no offer yet). Under the two-level model
  `Lot.farmProductOfferId` also carries a composite FK enforcing
  `lot.farmId == offer.farmId`.
- **R18** no oversell — `freePlaces >= 0` CHECK + a single atomic conditional
  `updateMany` in `reserve()` (zero rows affected ⇒ `CYCLE_FULL`).

## AI layer

The AI layer is **server-side only** and goes through a single provider boundary
(`AiProvider`). Two implementations exist:

- **MockAiProvider** — deterministic, offline, zero-config. This is the default.
- A real provider — imported **lazily** and constructed **only** when a key is
  present *and* the relevant feature flag is on. Two real implementations ship:
  - **Google Gemini** (`AI_PROVIDER="gemini"`) — the **free** `gemini-1.5-flash`
    model via the Generative Language REST API. Paste a free key into
    `GEMINI_API_KEY` (or `AI_API_KEY` as a fallback).
  - **OpenAI-compatible** (`AI_PROVIDER="openai"`) — any OpenAI-style endpoint,
    using `AI_API_KEY` (+ optional `AI_MODEL` / `AI_BASE_URL`).

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
4. **Copy A/B + LLM-as-judge** — the AI proposes alternative **product
   descriptions** and an LLM-as-judge scores them `PASS`/`FAIL` with a reason,
   using human-authored rules plus the **accumulated examples** of past human
   decisions. A human accepts/edits/rejects each variant **with a required
   reason** (publish is `platform_admin`-only); running experiments are measured
   with the existing anonymous analytics, reported as raw counts with named
   numerator/denominator, an explicit small-sample caveat, and a judge-vs-human
   agreement split (never one collapsed accuracy number). **Learning is
   accumulated examples, not model training.** See the admin **Copy A/B** surface
   (`/admin/copy`) and [`docs/ab-testing-judge.md`](docs/ab-testing-judge.md).

### Feature flags

Per-use-case flags gate the real provider (the mock is always available as a fallback):

| Variable                  | Purpose                                             |
| ------------------------- | --------------------------------------------------- |
| `AI_PROVIDER`             | `mock` (default), `gemini`, or `openai`             |
| `GEMINI_API_KEY`          | Free Gemini key (preferred for `gemini`; empty ⇒ mock) |
| `AI_API_KEY`              | OpenAI key / fallback Gemini key (empty ⇒ mock only) |
| `AI_TRANSLATION_ENABLED`  | Enable the real translation provider     |
| `AI_METRICS_ENABLED`      | Enable the real metrics provider         |
| `AI_RECEIPT_ENABLED`      | Enable the real receipt provider         |

Five **bounded in-panel assistants** (FEAT-007) each have their own flag and are
surfaced with a clear label in the admin panel (via the `AssistantPanel`
component) so an operator can see exactly where each AI assistant lives and where
the real key plugs in. Each only **drafts/suggests** copy or insights for a human
to accept/edit/reject **with a reason**; none can set prices, approve/publish, or
create traceability.

| Variable                           | In-panel assistant                      |
| ---------------------------------- | --------------------------------------- |
| `AI_FARM_PROFILE_DRAFT_ENABLED`    | Farm profile / story draft              |
| `AI_OFFER_COMPARE_ENABLED`         | Offer comparison insight                |
| `AI_TRACEABILITY_REVIEW_ENABLED`   | Traceability review helper              |
| `AI_METRICS_ANALYST_ENABLED`       | Metrics analyst headline                |
| `AI_CYCLE_RECOMMENDATION_ENABLED`  | Cycle recommendation                    |

The **A/B-testing copy loop** (FEAT-004) has its own flag so it can be switched
on/off independently and its `AiRun` audit rows are labelled honestly (use case
`copyAbTesting`):

| Variable                       | A/B copy loop                                     |
| ------------------------------ | ------------------------------------------------- |
| `AI_COPY_AB_TESTING_ENABLED`   | AI proposer + LLM-as-judge for product copy       |

The proposer only **drafts** `draft` variants and the judge only **scores** them
PASS/FAIL/UNKNOWN; a human always decides, approves and publishes. The AI never
sets a price, approves/publishes, or flips status.

> **Receipt extraction is text-only on the real providers.** Both the Gemini and
> OpenAI `extractReceipt` paths send the pre-OCR'd `text` field (wrapped as
> untrusted data) to a JSON model; they do **not** run OCR or send raw image/PDF
> bytes to a vision model. With only binary bytes and no `text`, the model
> receives a `[binary ... upload]` placeholder and returns little of use, so a
> real image/PDF receipt needs OCR text supplied upstream. This is acceptable
> because extraction only **pre-fills a human-review form** and never creates or
> approves any traceability record.

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
