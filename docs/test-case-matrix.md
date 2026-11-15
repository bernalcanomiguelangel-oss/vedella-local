# Canonical Session-8 test-case matrix

Maps each canonical Session-8 case to its backing automated test(s) and the current verdict.
The eval harness (`npm run eval:vedella`) reuses this mapping to build its "Canonical Session 8
cases" section.

Hard rules:

- A case is **PASS (offline)** only when its backing Vitest test actually ran and passed.
- The Playwright end-to-end scenario for each case is **Not run** in this environment (no
  Docker daemon, no local Postgres, no Neon credential). Until it runs, the end-to-end verdict
  stays the mandated wording: *"Covered by passing unit/integration tests; end-to-end
  PostgreSQL verification pending."*
- Not-run and UNKNOWN are NEITHER pass nor fail.

Offline counts below are from the real `npm run eval:vedella` run recorded in
`eval-results/reports/summary.json` (375/375 Vitest tests passing).

| Case | Session-8 risk | Judge rule | Backing Vitest test(s) | Offline verdict | Playwright e2e scenario (pending) | End-to-end verdict |
| --- | --- | --- | --- | --- | --- | --- |
| S8-H1 | Product reliably assigned to its farm (ownership/relationship) | Rule 1 | `tests/integration/offer-isolation.test.ts`, `tests/integration/product-model.test.ts` | PASS | `e2e/admin-approve.spec.ts` — platform_admin approves a pending product and it becomes visible | Covered by passing unit/integration tests; end-to-end PostgreSQL verification pending. |
| S8-H2 | Lot linked to matching farm + product/offer (traceability) | Rule 1 | `tests/integration/integrity.test.ts`, `tests/integration/offer-isolation.test.ts` | PASS | `e2e/cycle-full.spec.ts` — a reservation is rejected with CYCLE_FULL once the cycle is drained | Covered by passing unit/integration tests; end-to-end PostgreSQL verification pending. |
| S8-H3 | True inactive state (not draft) preserves approval + history | Rule 3 | `tests/admin/lifecycle.test.ts` | PASS | `e2e/admin-approve.spec.ts` — platform_admin approves a pending product and it becomes visible | Covered by passing unit/integration tests; end-to-end PostgreSQL verification pending. |
| S8-H4 | Mandatory lot refs + valid date order enforced | Rule 2 | `tests/validateLot.test.ts`, `tests/integration/integrity.test.ts` | PASS | `e2e/cycle-full.spec.ts` — a reservation is rejected with CYCLE_FULL once the cycle is drained | Covered by passing unit/integration tests; end-to-end PostgreSQL verification pending. |
| S8-H5 | Customer/farm data never exposed to an unauthorised user | Rule 4 / Red Line | `tests/api/auth-gate.test.ts`, `tests/admin/scope.test.ts`, `tests/integration/persona-isolation.test.ts` | PASS | `e2e/admin-approve.spec.ts` — a customer is denied access to the admin area | Covered by passing unit/integration tests; end-to-end PostgreSQL verification pending. |
| S8-C13 | Unsupported public medical claim held for human review | Rule 5 | `tests/integration/content-guard.test.ts`, `tests/content-guard.test.ts` | PASS | `e2e/content-guard.spec.ts` — flagged medical-claim offer is held for human review and cannot be published while unresolved | Covered by passing unit/integration tests; end-to-end PostgreSQL verification pending. |
| S8-PERSONA | Five-persona access isolation | Rule 4 / Red Line | `tests/integration/persona-isolation.test.ts` | PASS | `e2e/persona-isolation.spec.ts` — Farm A/Farm B manager see only their own records; admin sees both | Covered by passing unit/integration tests; end-to-end PostgreSQL verification pending. |
| S8-LANG | Language invariance: locale/postcode never changes price/access | Red Line | `tests/integration/language-invariance.test.ts` | PASS | `e2e/language-switch.spec.ts` — language switcher updates the UI ca -> es -> en | Covered by passing unit/integration tests; end-to-end PostgreSQL verification pending. |

## Notes

- The H1-H5 rows mirror `docs/historical-failure-matrix.md`, which carries the full
  root-cause / constraint / exact test-name detail.
- AI-generated candidate cases are tracked separately in `docs/ai-generated-test-cases.md`
  (every one `Pending human approval`); they are not part of this canonical matrix.
- The only full-suite flake is `tests/integration/reserve.test.ts` ("rejects when there is no
  active cycle"), a parallel-load timeout that passes 6/6 in isolation; it is a timing flake,
  not a canonical-case failure.
