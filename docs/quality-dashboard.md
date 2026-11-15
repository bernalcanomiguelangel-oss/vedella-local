# Quality dashboard

Real, offline numbers from the latest `npm run eval:vedella` run
(`eval-results/reports/summary.json`, `summary.md`). Nothing here is PASS unless it was
executed with matching evidence; UNKNOWN and Not-run are excluded from every ratio.

## The three ratios (exact definitions)

| Ratio | Definition | Value |
| --- | --- | --- |
| **Pass ratio** | passed tests / tests actually run | **375 / 375 = 100.0%** |
| **Resolved historical failure ratio** | historical failures that pass after retest / historical failures actually retested | **5 / 5 = 100.0%** |
| **Regression rate** | previously passing tests that now fail / previously passing tests rerun | **0 / 332 = 0.0%** |

- "Tests actually run" = the executed offline Vitest tests. Playwright e2e is Not run and is
  excluded entirely (neither numerator nor denominator).
- "Historical failures actually retested" = H1-H5, each retested by its backing OFFLINE Vitest
  file. The e2e half is Not run and is NOT counted as retested (reported as pending).
- "Previously passing tests rerun" = the 332-test FEAT-001 baseline, all rerun in this suite
  (which has since grown to 375 with the Phase-2 additions).

## Vitest (offline) summary

| Metric | Value |
| --- | --- |
| Test files | 49 |
| Total tests | 375 |
| Passed | 375 |
| Failed | 0 |

Known flake: `tests/integration/reserve.test.ts` ("rejects when there is no active cycle") can
time out under full-suite parallel db-push load and passes 6/6 in isolation
(`npx vitest run tests/integration/reserve.test.ts`). It is a timing flake, not a logic failure
or regression. When it surfaces in a full run the harness reports the raw count and flags it as
the known flake; it is classified `Unknown` (environment/timing) under "Failures by workflow
step", never a logic step failure.

## Playwright e2e

**Not run (needs Docker/Postgres env).** No Docker daemon, no local Postgres, no Neon
credential in this environment. The sixteen specs (nine original + content-guard + persona) are
NEITHER PASS nor FAIL. See `docs/postgres-e2e-env.md` for the inventory and the local-Docker /
Neon-dev-branch run paths.

## Read-only Neon production scan

**Not run (no read-only credential).** `NEON_READONLY_URL` is unset, so
`scripts/neon-readonly-scan.ts` prints `Not run (no read-only credential)` and exits 0 without
connecting. See `docs/data-quality-audit.md` (Read-only production scan) for the SELECT-only
queries.

## Red Line

No Red Line violation was demonstrated in the offline suite. The Red Line guards
(secrets-never-leak, willingness-to-pay/locale-postcode invariance, cross-farm/unauthorised
access, medical-claim-never-auto-published) all PASS offline; see
`docs/security-regression-results.md`. End-to-end confirmation is pending the Postgres e2e run.
