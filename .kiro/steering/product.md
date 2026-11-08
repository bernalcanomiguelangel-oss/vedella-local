# Product steering: Vedella Local (multi-farm)

## What this is
Vedella Local is a curated marketplace of local, traceable Catalan beef. It evolves the
original single-farm reservation site (vedellalocal.lovable.app) into a **multi-farm
marketplace** where several approved farms list their products.

## Core user-facing concepts
- **Marketplace homepage**: lists active + approved farms and lets customers search.
- **Farm pages** (`/farms/[slug]`): show only that one farm's products, packs and cuts.
- **Packs**: curated bundles of cuts (Pack A · Descoberta, Pack B · Graella, Pack C ·
  Diari i cocció lenta) each listing included cuts with quantities.
- **Individual cuts**: sold at a +15% surcharge vs the pack unit price.
- **Traceability chain**: Granja (Farm) → Lot → Tall (Cut) → Paquet (Pack). A lot code is
  printed on each order.
- **Reservation cycle**: e.g. "Cicle novembre 2026" with zone, refrigerated transport,
  reservation close date, delivery date, and limited places (e.g. 37/50 free).
- **Reserve now, pay on delivery**: there is NO live payment. Payment is collected on
  delivery / on the spot.
- **Quantity discounts**: 3 units −2%, 5 units −3%, 8 units −5% (each pack counts as one
  unit; transport excluded). Delivery fee 6,00 €.
- **Languages**: Catalan (default), Spanish, English with a language switcher.

## Reference data to seed (fantasy, but faithful fidelity)
Two fantasy farms, each with the three packs and the individual cuts listed below, plus
lots and one active reservation cycle.

### Packs (base prices)
- Pack A · Descoberta — 42,00 € (~1500–1700 g)
- Pack B · Graella — 79,00 € (~2300–2600 g)
- Pack C · Diari i cocció lenta — 58,00 € (~3000–3300 g)

### Individual cuts (prices already include the +15% surcharge from the source)
- Entrecot — 14,38 €
- Llom baix — 12,65 €
- Hamburguesa 2u — 7,48 €
- Carn picada — 9,20 €
- Galta — 10,35 €
- Carn per estofar — 9,78 €
- Brou d'os 1L — 7,00 €
Each cut carries weight / thickness / maturation / packaging / shelf-life facts.

## Roles
- `platform_admin`: approves farms/products, manages the whole marketplace.
- `farm_manager`: manages their own farm's products/lots, uploads receipts.
- `customer`: browses, searches, reserves.

## Lifecycle (approval is SEPARATE from active)
States: `draft`, `pending_review`, `approved`, `active`, `inactive`, `rejected`,
`archived`. A record can be approved but not active; only a human moves records through
review/approval. AI never approves or publishes anything.

## Payment
Reservation-only, pay on delivery. Do NOT wire a payment provider. Keep a clean,
isolated payment seam/interface so a real provider can be added later without refactoring.
