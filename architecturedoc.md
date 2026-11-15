# Vedella Local — architecture notes (Session 8/9 Phase 2 additions)

This document records the architecture seams added or hardened in Phase 2. It focuses on the
content-guard + human-review seam, the AI-advice-only boundary, the PostgreSQL e2e environment,
and the evaluation harness. It complements the per-feature docs under `docs/`.

## 1. Content guard + human-review seam

- `src/lib/content-guard.ts` is a **deterministic** classifier (no AI). `classifyContent(text)`
  returns one of three buckets: `prohibited` (unsupported treatment/prevention medical claims),
  `needs_evidence` (nutrition claims), or `ordinary`. It tolerates accents and variant spelling
  and is case-insensitive; `prohibited` wins when both appear.
- Persistence: two additive, nullable columns on `FarmProductOffer` —
  `contentReviewState` (`null`/`clear` | `flagged` | `needs_evidence` | `resolved`) and
  `contentFlagReason` (a short, PII-free reason).
- Gate: a flagged offer still **saves** as a draft but is forced into `pending_review` and
  **cannot** be approved/activated/published while unresolved. The lifecycle applier
  (`src/lib/admin/core.ts` + `src/lib/admin/lifecycle.ts`) refuses the transition with
  `CONTENT_REVIEW_REQUIRED`. Only a `platform_admin` can resolve a flag
  (`applyContentReviewDecision`); a `farm_manager` cannot. The publication decision stays
  **human-only**.
- Exercised by `tests/content-guard.test.ts` (pure) and `tests/integration/content-guard.test.ts`
  (condition 2 a/b/c/d), plus the pending `e2e/content-guard.spec.ts`.

## 2. AI-advice-only boundary

- All AI calls go through a single server-side provider boundary with a `MockAiProvider`
  default, so the app runs end-to-end offline with zero configuration.
- The AI **never** sets/personalises prices, never uses language/postcode/identity as a
  willingness-to-pay proxy, never approves or publishes a record, and never creates
  traceability. Receipt extraction only PRE-FILLS a form for human review; the weekly metric is
  computed deterministically from the DB and the AI only phrases a neutral headline.
- Untrusted text/documents are fenced as DATA via `src/lib/ai/sanitize.ts` (`wrapUntrusted`);
  instruction-like content cannot change roles, permissions, approval state, prices, or
  behaviour. The content guard may READ a document's text to classify it, but that read never
  writes to any record — application state is decided by server code, not by text.
- Every AI run is validated against a strict schema and persisted as an audit record.

## 3. PostgreSQL e2e environment (Vercel/Neon-realistic)

- The Playwright e2e suite boots the dev server against **PostgreSQL** (the engine production
  uses on Vercel + Neon), not the offline SQLite path the Vitest integration suite uses.
- Two paths: a disposable `postgres:16` Docker container (`docker-compose.test.yml`, port 5433)
  or a Neon **dev branch** (Vercel-realistic, mirrors the `vercel-build` migrate-deploy → seed
  flow). Chosen via `TEST_DATABASE_URL` (precedence) or `E2E_DATABASE_URL`.
- `scripts/seed-e2e-postgres.ts` builds the condition-3 personas/data and refuses to run unless
  a test URL is set. `scripts/db-test-setup.sh` / `db-test-teardown.sh` are resilient (clear
  single-line error if Docker is missing). Full walkthrough: `docs/postgres-e2e-env.md`.
- **Invariant preserved:** `src/lib/db.ts` loads the SQLite test client only under `VITEST` via
  a non-analyzable `eval("require")`, and `tsconfig` excludes `tests/`/`e2e/` from the
  production build, so the Vercel build stays green.

## 4. Evaluation harness (`npm run eval:vedella`)

- `scripts/eval-vedella.ts` runs the OFFLINE Vitest suite with the JSON reporter
  (`eval-results/reports/vitest.json`), and runs Playwright with its JSON reporter ONLY when a
  Postgres env is available; otherwise it records Playwright as **Not run** with the exact
  reason (it never fails the harness on a missing Postgres).
- It aggregates both into `eval-results/reports/summary.json` + `summary.md`, with the twelve
  required sections and the three exact ratios:
  - **Pass ratio** = passed tests / tests actually run.
  - **Resolved historical failure ratio** = historical failures that pass after retest /
    historical failures actually retested.
  - **Regression rate** = previously passing tests that now fail / previously passing tests
    rerun.
  - UNKNOWN and Not-run count as NEITHER pass nor fail and are excluded from the "actually
    run"/"actually retested" denominators.
- Canonical Session-8 cases and AI-generated candidates are reported in SEPARATE sections; the
  canonical mapping is reused from `docs/historical-failure-matrix.md` and
  `docs/test-case-matrix.md`.

## 5. Read-only production data-quality scan

- `scripts/neon-readonly-scan.ts` (`npm run neon:scan`) runs SELECT-only queries against a
  production/Neon snapshot, reporting ONLY counts + technical IDs (no PII, no connection
  string). The credential is read only from `NEON_READONLY_URL`; with it unset the script
  prints `Not run (no read-only credential)` and exits 0 without connecting. Queries are
  documented in `docs/data-quality-audit.md` (Read-only production scan).

## Secrets posture

No real key or connection string is committed anywhere. `.env` is git-ignored; `.env.example`
carries placeholder names only. The admin UI only ever shows whether a key is PRESENT, never
its value.
