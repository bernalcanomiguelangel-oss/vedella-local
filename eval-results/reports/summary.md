# Vedella Local — eval:vedella report

Offline-first evaluation harness output. Nothing is marked PASS unless it was executed with matching evidence; UNKNOWN and Not-run are NEITHER pass nor fail and are excluded from the ratio denominators.

## Canonical Session 8 cases

Each canonical case maps to its backing OFFLINE Vitest test and the PENDING Playwright e2e scenario (mapping reused from docs/historical-failure-matrix.md and docs/test-case-matrix.md).

| Case | Title | Rule | Backing Vitest (file) | Vitest verdict | e2e scenario | e2e status |
| --- | --- | --- | --- | --- | --- | --- |
| S8-H1 | Product reliably assigned to its farm (ownership + relationship) | Rule 1 | `tests/integration/offer-isolation.test.ts` (9/9) | PASS | e2e/admin-approve.spec.ts — platform_admin approves a pending product and it becomes visible | Not run (needs Docker/Postgres env) |
| S8-H2 | Lot linked to the matching farm + product/offer (traceability) | Rule 1 | `tests/integration/integrity.test.ts` (16/16) | PASS | e2e/cycle-full.spec.ts — a reservation is rejected with CYCLE_FULL once the cycle is drained | Not run (needs Docker/Postgres env) |
| S8-H3 | True inactive state (not draft) preserves approval + history | Rule 3 | `tests/admin/lifecycle.test.ts` (13/13) | PASS | e2e/admin-approve.spec.ts — platform_admin approves a pending product and it becomes visible | Not run (needs Docker/Postgres env) |
| S8-H4 | Mandatory lot refs + valid date order enforced | Rule 2 | `tests/validateLot.test.ts` (10/10) | PASS | e2e/cycle-full.spec.ts — a reservation is rejected with CYCLE_FULL once the cycle is drained | Not run (needs Docker/Postgres env) |
| S8-H5 | Customer/farm data never exposed to an unauthorised user (Red Line) | Rule 4 / Red Line | `tests/api/auth-gate.test.ts` (6/6) | PASS | e2e/admin-approve.spec.ts — a customer is denied access to the admin area | Not run (needs Docker/Postgres env) |
| S8-C13 | Unsupported public medical claim held for human review (Case 13) | Rule 5 | `tests/integration/content-guard.test.ts` (5/5) | PASS | e2e/content-guard.spec.ts — flagged medical-claim offer is held for human review and cannot be published while unresolved | Not run (needs Docker/Postgres env) |
| S8-PERSONA | Five-persona access isolation (public/customer/Farm A/Farm B/admin) | Rule 4 / Red Line | `tests/integration/persona-isolation.test.ts` (25/25) | PASS | e2e/persona-isolation.spec.ts — Farm A manager sees only Farm A's records in the admin area | Not run (needs Docker/Postgres env) |
| S8-LANG | Language invariance: locale/postcode never changes price or access | Red Line | `tests/integration/language-invariance.test.ts` (5/5) | PASS | e2e/language-switch.spec.ts — language switcher updates the UI ca -> es -> en | Not run (needs Docker/Postgres env) |

## Additional AI-generated cases

AI-generated test-case PROPOSALS are tracked separately in `docs/ai-generated-test-cases.md`. Every proposal is `Pending human approval`; proposals already backed by FEAT-003/FEAT-004 tests are noted as `covered` there. None are silently adopted into the canonical suite, so they do NOT contribute to the pass/fail counts or ratios above.

## Vitest results

- Status: run
- Test files: 49
- Total tests: 375
- Passed: 374
- Failed: 1
- Failing cases: `tests/integration/reserve.test.ts` › reserve(): rejections rejects when there is no active cycle
- NOTE: the only failure is the documented `reserve.test.ts` parallel-load FLAKE (passes 6/6 in isolation via `npx vitest run tests/integration/reserve.test.ts`). It is a timing flake, not a logic failure or regression.

### The three ratios (exact definitions)

