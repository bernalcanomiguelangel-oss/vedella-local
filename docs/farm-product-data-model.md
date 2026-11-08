# Farm & product data model (target)

> Proposed target model vs the current `prisma/schema.prisma`. Read-only analysis; no
> schema change applied. Column names for existing tables are quoted from the real schema.

## 1. Current model (verbatim summary)

- `Farm(id, slug, name, town, comarca, breed, foundedYear, animalCount, story, lifecycle,
  isApproved, isActive, isTest, timestamps)`.
- `Product(id, farmId, kind["pack"|"cut"], name, description, basePriceCents, weight?,
  thickness?, maturation?, packaging?, shelfLife?, lifecycle, isApproved, isActive,
  isTest, timestamps)` with composite candidate key `@@unique([id, farmId])`.
- `PackItem(id, packProductId→Product, cutProductId→Product, quantity)`.
- `Lot(id, farmId, (productId, farmId)→Product composite FK, reference unique, units,
  isWithdrawn, isTest, slaughterDate, cuttingDate, packingDate, expiryDate)`.
- `ReservationCycle(id, name, zone, closeDate, deliveryDate, totalPlaces, freePlaces,
  transportNote, isActive, isTest)`.
- `Order(id, cycleId, customerId?, lotReferenceSnapshot, status, subtotalCents,
  discountCents, deliveryFeeCents, totalCents, isTest)`.
- `OrderItem(id, orderId, productId?, nameSnapshot, priceCentsSnapshot,
  lotReferenceSnapshot, quantity)`.
- `User, Translation, AiRun, AdminAudit, MarketPriceSnapshot`.

**Key observation:** `Product` conflates a reusable **definition** and a farm-specific
**offer**. "Entrecot" is two independent rows (one per farm) that share only a `name`
string. There is no `category`, `internal_sku`, structured weight/maturation/storage, or
per-cycle availability.

## 2. Target model

### 2.1 ProductDefinition (new — reusable, NOT sellable)
```
ProductDefinition {
  id            String @id
  canonicalName String            // e.g. "Entrecot"
  category      String            // cut category / family
  description   String @default("")
  defaultPrep   String @default("")
  translationKey String @unique   // for ca/es/en copy
  lifecycle     String @default("draft")   // human-managed; AI never approves
  isApproved    Boolean @default(false)
  isActive      Boolean @default(false)
  isTest        Boolean @default(false)
  timestamps
}
```
Managed by the platform; shared across farms. Not directly orderable.

### 2.2 FarmProductOffer (new — farm-specific, sellable)
```
FarmProductOffer {
  id                     String @id
  farmId                 String  -> Farm
  productDefinitionId    String  -> ProductDefinition
  publicName             String
  internalSku            String?
  description            String @default("")
  priceAmountCents       Int                 // integer cents (existing convention)
  priceUnit              String              // per_unit | per_kg | per_pack ...
  currency               String @default("EUR")
  expectedUnitWeightMinG Int?
  expectedUnitWeightMaxG Int?
  weightTolerancePercent Int?
  unitsPerPack           Int?
  thicknessMm            Int?
  maturationDays         Int?
  packagingMethod        String?
  storageState           String?             // chilled | frozen ...
  minimumShelfLifeDays   Int?
  pickupAvailable        Boolean @default(false)
  lifecycle              String @default("draft")
  isApproved             Boolean @default(false)
  isActive               Boolean @default(false)
  archivedAt             DateTime?
  isTest                 Boolean @default(false)
  timestamps
  @@unique([id, farmId])        // candidate key for composite FKs (mirrors Product today)
  @@index([farmId])
  @@index([productDefinitionId])
}
```
Note: the current free-text facts map to structured fields — `weight → expectedUnitWeight
Min/MaxG`, `thickness → thicknessMm`, `maturation → maturationDays`, `packaging →
packagingMethod`, `shelfLife → storageState + minimumShelfLifeDays`. The original strings
are preserved during migration (see migration plan) so nothing is lost if parsing fails.

### 2.3 Delivery methods & zones (new)
`DeliveryMethod(id, name, …)` and `DeliveryZone(id, name, …)`; join
`OfferDeliveryMethod(offerId, deliveryMethodId)` to model `delivery_method_ids`.

### 2.4 Pack & PackItem (evolve)
```
Pack { id, farmId?, isMultiFarm Boolean, publicName, ... lifecycle/approval/active/test }
PackItem { id, packId -> Pack, farmProductOfferId -> FarmProductOffer, farmId, lotId?,
           quantity }
```
Single-farm pack: `isMultiFarm=false`, all items share `farmId`. Multi-farm pack:
`isMultiFarm=true`, each item carries its own `farmId` (+ optional `lotId` for item-level
traceability). Publish gate: all referenced offers approved+active.

