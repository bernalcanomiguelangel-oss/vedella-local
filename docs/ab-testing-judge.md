# A/B testing + LLM-as-judge for product descriptions

This is the human-approved, auditable loop that improves **product
descriptions** over time. It never prices, approves, publishes, or creates
traceability on its own, and it runs **fully offline** on the deterministic mock
provider (no API key required). With a free Google Gemini key configured it can
use the real provider; without one it stays on the mock.

## The loop

1. **Propose (AI).** For an offer + locale, the AI proposer drafts alternative
   descriptions grounded **only** in the offer's real structured facts (public
   name, canonical name, maturation, packaging, storage, shelf life). Price is
   passed as read-only context and is never a field the AI can set. Each draft is
   stored as a `CopyVariant` with `source='ai'` and `status='draft'`. The AI
   never sets a non-draft status.
2. **Judge (LLM-as-judge).** The judge scores each variant `PASS` / `FAIL` /
   `UNKNOWN` **with a reason**, using human-authored `JudgeRule` rows plus the
   accumulated human-decision examples. Invalid or empty model output falls back
   to `UNKNOWN` (the safe default). Verdicts are stored as `JudgeEvaluation`
   rows. The judge is advisory only; it changes no status and no price.
3. **Decide (human).** A human accepts / edits / rejects each variant **with a
   required reason**. Approve/publish (status `approved`/`active`) is
   `platform_admin`-only. This human action is the **only** place a variant's
   status changes. Every decision is persisted as a `HumanDecisionExample`.
4. **Experiment + measure.** A human starts an A/B experiment pairing two
   **approved** variants. On the public marketplace, a running experiment serves
   one approved variant per anonymous session (deterministic hash of the
   `vl_anon` id + experiment id). Impressions and conversions are measured with
   the existing anonymous analytics stream.

## Learning is accumulated examples, not training

The system does **not** train or fine-tune a model. "Learning" means
accumulating real human decisions (`HumanDecisionExample`) and **replaying** them
as in-context few-shot examples into both the proposer and the judge prompts on
later runs. The model weights never change, and the whole mechanism stays
auditable: you can read exactly which past decisions shaped a prompt.

## Honesty rules (enforced + tested)

- **Named numerator/denominator.** Per-variant conversion is reported as raw
  counts: the denominator is `impressedSessions` (distinct sessions shown the
  variant) and the numerator is `convertedSessions` (distinct impressed sessions
  that then converted). A conversion is credited **only** when the session was
  actually impressed on that variant.
- **Small-sample caveat.** When either arm has fewer than the project's
  small-sample threshold (**20** impressions), the metric raises a
  `sampleTooSmall` flag. The UI warns explicitly and does not draw conclusions.
- **No significance claims.** The metric never computes or reports statistical
  significance. The result object carries an explicit `significanceClaimed:
  false` marker and exposes no p-value / confidence field.
- **Judge-vs-human agreement is two separate counts.** Agreement is reported as
  `failuresCaught` (judge `FAIL` where the human rejected/edited) and
  `passesAgreed` (judge `PASS` where the human approved), kept **separate** and
  **never** collapsed into a single accuracy number. Disagreements are surfaced
  separately so a human can inspect them.
- **Privacy.** Analytics events carry an id only (`copyVariantId`) and the opaque
  `vl_anon` session id — no PII, ever. Test records are excluded from metrics by
  default.
- **Only approved copy is ever shown.** The public marketplace serves a variant
  only when both arms of the experiment are `approved`/`active`; otherwise the
  original description renders unchanged.

## Where it lives

- Serving: `src/lib/ab-serving.ts` (deterministic assignment + impression
  resolution), wired into `src/app/[locale]/farms/[slug]/page.tsx` and the
  conversion attribution in `src/app/api/reserve/route.ts`.
- Metrics: `src/lib/admin/copy-ab-metrics.ts` (raw counts + agreement split).
- Admin surface: `/admin/copy` (`src/app/admin/copy/page.tsx`) — AI drafts +
  judge verdicts + the human decision control + raw metrics with caveats + the
  decision/audit history.
- Services + data model: `src/lib/ai/copy-proposer.ts`,
  `src/lib/ai/copy-judge.ts`, `src/lib/ai/copy-examples.ts`,
  `src/lib/admin/copy-ab-actions.ts`, and the `CopyVariant` / `CopyExperiment` /
  `JudgeRule` / `JudgeEvaluation` / `HumanDecisionExample` tables.
