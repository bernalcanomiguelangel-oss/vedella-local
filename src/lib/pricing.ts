/**
 * Deterministic pricing for Vedella Local. NO AI is involved here — prices are
 * never set, personalized, or adjusted by any model (ai-guardrails steering).
 *
 * All monetary values are integer cents.
 *
 * Business rules (product steering):
 *  - Quantity discount tiers by total UNIT count (each pack counts as one unit,
 *    each individual cut line counts by its quantity):
 *      >= 3 units -> -2%
 *      >= 5 units -> -3%
 *      >= 8 units -> -5%
 *    The highest qualifying tier applies. Transport is excluded from the discount.
 *  - Delivery fee: 6,00 € => 600 cents.
 *  - Individual cuts are sold at a +15% surcharge vs the pack unit price. The seed
 *    stores the already-surcharged cut prices directly; the helper below documents
 *    and reproduces that relationship for reference and validation.
 */

export const DELIVERY_FEE_CENTS = 600;

/** The surcharge applied to individual cuts relative to the pack unit price. */
export const CUT_SURCHARGE_RATE = 0.15;

export interface DiscountTier {
  /** Minimum number of units required for this tier. */
  minUnits: number;
  /** Discount rate as a fraction (0.02 = 2%). */
  rate: number;
}

/** Ordered ascending by minUnits. The highest qualifying tier wins. */
export const DISCOUNT_TIERS: readonly DiscountTier[] = [
  { minUnits: 3, rate: 0.02 },
  { minUnits: 5, rate: 0.03 },
  { minUnits: 8, rate: 0.05 },
] as const;

export interface BasketLine {
  /** Unit price in cents (pack base price or cut price). */
  unitPriceCents: number;
  /** Quantity of this line. Each pack or cut quantity counts as one unit. */
  quantity: number;
}

export interface PricingResult {
  /** Total unit count across all lines (drives the discount tier). */
  unitCount: number;
  /** Sum of line prices before discount. */
  subtotalCents: number;
  /** Applied discount rate (0 when no tier qualifies). */
  discountRate: number;
  /** Discount amount in cents (rounded). */
  discountCents: number;
  /** Delivery fee in cents (flat, excluded from discount). */
  deliveryFeeCents: number;
  /** Final total: subtotal - discount + delivery fee. */
  totalCents: number;
}

/**
 * Returns the discount rate for a given number of units. Picks the highest
 * tier whose threshold is met. Returns 0 when no tier qualifies.
 */
export function discountRateForUnits(unitCount: number): number {
  let rate = 0;
  for (const tier of DISCOUNT_TIERS) {
    if (unitCount >= tier.minUnits) {
      rate = tier.rate;
    }
  }
  return rate;
}

/**
 * Derive an individual cut price from a pack unit price by applying the +15%
 * surcharge. Rounds to the nearest cent. Documents the pricing relationship;
 * seeds use the already-surcharged prices directly.
 */
export function cutPriceFromPackUnit(packUnitPriceCents: number): number {
  return Math.round(packUnitPriceCents * (1 + CUT_SURCHARGE_RATE));
}

/**
 * Compute the full price breakdown for a basket. Deterministic and pure.
 */
export function priceBasket(lines: BasketLine[]): PricingResult {
  const unitCount = lines.reduce((sum, l) => sum + l.quantity, 0);
  const subtotalCents = lines.reduce(
    (sum, l) => sum + l.unitPriceCents * l.quantity,
    0,
  );

  const discountRate = discountRateForUnits(unitCount);
  const discountCents = Math.round(subtotalCents * discountRate);

  // Delivery fee is flat and excluded from the discount. An empty basket has
  // no delivery fee.
  const deliveryFeeCents = unitCount > 0 ? DELIVERY_FEE_CENTS : 0;

  const totalCents = subtotalCents - discountCents + deliveryFeeCents;

  return {
    unitCount,
    subtotalCents,
    discountRate,
    discountCents,
    deliveryFeeCents,
    totalCents,
  };
}

/** Format integer cents as a Catalan-style euro string, e.g. 4200 -> "42,00 €". */
export function formatCents(cents: number): string {
  const euros = (cents / 100).toFixed(2).replace(".", ",");
  return `${euros} €`;
}
