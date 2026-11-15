# Session 8/9 Phase 2 report (condition 11)

Final report for Phase 2 of the Vedella Local audit-and-harden effort. Applies the hard rules
throughout: **nothing is PASS unless it was executed with matching evidence; UNKNOWN and
Not-run are never PASS; release status is BLOCKED only if a Red Line test actually failed.**

Tested commit: see `git rev-parse HEAD` (recorded in `eval-results/reports/summary.json` under
`testedCommit`). Test execution date: recorded in the same file under `testExecutionDate`.

## Files changed (Phase 2, this branch)

New (FEAT-005): `scripts/eval-vedella.ts`, `scripts/neon-readonly-scan.ts`,
`eval-results/{baseline,after-fix,screenshots,reports}/*`, `docs/ai-generated-test-cases.md`,
`docs/test-case-matrix.md`, `docs/quality-dashboard.md`, `docs/security-regression-results.md`,
`docs/metric-validation.md`, `docs/release-readiness.md`, `docs/phase2-report.md`,
`architecturedoc.md`. Modified: `package.json` (`eval:vedella`, `neon:scan` scripts),
`docs/data-quality-audit.md` (Read-only production scan section).

Earlier Phase-2 features (FEAT-001..FEAT-004, already committed): `judgeprompt.md`,
`judgeprompt_v1.md`, `docs/historical-failure-matrix.md`; `docker-compose.test.yml`,
`scripts/seed-e2e-postgres.ts`, `scripts/db-test-setup.sh`, `scripts/db-test-teardown.sh`,
`playwright.config.ts`, `e2e/global-setup.ts`, `docs/postgres-e2e-env.md`, `.env.example`;
`src/lib/content-guard.ts`, `src/lib/admin/manage.ts`, `src/lib/admin/core.ts`,
`prisma/schema.prisma`, `prisma/schema.test.prisma`,
`prisma/migrations/20261117000000_add_offer_content_review/migration.sql`;
`tests/content-guard.test.ts`, `tests/integration/content-guard.test.ts`,
`tests/integration/persona-isolation.test.ts`,
`tests/integration/language-invariance.test.ts`; `e2e/content-guard.spec.ts`,
`e2e/persona-isolation.spec.ts`.

## Tests added

- `tests/content-guard.test.ts` — pure content-guard classifier (buckets + accent/spelling).
- `tests/integration/content-guard.test.ts` — condition 2 a/b/c/d against a real DB.
- `tests/integration/persona-isolation.test.ts` — five-persona access isolation (condition 6).
- `tests/integration/language-invariance.test.ts` — language invariance + willingness-to-pay
  Red Line (condition 7).
- Pending e2e specs (Not run): `e2e/content-guard.spec.ts`, `e2e/persona-isolation.spec.ts`.
- Proposed-but-not-adopted candidates: `docs/ai-generated-test-cases.md` (all Pending human
  approval).

## Tests executed (command used)

- Offline Vitest suite via `npm test` (`vitest run`) and via the harness
  `npm run eval:vedella` (`vitest run --reporter=json`).
- Isolation re-run of the known flake: `npx vitest run tests/integration/reserve.test.ts`.
- Type-check: `npx tsc --noEmit`. Build: `npm run build`.
- Read-only scan: `npm run neon:scan` (with `NEON_READONLY_URL` unset).

## Exact passing / failing / unknown counts (real offline Vitest numbers)

- From `npm run eval:vedella` (`eval-results/reports/summary.json`): **49 test files, 375 total,
  375 passed, 0 failed**.
- From a prior `npm test` full run during this work: 1 failed / 374 passed — the single failure
  was the known `reserve.test.ts` parallel-load FLAKE, which passed 6/6 in isolation
  (`Tests 6 passed (6)`). It is a timing flake, NOT a logic failure or regression, and is
  classified `Unknown` (environment/timing) under "Failures by workflow step".
- Unknown/Not-run (NEITHER pass nor fail): the 16 Playwright e2e specs and the read-only Neon
  production scan.

## Three ratios (from the harness)

