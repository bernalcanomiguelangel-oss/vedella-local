# Design: Vedella Local — multi-farm marketplace with AI

## 1. Stack
- **Next.js (App Router) + TypeScript** — SSR marketplace/farm pages + route handlers.
- **Tailwind CSS** — warm pasture/beef palette, improved visuals over the original.
- **Prisma + SQLite** — zero external DB; seeds instantly; file at `prisma/dev.db`.
- **Zod** — validation of inputs and AI JSON output.
- **next-intl** (or a lightweight custom dictionary loader) for ca/es/en i18n.
- **Vitest** for unit/integration; **Playwright** for e2e (headless chromium).
Rationale: everything runs with `npm install` + `prisma migrate/seed` + `npm run dev`,
no external services.

## 2. Directory structure (target)
```
/projects/sandbox
  prisma/schema.prisma        # data model + constraints
  prisma/seed.ts              # two fantasy farms, packs, cuts, lots, 1 cycle
  src/app/                    # App Router routes
    [locale]/                 # locale-scoped marketplace pages
      page.tsx                # homepage: approved+active farms + search
      farms/[slug]/page.tsx   # single-farm catalog
      basket/page.tsx         # basket + reservation flow
    admin/                    # admin area (roles, review queue, metrics, receipts)
    api/                      # route handlers (search, basket, reserve, ai/*)
  src/lib/
    db.ts                     # Prisma client singleton
    pricing.ts                # discounts, delivery fee, +15% surcharge (NO AI)
    i18n/                     # dictionaries ca/es/en + loader
    payment/gateway.ts        # PaymentGateway seam (pay-on-delivery impl)
    ai/
      provider.ts             # AiProvider interface + config/flags + factory
      mock-provider.ts        # deterministic MockAiProvider
      openai-provider.ts      # real provider, key from env only (lazy)
      schemas.ts              # Zod schemas for each AI use case
      service.ts              # use-case functions: translate, metrics, receipt
      audit.ts                # AI run audit logging
      sanitize.ts             # wrap untrusted content as data (injection defense)
  src/components/             # UI: FarmCard, ProductCard, SearchBar, BasketWidget, ...
  tests/                      # vitest unit + integration
  e2e/                        # playwright specs
  .env.example                # placeholder names only
  README.md
```

## 3. Data model (Prisma)
Entities & key fields/constraints:
- **User**: id, email, role enum (`platform_admin|farm_manager|customer`), farmId?.
- **Farm**: id, slug (unique), name, town, comarca, breed, foundedYear, animalCount,
  story, lifecycle enum, isApproved, isActive, isTest(bool). managerId.
- **Product**: id, farmId (FK, required), kind (`pack|cut`), name, description,
  basePriceCents, weight/thickness/maturation/packaging/shelfLife fields, lifecycle,
  isApproved, isActive, isTest.
- **PackItem**: packProductId, cutProductId, quantity (links pack → included cuts).
- **Lot**: id, farmId (FK), productId (FK), reference (unique), units (>=0), isWithdrawn,
  isTest, slaughterDate, cuttingDate, packingDate, expiryDate.
  Enforce `lot.farmId == product.farmId`, date ordering, unique reference, units>=0.
- **ReservationCycle**: id, name, zone, closeDate, deliveryDate, totalPlaces, freePlaces,
  transportNote, isActive.
- **Order**: id, cycleId, customerId, lotReferenceSnapshot, status, totalCents,
  deliveryFeeCents, createdAt. **OrderItem** snapshots product name/price/lot ref so
  historical orders stay intact when products/lots change.
- **Translation**: entityType, entityId, field, locale, text, status
  (`machine|in_review|approved`), source. Publish uses only `approved` translations.
- **AiRun**: id, useCase, provider, model, promptVersion, flagEnabled, inputRef,
  outputValid(bool), outcome, createdAt (audit).
- **MarketPriceSnapshot**: cutName, weekStart, avgPriceCents, sampleCount, generatedBy.

Integrity enforcement strategy: Prisma schema for FKs + uniqueness + non-null; a shared
`validateLot()` guard (used by seed, API, tests) and (where supported) SQLite CHECK
constraints via migration SQL for date ordering and units>=0.

## 4. Pricing (deterministic, no AI)
`src/lib/pricing.ts`: unit = pack or cut line. Discount tiers by total unit count
(3→2%, 5→3%, 8→5%), transport excluded from discount, delivery fee 6,00 € (600 cents).
Cut price derivation helper documents the +15% surcharge relationship for reference; seed
uses the given cut prices directly.

## 5. AI layer
- `AiProvider` interface: `translate()`, `extractReceipt()`, `summarizeMetrics()`.
- Factory reads env: if `AI_API_KEY` present AND use-case flag on → real provider; else
  **MockAiProvider**. Flags: `AI_TRANSLATION_ENABLED`, `AI_METRICS_ENABLED`,
  `AI_RECEIPT_ENABLED` (default mock-friendly).
- Every call: build prompt with untrusted content wrapped as data (sanitize.ts), run,
  validate output with Zod (schemas.ts); on invalid/unavailable → safe fallback; write an
  AiRun audit record every time.
- **Guardrail filter**: post-process AI output to strip/deny price fields, flag
  unsourced factual claims as `needs-evidence`, and never set approval/active fields.
  Translation output is stored as `machine` status → requires human approval.
- MockAiProvider is deterministic: translations are rule-based string transforms with a
  locale tag; receipt extraction returns fixed structured fields from a fixture; metrics
  computes real averages from seeded lot/product prices per ISO week.

## 6. Payment seam
`PaymentGateway` interface with `createReservation(order)` returning a pay-on-delivery
intent (no charge). Isolated so a Stripe/other impl can be dropped in later. UI shows
"Reserva ara, paga a l'entrega".

## 7. i18n
Dictionaries `ca.json` (default), `es.json`, `en.json`. `[locale]` segment + switcher.
Content translations resolve from the `Translation` table (approved only) with fallback
to ca.

## 8. Security
`.gitignore` excludes `.env`, `dev.db`, `node_modules`, `.next`. `.env.example` lists
`AI_PROVIDER`, `AI_API_KEY=`, flags — no values. Keys read lazily only inside the real
provider. Uploaded files handled as bytes/data, never interpolated as instructions.

## 9. Testing
- Unit: pricing math, discount tiers, i18n fallback, guardrail filter, Zod schemas,
  MockAiProvider determinism, injection sanitizer.
- Integration: DB invariants R8–R15 (farm match, date ordering, unique ref, units>=0,
  withdrawn not offered, order snapshot immutability, test-flag metric exclusion),
  reservation never oversells.
- E2E (Playwright): browse homepage → open farm → search → add to basket → reserve;
  admin review queue approve flow; language switch.

## 10. Phased delivery (reversible, test after each; devil's-advocate review mid-build)
See tasks.md. Each phase leaves the app runnable and tests green.
