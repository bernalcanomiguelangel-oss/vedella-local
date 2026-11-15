# Release readiness

Status as of the latest `npm run eval:vedella` run. Applies the hard rules: nothing is PASS
unless executed with matching evidence; UNKNOWN and Not-run are never PASS; release status is
**BLOCKED only if a Red Line test actually FAILED**.

## Release status: NOT BLOCKED on a Red Line basis — end-to-end PostgreSQL verification pending

No Red Line test failed in the offline suite, so there is no Red Line block. Release is **not
fully green** because the end-to-end PostgreSQL (Playwright) verification and the read-only Neon
production scan have **not run** in this environment. Those are pending verifications, not
failures.

| Gate | State | Basis |
| --- | --- | --- |
| Offline Vitest suite | PASS | 375/375 tests passing (`eval-results/reports/summary.json`). |
| Red Line guards | PASS (offline); e2e pending | No Red Line test failed; see `docs/security-regression-results.md`. |
| Historical failures H1-H5 | Covered by passing unit/integration tests; end-to-end PostgreSQL verification pending | `docs/historical-failure-matrix.md`, `docs/test-case-matrix.md`. |
| Medical-claim content guard | PASS (offline); e2e pending | `tests/integration/content-guard.test.ts` (condition 2 a/b/c/d). |
| Persona isolation | PASS (offline); e2e pending | `tests/integration/persona-isolation.test.ts`. |
| Language invariance | PASS (offline); e2e pending | `tests/integration/language-invariance.test.ts`. |
| Playwright e2e (16 specs) | Not run (needs Docker/Postgres env) | No Docker daemon / local Postgres / Neon credential. |
| Read-only Neon production scan | Not run (no read-only credential) | `NEON_READONLY_URL` unset. |
| Proposed content-review migration | PROPOSED — awaits explicit user approval | Not deployed to production (see below). |

## H1-H5

Each historical failure is: **Covered by passing unit/integration tests; end-to-end PostgreSQL
verification pending.** None is reported as an e2e PASS.

## Blocking migration note

`prisma/migrations/20261117000000_add_offer_content_review` (two additive, nullable columns on
`FarmProductOffer`) is applied to LOCAL/TEST only. Its production (Neon) deploy is **PROPOSED**
and **awaits the user's explicit approval**. No migration was deployed to production as part of
this work.

## To reach full green

1. Provide a Postgres target (local Docker or a Neon dev branch) and run
   `npm run db:test:setup && npm run test:e2e`; record results under `eval-results/`.
2. Provide a read-only `NEON_READONLY_URL` and run `npm run neon:scan`; review counts +
   technical IDs.
3. Obtain explicit human approval before deploying the content-review migration to production.