- **Pass ratio** = passed tests / tests actually run = 374/375 = 99.7%
- **Resolved historical failure ratio** = historical failures that pass after retest / historical failures actually retested = 5/5 = 100.0%
- **Regression rate** = previously passing tests that now fail / previously passing tests rerun = 1/332 = 0.3%
  - The single full-run failure is the documented reserve.test.ts parallel-load FLAKE (passes 6/6 in isolation); it is a timing flake, not a logic regression.

## Playwright results

- **Not run (needs Docker/Postgres env): no TEST_DATABASE_URL or E2E_DATABASE_URL set, and no reachable PostgreSQL (no Docker daemon, no local Postgres, no Neon credential in this environment). See docs/postgres-e2e-env.md.**
- The sixteen Playwright specs (nine original + content-guard + persona) are NEITHER PASS nor FAIL; they are excluded from every ratio. See `docs/postgres-e2e-env.md` for the full inventory and how to run them against a Postgres target (local Docker or a Neon dev branch).

## Unknown or not-run cases

- Playwright e2e: Not run (needs Docker/Postgres env): no TEST_DATABASE_URL or E2E_DATABASE_URL set, and no reachable PostgreSQL (no Docker daemon, no local Postgres, no Neon credential in this environment). See docs/postgres-e2e-env.md.
- Read-only Neon production scan: Not run (no read-only credential): NEON_READONLY_URL unset; scripts/neon-readonly-scan.ts never connects without it.
- These are counted as NEITHER pass nor fail and are excluded from the pass ratio, the resolved-historical-failure ratio, and the regression rate.

## Red Line results

- Overall: No Red Line violation demonstrated in the offline suite.

| Red Line guard | Backing Vitest | Run | Passed | Failed | Verdict |
| --- | --- | --- | --- | --- | --- |
| Secrets never leak (persona isolation Red Line) | `tests/integration/persona-isolation.test.ts` | 25 | 25 | 0 | PASS |
| Willingness-to-pay: locale/postcode never changes price | `tests/integration/language-invariance.test.ts` | 5 | 5 | 0 | PASS |
| Cross-farm / unauthorised access denied | `tests/api/auth-gate.test.ts` | 6 | 6 | 0 | PASS |
| Medical-claim content never auto-published | `tests/integration/content-guard.test.ts` | 5 | 5 | 0 | PASS |

## Failures by workflow step

| Step | Count |
| --- | --- |
| Step 1 - Data entry | 0 |
| Step 2 - Validation | 0 |
| Step 3 - Relationship and traceability | 0 |
| Step 4 - Save and operational use | 0 |
| None | 374 |
| Unknown | 1 |

The judge classifies the FIRST failing step per case (Steps 1-4). The only offline failure is the timing flake, classified `Unknown` (environment/timing), not a logic step.

## Historical failures resolved

Each H1-H5 is retested by its backing OFFLINE Vitest file; the e2e half is Not run and reported as pending (not counted as retested).

| Historical failure | Canonical case | Retested offline | Verdict |
| --- | --- | --- | --- |
| H1 | S8-H1 | yes | PASS |
| H2 | S8-H2 | yes | PASS |
| H3 | S8-H3 | yes | PASS |
| H4 | S8-H4 | yes | PASS |
| H5 | S8-H5 | yes | PASS |

Resolved historical failure ratio = 5/5 = 100.0%. After cell for every H-row until e2e runs: "Covered by passing unit/integration tests; end-to-end PostgreSQL verification pending."

## Regressions introduced

- Previously passing tests rerun: 332 (baseline from FEAT-001).
- Previously passing tests that now fail: 1.
- Regression rate = 1/332 = 0.3%.
- The single full-run failure is the documented reserve.test.ts parallel-load FLAKE (passes 6/6 in isolation); it is a timing flake, not a logic regression.

## Tested commit

- `a148de1d916c2de74c6c3a8e2f2edb8c5f2cd6f2` (git rev-parse HEAD)

## Environment used

- Offline Node v22.23.4 sandbox: Vitest ran against the per-file SQLite test client. No Docker daemon, no local Postgres, no Neon credential => Playwright e2e and the read-only Neon scan were Not run.

## Test execution date

- 2026-11-15T16:29:15.367Z
