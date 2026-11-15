# PostgreSQL e2e environment (Vercel/Neon-realistic)

This document describes the Playwright e2e environment added in FEAT-002. The
e2e suite boots the Next.js dev server against a **PostgreSQL** database
(`provider = "postgresql"`, the same engine production uses on Vercel + Neon),
not the offline SQLite path the Vitest integration suite uses. That resolves the
Phase-1 blocker where the dev server booted a Postgres client while the local
`.env` pointed at SQLite (`file:./dev.db`).

There are two ways to provide that Postgres:

1. **Local Docker** — a disposable `postgres:16` container (default).
2. **Neon dev branch** — a Vercel-realistic external Postgres, supplied via env.

The SQLite-dev fallback is untouched: when neither e2e URL is set, nothing local
changes.

## What gets created

- `docker-compose.test.yml` — a single, non-production `postgres:16` service for
  database `vedella_test`, published on the **non-default** host port `5433`
  (so it never clobbers a local Postgres on 5432), with a `pg_isready`
  healthcheck and an in-memory (`tmpfs`) data dir that is discarded on teardown.
- `scripts/seed-e2e-postgres.ts` — a **self-resetting** (wipe-then-insert)
  synthetic seed that builds the condition-3 personas + data (see below). It
  refuses to run unless `TEST_DATABASE_URL` or `E2E_DATABASE_URL` is set, so it
  can never wipe a real database by accident.
- `scripts/db-test-setup.sh` / `scripts/db-test-teardown.sh` — the orchestration
  behind `npm run db:test:setup` / `npm run db:test:teardown`. Both are
  **resilient**: a missing `docker`, a stopped Docker daemon, or a missing
  `docker compose` each exit non-zero with a single clear line naming the
  missing dependency (never a stack trace).
- Playwright wiring (`playwright.config.ts` + `e2e/global-setup.ts`) that uses
  the Postgres URL when `TEST_DATABASE_URL`/`E2E_DATABASE_URL` is set and falls
  back to the current behaviour otherwise.

### Synthetic fixtures (condition 3)

`seed-e2e-postgres.ts` builds, idempotently:

- a **platform administrator** with a forced change-password
  (`admin@vedellalocal.example`) **and** a stable e2e admin
  (`e2e-admin@vedellalocal.example`, password already set);
- a **Farm A manager** and a **Farm B manager**;
- a **customer** (`client@vedellalocal.example`);
- (logged-out is implicit);
- **Farm A** and **Farm B** (both approved + active);
- one **Entrecot offer per farm** with a **different price AND weight**
  (Farm A: 14,38 € / 280–320 g; Farm B: 15,62 € / 330–380 g);
- a **valid** in-stock lot and an **invalid** (withdrawn, zero-units) lot per farm;
- an **open** reservation cycle and a **closed** one;
- a **production** order (`isTest=false`) and a **test** order (`isTest=true`).

## Configuration

Set exactly one of these (precedence: `TEST_DATABASE_URL`, then
`E2E_DATABASE_URL`). Both are documented as placeholders in `.env.example`;
`.env` stays git-ignored. **Never** commit a real credential.

| Variable | Path | Used for |
| --- | --- | --- |
| `TEST_DATABASE_URL` | Local Docker | `postgresql://vedella:vedella@localhost:5433/vedella_test` (non-secret throwaway) |
| `E2E_DATABASE_URL` | Neon dev branch | A Neon dev-branch DIRECT connection string (secret) |

## Usage A — local Docker

```bash
# 1. Bring up Postgres, migrate (prisma migrate deploy), and seed fixtures.
export TEST_DATABASE_URL="postgresql://vedella:vedella@localhost:5433/vedella_test"
npm run db:test:setup

# 2. Run the e2e suite (dev server boots against TEST_DATABASE_URL).
npm run test:e2e

# 3. Tear down and discard the test data.
npm run db:test:teardown
```

## Usage B — Neon dev branch (Vercel-realistic)

This mirrors the `vercel-build` flow (`prisma migrate deploy` -> `tsx` seed ->
`next build`) so the **same** e2e suite runs against a Vercel-aligned Postgres.
Use it when Docker is unavailable, or to validate against the production engine.

```bash
# Create a Neon dev branch in the Neon console and copy its DIRECT connection
# string. Provide it via a git-ignored .env or a CI secret — never hardcode it.
export E2E_DATABASE_URL="postgresql://USER:PASSWORD@ep-xxxx.REGION.aws.neon.tech/neondb?sslmode=require"

# db:test:setup detects the external URL and SKIPS Docker, then runs the same
# migrate deploy -> seed flow against the Neon dev branch.
npm run db:test:setup
npm run test:e2e
# Clean up by deleting the Neon dev branch in the Neon console.
```

Because the committed `prisma/schema.prisma` is Postgres and the migrations are
the ones `vercel-build` applies, a passing e2e run against a Neon dev branch is
evidence the suite is testable on the Vercel path.

## Current status: Not run (needs Docker/Postgres env)

The ten Playwright specs below were **NOT RUN** in this sandbox. They are
**neither PASS nor FAIL** — they could not execute because no PostgreSQL was
reachable (no Docker daemon, no local Postgres binaries, and no Neon credential
supplied). The environment is fully created and wired; a run needs a reachable
Postgres.

### Captured blocking reason

`npm run db:test:setup` (exit 1):

```
db:test:setup FAILED: the Docker daemon is not running/reachable (docker CLI
present but 'docker info' failed). Start Docker, or set E2E_DATABASE_URL to a
Neon dev branch. See docs/postgres-e2e-env.md.
```

`npm run test:e2e` then fails because the dev server cannot reach a Postgres:
the local `.env` has `DATABASE_URL="file:./dev.db"` (SQLite) while the committed
schema is Postgres, so every request throws and Playwright's `webServer` never
becomes healthy (times out):

```
[WebServer] ⨯ PrismaClientInitializationError:
[WebServer] Invalid `prisma.farm.findMany()` invocation:
[WebServer] error: Error validating datasource `db`: the URL must start with the
[WebServer] protocol `postgresql://` or `postgres://`.
[WebServer]   -->  schema.prisma:14
...
Command timed out
```

### The ten specs (8 files) — Not run (needs Docker/Postgres env)

| # | File | `test()` title |
| --- | --- | --- |
| 1 | `e2e/admin-approve.spec.ts` | a customer is denied access to the admin area |
| 2 | `e2e/admin-approve.spec.ts` | platform_admin approves a pending product and it becomes visible |
| 3 | `e2e/admin-approve.spec.ts` | platform_admin approves a machine translation and it publishes |
| 4 | `e2e/browse-reserve.spec.ts` | customer can browse, search, add a pack + a cut, and reserve |
| 5 | `e2e/copy-ab.spec.ts` | copy A/B loop: propose -> judge -> human decide with reason -> history visible |
| 6 | `e2e/cycle-full.spec.ts` | a reservation is rejected with CYCLE_FULL once the cycle is drained |
| 7 | `e2e/forced-password-change.spec.ts` | a temporary password forces the change-password flow before admin access |
| 8 | `e2e/language-switch.spec.ts` | language switcher updates the UI ca -> es -> en |
| 9 | `e2e/receipt-review.spec.ts` | receipt upload pre-fills a form; submitting creates a pending_review record |
| 10 | `e2e/content-guard.spec.ts` | flagged medical-claim offer is held for human review and cannot be published while unresolved |

To run them, provide a Postgres (local Docker or a Neon dev branch) per Usage A
or B above and re-run `npm run db:test:setup && npm run test:e2e`.
