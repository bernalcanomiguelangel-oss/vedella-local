# Security regression results (persona isolation + Red Line)

Real results from the offline Vitest suites added/extended in FEAT-003/FEAT-004 and exercised
by `npm run eval:vedella`. End-to-end (Playwright/Postgres) confirmation is **pending** (no
Docker/Postgres/Neon in this environment); nothing below is reported as an e2e PASS.

## Persona isolation (condition 6) — `tests/integration/persona-isolation.test.ts`

All assertions drive the REAL authorisation primitives (`src/lib/admin/scope.ts`,
`src/lib/admin/manage.ts`, `src/lib/admin/data.ts`, `src/lib/catalog.ts`) against a real SQLite
database; loosening any guard would make these FAIL.

| Persona / scenario | Expected | Offline result |
| --- | --- | --- |
| Public visitor + customer read ONLY active+approved public records; draft never public | enforced | PASS |
| Non-approved farm invisible to the public | enforced | PASS |
| Customer has NO admin scope (empty visible scope; cannot act on any farm) | enforced | PASS |
| Customer cannot read another customer's orders (scope collapses to `__none__`) | enforced | PASS |
| Farm A manager cannot act on Farm B (both directions) | `FORBIDDEN` | PASS |
| Offer / lot / order loaders restrict each manager to their own farm | enforced | PASS |
| Farm A manager cannot mutate Farm B's offer (self-edit) | `FORBIDDEN` | PASS |
| URL-id tamper to a foreign offer id | `FORBIDDEN`; non-existent id `NOT_FOUND` (no existence leak) | PASS |
| farmId tamper in a create request | `FORBIDDEN`; farmId check wins even for an own-farm claim (`FARM_MISMATCH`) | PASS |
| Private media / unverified certs never public (evidence refs hidden) | enforced | PASS |
| platform_admin retains authorised cross-farm access | enforced | PASS |
| A new account cannot self-promote to platform_admin (human-only assignment, audited) | `DENIED` unless an authorised platform_admin assigns | PASS |

## Language invariance (condition 7) — `tests/integration/language-invariance.test.ts`

| Scenario | Expected | Offline result |
| --- | --- | --- |
| One offer in ca/es/en: identical price, availability, approval, access; only copy differs | invariant | PASS |
| Changing locale never changes `priceAmountCents` / `basePriceCents` | exactly one distinct price | PASS |
| Price label formatting is locale-independent (same deterministic euro format) | enforced | PASS |
| Postcode (affluent vs modest area) never alters base price | identical base cents | PASS |
| A quantity-discount tier (legitimate input) still ignores locale/postcode | identical totals; discount really applied | PASS |

## Red Line results

The Red Line (judgeprompt §4): never expose private customer/farm data, never bypass farm
ownership/traceability, never change prices/visibility based on language, identity, postcode,
protected characteristics, or inferred willingness to pay.

| Red Line guard | Backing test | Offline result |
| --- | --- | --- |
| No secret / API-key value leaks through any public or cross-farm read | `tests/integration/persona-isolation.test.ts` (Red Line: no secret value leaks …) | PASS |
| Locale/postcode never alters the base price (willingness-to-pay) | `tests/integration/language-invariance.test.ts` (Red Line: postcode / locale never alters the base price) | PASS |
| Cross-farm / unauthorised access denied | `tests/api/auth-gate.test.ts`, `tests/admin/scope.test.ts` | PASS |
| Medical-claim content never auto-published | `tests/integration/content-guard.test.ts` | PASS |

**No Red Line violation was demonstrated offline.** Because no Red Line test actually failed,
release status is NOT blocked on a Red Line basis (see `docs/release-readiness.md`). End-to-end
(Postgres) confirmation via `e2e/persona-isolation.spec.ts`, `e2e/language-switch.spec.ts` and
`e2e/content-guard.spec.ts` remains pending.
