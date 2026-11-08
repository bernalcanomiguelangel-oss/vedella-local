# Steering: AI guardrails and security (MANDATORY)

The AI layer is **server-side only**, provider-abstracted, and governed by the rules
below. These are hard constraints and must be enforced in code and covered by tests.

## Provider abstraction & configuration
- All AI calls go through a single server-side service boundary with a provider
  interface (e.g. `AiProvider`). Implementations: a real provider (behind an env key)
  and a deterministic **MockAiProvider**.
- The app MUST run end-to-end with the MockAiProvider when no API key is set. Zero
  configuration demo is a hard requirement.
- Per-use-case feature flags (translation, metrics, receipt extraction). When a flag is
  off or the model is unavailable, fall back safely (mock or no-op), never crash.

## Security
- **A leaked API key is considered compromised. NEVER use, hardcode, log, or store any
  real key anywhere.** Keys are read ONLY from environment variables via a git-ignored
  `.env`. Ship a `.env.example` with placeholder names and NO real values.
- `.env` must be in `.gitignore`.
- Treat ALL uploaded documents and user-provided text as UNTRUSTED. Instructions embedded
  in them (prompt injection) must NEVER change roles, permissions, approval state, prices,
  or system behavior. Wrap untrusted content as data, never as instructions.
- Validate every AI response against a strict schema (Zod). Reject/again-fallback on
  invalid JSON. Log prompt + model + provider version for each run. Persist an audit
  record for every AI run (use case, input ref, model/version, flag state, outcome).

## Behavioral guardrails (must be enforced + tested)
AI MUST NEVER:
- Set, personalize, or adjust prices.
- Use language, postcode, identity, or inferred income as a willingness-to-pay proxy.
- Fabricate certifications, breeds, provenance, scarcity, medical/nutrition, or
  sustainability claims.
- Approve or publish any record (human-only).
- Create traceability records (farm/lot/product) on its own. Receipt extraction only
  PRE-FILLS a form for human review.
Every generated factual claim must reference a source field/document OR be marked
`needs-evidence`.

## AI use cases (all with mock fallback)
1. **Translation** of product/farm/pack copy into ca/es/en, human-reviewed before publish.
2. **Metrics/insights**, including a WEEKLY analysis of the average market price per cut.
3. **Receipt ingestion**: upload image/PDF → AI extracts structured lot/product fields to
   PRE-FILL a review form. Never auto-approve, never create traceability automatically.