### 2.5 Offer ⟷ Cycle availability (new join)
```
CycleOfferAvailability { cycleId, farmProductOfferId, farmId, allocatedCapacity?, ... }
```
Answers "in which cycles is this offer available" and "which offers has no eligible lot".

### 2.6 Lot (re-point)
`Lot.productId` → `Lot.farmProductOfferId` (composite FK to `FarmProductOffer(id, farmId)`
to preserve the R9 "lot.farmId == offer.farmId" DB guarantee that exists today for
Product). Keep reference-unique, units≥0, and the date-ordering CHECK unchanged.

### 2.7 ReservationCycle (enrich)
Add: internalName, publicTitle, status, openAt, closeAt (keep closeDate semantics),
deliveryDate, pickupDate, zones (→ DeliveryZone), refrigeratedDescription,
deliveryPriceCents, totalCapacity (keep totalPlaces/freePlaces), publicCopy keys,
participating farms/packs/offers joins. Preserve existing fields; add new ones nullable.

### 2.8 Order & OrderItem (enrich + snapshot)
Add to `Order`: farm fulfilment grouping, attribution (channel, campaign, farm referral),
promisedDeliveryDate, deliveryMethod, pickup flag, expanded status enum (pending,
confirmed, awaiting_farm_confirmation, preparing, ready_for_pickup, out_for_delivery,
fulfilled, cancelled, refunded). Add to `OrderItem`: `farmProductOfferId`, `farmId`,
`productDefinitionId`, commercial snapshot (price, expected weight), actual weight at
fulfilment, lot snapshot. **Historical orders keep their existing snapshot columns** so
nothing breaks (R14). New `FulfilmentGroup(orderId, farmId, status)` for multi-farm split.

### 2.9 Incident (new)
```
Incident { id, reference, category, severity, description, reportedAt, ownerUserId?,
           status, correctiveAction?, resolution?, resolvedAt?,
           farmId?, productDefinitionId?, farmProductOfferId?, lotId?, packId?,
           cycleId?, orderId?, isTest, timestamps }
```

### 2.10 WebsiteText (new)
```
WebsiteText { id, pageKey, sectionKey, locale, draftText, publishedText?,
              charLimit?, lastEditorUserId?, lastPublishedAt?, timestamps
              @@unique([pageKey, sectionKey, locale]) }
```
Generic copy only; never operational facts.

### 2.11 Setting (new)
Key/value (or typed columns) for marketplace identity, languages, currency, timezone,
order-reference format, cycle defaults, notification toggles, feature flags, AI flags,
analytics consent + retention. **No secret values** (keys stay in `.env`; presence only).

### 2.12 AnalyticsEvent + ChannelAttribution (new)
Per `docs/analytics-dictionary.md` §2/§5. `AnalyticsEvent(id, type, anonSessionId,
customerId?, farmId?, definitionId?, offerId?, packId?, cycleId?, language?,
deliveryMethod?, channel?, campaign?, isTest, createdAt)`.
`ChannelAttribution(id, anonSessionId, firstTouchChannel, latestTouchChannel, utmSource?,
utmMedium?, utmCampaign?, farmReferralCode?, orderId?, createdAt)`.

## 3. Relationship map (target)

```
ProductDefinition 1───∞ FarmProductOffer ∞───1 Farm
FarmProductOffer 1───∞ Lot
FarmProductOffer 1───∞ PackItem ∞───1 Pack
FarmProductOffer ∞───∞ ReservationCycle (via CycleOfferAvailability)
FarmProductOffer ∞───∞ DeliveryMethod (via OfferDeliveryMethod)
Order 1───∞ OrderItem (snapshot: offer+farm+definition+lot)
Order 1───∞ FulfilmentGroup ∞───1 Farm
Incident ∞──→ {farm, definition, offer, lot, pack, cycle, order}
AnalyticsEvent / ChannelAttribution ──→ session (+ optional order)
```

## 4. Invariants to preserve or add (DB-enforced where possible)

- **R8/R9 analogue:** `offer.farmId` is set; `lot.farmId == offer.farmId` via composite FK
  (mirror the existing `Product(id, farmId)` → `Lot` composite FK pattern).
- **Offer isolation:** a `farm_manager` can only read/write offers/lots/packs/incidents of
  their own `farmId` (server-side scope + tested with Farm A / Farm B).
- **Lot dates/units/reference:** keep existing CHECKs and unique index.
- **No oversell:** keep the `freePlaces >= 0` CHECK + atomic decrement.
- **Human-only approval:** `lifecycle`/`isApproved`/`isActive` move only via human server
  actions with an `AdminAudit` row; AI never writes them.
- **Snapshots immutable:** order items keep a frozen commercial + traceability snapshot.
