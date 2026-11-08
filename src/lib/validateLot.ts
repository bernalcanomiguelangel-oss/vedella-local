/**
 * Shared lot integrity guard. Used by the seed, API route handlers, and tests so
 * the same invariants are enforced everywhere (defence in depth alongside the DB
 * schema FKs/uniqueness and SQLite CHECK constraints).
 *
 * Invariants enforced (requirements R9-R12):
 *  - R9  lot.farmId === product.farmId
 *  - R10 slaughterDate <= cuttingDate <= packingDate < expiryDate
 *  - R11 lot reference is unique (checked against a provided set of existing refs)
 *  - R12 units >= 0
 */

export interface LotInput {
  farmId: string;
  productId: string;
  reference: string;
  units: number;
  slaughterDate: Date;
  cuttingDate: Date;
  packingDate: Date;
  expiryDate: Date;
}

export interface ProductRef {
  id: string;
  farmId: string;
}

export interface ValidateLotOptions {
  /** The product this lot belongs to; used to assert farm match (R9). */
  product: ProductRef;
  /**
   * References that already exist. If the lot's reference is present, the lot is
   * rejected as a duplicate (R11). Case-sensitive, exact match.
   */
  existingReferences?: Iterable<string>;
}

export class LotValidationError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "LotValidationError";
    this.code = code;
  }
}

function time(d: Date): number {
  const t = d instanceof Date ? d.getTime() : new Date(d).getTime();
  return t;
}

/**
 * Validate a lot. Throws LotValidationError on the first violation. Returns the
 * (unchanged) input on success so callers can use it inline.
 */
export function validateLot(lot: LotInput, opts: ValidateLotOptions): LotInput {
  // R9: farm match
  if (lot.productId !== opts.product.id) {
    throw new LotValidationError(
      "PRODUCT_MISMATCH",
      `Lot productId ${lot.productId} does not match product ${opts.product.id}.`,
    );
  }
  if (lot.farmId !== opts.product.farmId) {
    throw new LotValidationError(
      "FARM_MISMATCH",
      `Lot farmId ${lot.farmId} does not match product farmId ${opts.product.farmId}.`,
    );
  }

  // R12: units non-negative (and an integer)
  if (!Number.isInteger(lot.units) || lot.units < 0) {
    throw new LotValidationError(
      "NEGATIVE_UNITS",
      `Lot units must be a non-negative integer, got ${lot.units}.`,
    );
  }

  // R10: date ordering slaughter <= cutting <= packing < expiry
  const s = time(lot.slaughterDate);
  const c = time(lot.cuttingDate);
  const p = time(lot.packingDate);
  const e = time(lot.expiryDate);
  if (Number.isNaN(s) || Number.isNaN(c) || Number.isNaN(p) || Number.isNaN(e)) {
    throw new LotValidationError("BAD_DATE", "Lot has an invalid date.");
  }
  if (!(s <= c && c <= p && p < e)) {
    throw new LotValidationError(
      "BAD_DATE_ORDER",
      "Lot dates must satisfy slaughter <= cutting <= packing < expiry.",
    );
  }

  // R11: unique reference
  if (!lot.reference || lot.reference.trim() === "") {
    throw new LotValidationError("EMPTY_REFERENCE", "Lot reference is required.");
  }
  if (opts.existingReferences) {
    for (const ref of opts.existingReferences) {
      if (ref === lot.reference) {
        throw new LotValidationError(
          "DUPLICATE_REFERENCE",
          `Lot reference ${lot.reference} already exists.`,
        );
      }
    }
  }

  return lot;
}
