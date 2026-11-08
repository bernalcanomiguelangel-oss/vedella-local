# Tasks: Vedella Local — multi-farm marketplace with AI

Phased, reversible delivery. Run tests after every phase. A devil's-advocate review runs
after the core is in place; revise on its feedback before finishing. Detailed,
machine-readable feature files live in `.agents/tasks/task-vedella-multifarm-ai/features/`.

## FEAT-001 — Project scaffold, DB schema, seed, tooling (chore)
Next.js + TS + Tailwind + Prisma/SQLite + Zod + Vitest + Playwright. Prisma schema with
all entities and integrity constraints. Seed two fantasy farms, packs, cuts, lots, one
active cycle. `.env.example`, `.gitignore`, README skeleton, pricing lib + unit tests.
Baseline: install, migrate, seed, build, test all green.

## FEAT-002 — Marketplace, farm pages, search, basket, reservation, i18n, payment seam (feat)
Homepage (approved+active farms), `/farms/[slug]`, search bar, product/pack/cut views,
basket with discount tiers + delivery fee, reservation flow (cycle places, pay-on-delivery
seam), ca/es/en i18n + switcher. Integration tests for integrity invariants + no-oversell.

## FEAT-003 — AI layer: provider abstraction, translation, weekly metrics, receipt intake (feat)
AiProvider + MockAiProvider + real provider (env-only key), feature flags, Zod schemas,
guardrail filter, audit log, injection sanitizer. Translation (human-review), weekly
market-price metric, receipt upload → pre-filled review form. Unit tests for all guardrails
and mock determinism. App runs fully with no key.

## FEAT-004 — Admin area: roles, review/approval queue, lifecycle, metrics dashboard (feat)
Role-gated admin, review queue (approve/reject farms/products + AI translations),
lifecycle transitions (human-only), metrics dashboard incl. weekly avg market price,
receipt review UI. E2E flows (browse→reserve, admin approve, language switch).

## FEAT-005 — Devil's-advocate hardening pass + docs + final verification (refactor/docs)
Act on the severe self-critique and semantic review: close guardrail/integrity gaps,
tighten tests, finalize README (run/seed/test), confirm full suite green and zero-config
offline run.
