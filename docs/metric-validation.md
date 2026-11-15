# Metric validation (weekly market price + test-data contamination)

Validates the two metric concerns in scope for Session 8/9: the **weekly average market price
per cut** and the exclusion of **test data** (`isTest=true`) from production metrics. As far as
evidence supports: the offline Vitest tests PASS; the live production figures depend on the
read-only Neon scan, which is **Not run** (no credential).

The AI never sets or personalises any price. The weekly metric is computed **deterministically
from the database** (`src/lib/ai/metrics.ts` `computeWeeklyAverages`); the AI layer only phrases
a neutral headline over observed numbers. This is the condition-9/Rule-3 willingness-to-pay and
R25 boundary.

## Weekly average market price per cut (R25)

`computeWeeklyAverages(reference)` (`src/lib/ai/metrics.ts`):

- Candidate cuts: `kind="cut"`, `isApproved && isActive && !isTest`, on a farm that is itself
  `isApproved && isActive && !isTest`.
- A cut counts toward the week only if it has at least one usable lot (`!isWithdrawn`,
  `!isTest`, `units > 0`) whose `packingDate` falls inside the ISO week.
- Groups by cut NAME across farms (the "market" price for that cut) and averages
  `basePriceCents`; persists one `MarketPriceSnapshot` per `(cutName, weekStart)`.

| Check | Evidence | Verdict |
| --- | --- | --- |
| Average per cut per ISO week, `isTest` excluded; snapshots + audit written | `tests/ai/integration.test.ts` ("metrics: average per cut per ISO week, isTest excluded; snapshots + audit") | PASS (offline) |
| AI never sets a price — it only phrases a headline over observed numbers | `src/lib/ai/metrics.ts` (deterministic compute) + mock/gemini providers only summarise | PASS (offline, code-level) |
| Metrics API gated to admins (read vs persist split) | `tests/api/auth.test.ts` | PASS (offline) |

## Test-data contamination (R15)

Every record carries an `isTest` flag; production metrics and the public catalog exclude it.

| Check | Evidence | Verdict |
| --- | --- | --- |
| Test orders excluded from per-farm and platform revenue | `tests/integration/metrics-tiers.test.ts` ("a farm sees only its own revenue (test orders excluded)") | PASS (offline) |
| `isTest=true` lot excluded from production lot queries | `tests/integration/integrity.test.ts` (R15 production/test split) | PASS (offline) |
| Copy-variant impressions honour the `isTest` exclusion flag | `tests/ab-serving.test.ts` ("honours isTest exclusion") | PASS (offline) |
| Public catalog excludes `isTest` lots/farms | `src/lib/catalog.ts` gates + catalog integration tests | PASS (offline) |

## Production verification (pending)

The offline checks prove the **code** excludes test data and computes the weekly average
correctly. Whether the **live Neon data** contains any `isTest=true` rows leaking into a
production figure can only be confirmed by the read-only production scan
(`scripts/neon-readonly-scan.ts`), which reports `isTest` counts for `Order` / `Lot` / `Farm`.

**Status: Not run (no read-only credential).** `NEON_READONLY_URL` is unset. See
`docs/data-quality-audit.md` (Read-only production scan). This item is NEITHER PASS nor FAIL
until the scan runs with an authorised read-only credential.

## Candidate (pending human approval)

`docs/ai-generated-test-cases.md` proposes a new, non-duplicate Vitest case asserting the
weekly market-price average explicitly excludes `isTest` `MarketPriceSnapshot` rows across a
week. It is **Pending human approval**; not yet adopted.
