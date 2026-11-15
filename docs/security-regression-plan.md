# Security regression plan — Red Line + Rule 4 (five personas)

> How each Red Line and Rule-4 (access-matches-role) case will be regression-tested with the
> five personas, mapped to existing tests where they already exist and gaps where they do not.
> Phase 1 defines the plan; Phase 2 adds the missing tests. Evidence cites files on
> `audit/session8-9-hardening` at `bb1825e`.

## Personas

1. **Logged-out** (no session cookie).
2. **Customer** (role `customer`, no admin access).
3. **Farm A manager** (role `farm_manager`, `farmId = A`).
4. **Farm B manager** (role `farm_manager`, `farmId = B`).
5. **Platform admin** (role `platform_admin`).

Expected baseline: every persona receives only its minimum authorized data; no URL/request
parameter can bypass farm ownership.

## Red Line cases × coverage

| Red Line | Expected | Existing coverage | Gap for Phase 2 |
| --- | --- | --- | --- |
| Never expose private customer/farm data | each persona sees only authorized data | `api/auth.test.ts`, `api/auth-gate.test.ts`, `admin/scope.test.ts`, `offer-isolation.test.ts`, `settings-secrets.test.ts` | explicit per-persona test on a customer-contact / order-detail endpoint |
| Never bypass farm ownership / traceability | cross-farm write rejected | `offer-isolation.test.ts` (A cannot mutate B's offer; A cannot create a lot on B's offer, `code=FORBIDDEN`); DB composite FKs (`migration.sql:808,811`) | a request-level test that tampering `farmId` in a submitted form is rejected (Phase-4 case 5) |
| Never allow cross-farm access | A sees only A; B sees only B | `offer-isolation.test.ts` scope-where; `scope.test.ts` `visibleFarmScope` | URL-ID tampering test that another farm's record id returns forbidden/not-found (Phase-4 case 6) |
| Never publish unsupported medical claims | blocked / non-public draft / human review | AI copy-judge FAILs medical wording (`mock-provider.ts`, `copy-ab.test.ts`); human-review gate for offers (`offer-isolation.test.ts` pending_review) | **medical-claim detector + regression on a hand-typed offer description** (see root-cause H-extra) |
| Never change price/visibility by language/identity/postcode/WTP | rejected; language never changes base price or eligibility | guardrail WTP-proxy scan (`guardrails.ts`, `ai/guardrails.test.ts`); pricing is deterministic (`pricing.ts`, `pricing.test.ts`); i18n resolves copy only, never price | explicit test that switching locale leaves `basePriceCents` and public eligibility identical (Phase-3 case 14) |
| Never let AI-generated content approve/publish itself | human-only approval | `ai/assistants.test.ts`, `ai/integration.test.ts`, `ai/copy-ab.test.ts` (injected instruction changes no state); guardrail strips approval/status/role fields | — (well covered) |
| Never weaken access control to make a record appear publicly | show admin the missing condition instead | public gate requires full approved+active+lot chain (`catalog.ts`); public-readiness/exclusion-reason concept | regression that an ineligible farm stays hidden and admin sees the exact reason (Phase-4 case 10) |

## Rule-4 access matrix (to assert per persona in Phase 2)

| Target | Logged-out | Customer | Farm A mgr | Farm B mgr | Platform admin |
| --- | --- | --- | --- | --- | --- |
| `/admin/*` pages | redirect login | denied | own-farm data only | own-farm data only | all |
| `/api/ai/*` | 401/403 | 401/403 | allowed (own scope) | allowed (own scope) | allowed |
| Farm A offer read/edit | no | no | yes | **no** | yes |
| Farm B offer read/edit | no | no | **no** | yes | yes |
| Create lot on Farm B offer | no | no | **no (FORBIDDEN)** | yes | yes |
| Customer contact / order PII | no | own only | own-farm orders only | own-farm orders only | authorized workflow |
| Secrets (API keys) | no | no | no | no | presence-boolean only |
| Approve / publish any record | no | no | **no** | **no** | yes (human) |

Cells in **bold** are the cross-farm / privilege-escalation denials that most need an
explicit per-persona regression test in Phase 2; the rest are already covered by the files
named above.

## Phase-2 regression additions (planned, not built in Phase 1)

1. A parametrised persona harness that drives each of the five identities against the matrix
   above and asserts the expected allow/deny + the exact data returned.
2. Request/URL tampering tests: submitting another farm's `farmId`, and loading another
   farm's record by id, both rejected (Phase-4 cases 5 and 6).
3. Medical-claim regression on a hand-typed offer description (Red Line "never publish
   unsupported medical claims") — fails before any detector fix, passes after.
4. Locale-invariance test: base price and public eligibility identical across ca/es/en
   (Red Line "no discriminatory pricing/visibility").

Every new test must **fail before** the corresponding fix and **pass after**; none may be
marked PASS without an executed, matching result.
