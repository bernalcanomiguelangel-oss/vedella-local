# Vedella Local

A multi-farm, traceable Catalan beef **marketplace**. Several approved farms list
their packs and individual cuts; customers browse, search, and **reserve now, pay on
delivery** within an active reservation cycle. The platform ships with a safe,
provider-abstracted AI layer that runs **fully offline** with a deterministic mock
provider.

> Prices are stored as integer cents. Catalan (`ca`) is the default language, with
> Spanish (`es`) and English (`en`) available.

## Stack

- **Next.js (App Router) + TypeScript**
- **Tailwind CSS** — warm pasture/beef palette
- **Prisma + SQLite** — zero external services; DB file at `prisma/dev.db`
- **Zod** — input and AI-output validation
- **Vitest** (unit/integration) + **Playwright** (e2e)

## Requirements

- Node.js 22+
- npm 11+

## Getting started

```bash
# 1. Install dependencies
npm install

# 2. Configure environment (defaults run fully offline with the mock AI provider)
cp .env.example .env

# 3. Create the SQLite database and generate the Prisma client
npx prisma db push

# 4. Seed two fantasy farms, packs, cuts, lots, and one active reservation cycle
npm run seed

# 5. Run the dev server
npm run dev
```

The app runs end-to-end with **no API key**. A real AI provider is only used when
`AI_API_KEY` is set *and* the relevant feature flag is enabled.

## Scripts

| Script             | Description                                      |
| ------------------ | ------------------------------------------------ |
| `npm run dev`      | Start the Next.js dev server                     |
| `npm run build`    | Generate the Prisma client and build the app     |
| `npm start`        | Start the production server                      |
| `npm run seed`     | Seed the database (`prisma/seed.ts`)             |
| `npm test`         | Run unit/integration tests (Vitest)              |
| `npm run test:e2e` | Run end-to-end tests (Playwright)                |

## Seeded data

Two approved + active fantasy farms (**Mas Vallgorguina**, **Cal Serrat del Bosc**),
each with:

- Three packs: `Pack A · Descoberta` (42,00 €), `Pack B · Graella` (79,00 €),
  `Pack C · Diari i cocció lenta` (58,00 €)
- Seven individual cuts (prices already include the +15% surcharge): Entrecot
  (14,38 €), Llom baix (12,65 €), Hamburguesa 2u (7,48 €), Carn picada (9,20 €),
  Galta (10,35 €), Carn per estofar (9,78 €), Brou d'os 1L (7,00 €)
- Pack items, valid lots with unique references, and one active cycle
  (`Cicle novembre 2026`, Vallès Oriental, 37/50 places free).

## Security & AI

- API keys are read **only** from a git-ignored `.env`. `.env.example` carries
  placeholder names and no real values. A leaked key is treated as compromised and is
  never used, hardcoded, logged, or stored.
- The AI layer is server-side only and provider-abstracted. It never sets prices,
  approves or publishes records, or creates traceability on its own. (AI use cases
  land in later features.)

## Payment

Reservation only: **pay on delivery / on the spot**. No payment provider is wired; a
clean `PaymentGateway` seam is kept so a real provider can be added later without
refactoring.