- **Pass ratio** = passed / actually run = **375 / 375 = 100.0%**.
- **Resolved historical failure ratio** = H pass-after-retest / H actually retested (offline) =
  **5 / 5 = 100.0%**.
- **Regression rate** = previously-passing now failing / previously-passing rerun =
  **0 / 332 = 0.0%**.

## Results of the nine ORIGINAL Playwright specs — Not run (needs Docker/Postgres env)

The nine original specs are #1-9 in `docs/postgres-e2e-env.md`. (The inventory now also
includes the content-guard spec (#10) and the persona specs (#11-16), but the nine ORIGINAL
ones are #1-9.) All **Not run**; exact reason: no Docker daemon, no local Postgres, and no Neon
credential, so no PostgreSQL is reachable. They are NEITHER PASS nor FAIL.

| # | File | `test()` title | Result |
| --- | --- | --- | --- |
| 1 | `e2e/admin-approve.spec.ts` | a customer is denied access to the admin area | Not run |
| 2 | `e2e/admin-approve.spec.ts` | platform_admin approves a pending product and it becomes visible | Not run |
| 3 | `e2e/admin-approve.spec.ts` | platform_admin approves a machine translation and it publishes | Not run |
| 4 | `e2e/browse-reserve.spec.ts` | customer can browse, search, add a pack + a cut, and reserve | Not run |
| 5 | `e2e/copy-ab.spec.ts` | copy A/B loop: propose -> judge -> human decide with reason -> history visible | Not run |
| 6 | `e2e/cycle-full.spec.ts` | a reservation is rejected with CYCLE_FULL once the cycle is drained | Not run |
| 7 | `e2e/forced-password-change.spec.ts` | a temporary password forces the change-password flow before admin access | Not run |
| 8 | `e2e/language-switch.spec.ts` | language switcher updates the UI ca -> es -> en | Not run |
| 9 | `e2e/receipt-review.spec.ts` | receipt upload pre-fills a form; submitting creates a pending_review record | Not run |

Captured blocking reason: `npm run db:test:setup` exits 1 ("the Docker daemon is not
running/reachable"), and `npm run test:e2e` then times out because the dev server cannot reach a
Postgres. Full detail in `docs/postgres-e2e-env.md`.

## Results for H1-H5 (mandated wording)

Every historical failure is: **"Covered by passing unit/integration tests; end-to-end
PostgreSQL verification pending."** (H1 ownership/relationship, H2 lot↔farm traceability, H3
true inactive vs draft, H4 mandatory refs + date order, H5 unauthorised data exposure.) See
`docs/historical-failure-matrix.md` and `docs/test-case-matrix.md`.

## Red Line results

No Red Line test failed in the offline suite. Guards and backing tests:

| Red Line guard | Backing test | Offline result |
| --- | --- | --- |
| No secret/API-key value leaks (public or cross-farm reads) | `tests/integration/persona-isolation.test.ts` | PASS |
| Locale/postcode never alters base price (willingness-to-pay) | `tests/integration/language-invariance.test.ts` | PASS |
| Cross-farm / unauthorised access denied | `tests/api/auth-gate.test.ts`, `tests/admin/scope.test.ts` | PASS |
| Medical-claim content never auto-published | `tests/integration/content-guard.test.ts` | PASS |

End-to-end confirmation pending the Postgres e2e run.

## Medical-claim results (condition 2 a/b/c/d)

From `tests/integration/content-guard.test.ts` (offline, PASS) + `tests/content-guard.test.ts`:

- **(a)** A PROHIBITED treatment/prevention claim SAVES as a draft but is flagged
  (`contentReviewState='flagged'`), parked in `pending_review`; approve/activate is REFUSED
  (`CONTENT_REVIEW_REQUIRED`) while unresolved; a `farm_manager` cannot resolve; after a
  `platform_admin` approves corrected wording (`resolved`), the transition is permitted. PASS.
- **(b)** A NEEDS_EVIDENCE nutrition claim -> `contentReviewState='needs_evidence'`; not
  auto-published, not auto-rejected; approval refused while unresolved. PASS.
- **(c)** ORDINARY descriptive text -> no flag; normal human approve/activate flow. PASS.
- **(d)** Medical wording + injection inside an UPLOADED DOCUMENT stays inert DATA; the stored
  offer's status/flags are completely unchanged (could not bypass review or flip status). PASS.

## Persona isolation results

From `tests/integration/persona-isolation.test.ts` (offline, PASS): public/customer read only
active+approved public records; customer has no admin scope and cannot read another customer's
orders; Farm A/Farm B managers cannot cross the farm boundary (act/read/mutate ->
`FORBIDDEN`/scoped-empty); URL-id and farmId tamper rejected (`FORBIDDEN`/`FARM_MISMATCH`,
`NOT_FOUND` with no existence leak); private media/unverified certs never public;
platform_admin retains authorised cross-farm access; no self-promotion to platform_admin
(human-only, audited). Detail in `docs/security-regression-results.md`.

## Language-invariance results

From `tests/integration/language-invariance.test.ts` (offline, PASS): one offer in ca/es/en has
identical base price, availability, approval and access (only copy differs); locale never
changes `priceAmountCents`; postcode (affluent vs modest) never alters the base price; a
quantity-discount tier still ignores locale/postcode.

## PostgreSQL environment used (or exactly why not)

**None used.** No Docker daemon (docker CLI present but `docker info` fails), no local Postgres
binaries, and no Neon credential supplied. So the Playwright e2e suite and the read-only Neon
scan did NOT run; all Vitest unit/integration work ran offline against the per-file SQLite test
client with real counts. The e2e environment is fully created and wired and is reproducible on
Vercel + Neon (dev branch) or local Docker — see `docs/postgres-e2e-env.md`.

## Regressions found

None. Regression rate 0/332. The only full-run failure observed anywhere was the documented
`reserve.test.ts` parallel-load timing flake (passes 6/6 in isolation), which is not a logic
regression.

## Migrations proposed

`prisma/migrations/20261117000000_add_offer_content_review` — adds two additive, nullable TEXT
columns (`contentReviewState`, `contentFlagReason`) to `FarmProductOffer`. Applied to
LOCAL/TEST only. Its production (Neon) deploy is **PROPOSED** and requires **explicit user
approval**. No `prisma migrate deploy` was run against any production database.

## Remaining limitations

- End-to-end PostgreSQL verification (16 Playwright specs) is pending a reachable Postgres.
- The read-only Neon production data-quality scan is pending an authorised `NEON_READONLY_URL`.
- The AI-generated candidate test cases in `docs/ai-generated-test-cases.md` are Pending human
  approval and not adopted into the canonical suite.

## Evidence (links / paths)

- Harness output: `eval-results/reports/summary.json`, `eval-results/reports/summary.md`,
  `eval-results/reports/vitest.json`; after-fix copy under `eval-results/after-fix/`; baseline
  under `eval-results/baseline/baseline.json`.
- Tests: `tests/content-guard.test.ts`, `tests/integration/content-guard.test.ts`,
  `tests/integration/persona-isolation.test.ts`,
  `tests/integration/language-invariance.test.ts`, `tests/api/auth-gate.test.ts`,
  `tests/admin/scope.test.ts`, `tests/validateLot.test.ts`,
  `tests/integration/integrity.test.ts`, `tests/admin/lifecycle.test.ts`.
- Docs: `docs/historical-failure-matrix.md`, `docs/test-case-matrix.md`,
  `docs/quality-dashboard.md`, `docs/security-regression-results.md`,
  `docs/metric-validation.md`, `docs/release-readiness.md`, `docs/data-quality-audit.md`,
  `docs/postgres-e2e-env.md`, `architecturedoc.md`.
- Scripts: `scripts/eval-vedella.ts`, `scripts/neon-readonly-scan.ts`.

## STOP AND REPORT

The proposed production migration (`20261117000000_add_offer_content_review`) **awaits the
user's explicit approval. No migration was deployed to production.** The work stops here and
returns control for review: no push, no PR, no production deploy was performed.
