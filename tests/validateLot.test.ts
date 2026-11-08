import { describe, it, expect } from "vitest";
import {
  validateLot,
  LotValidationError,
  type LotInput,
} from "../src/lib/validateLot";

const product = { id: "prod-1", farmId: "farm-1" };

function baseLot(overrides: Partial<LotInput> = {}): LotInput {
  const day = 24 * 60 * 60 * 1000;
  const now = Date.now();
  return {
    farmId: "farm-1",
    productId: "prod-1",
    reference: "REF-0001",
    units: 10,
    slaughterDate: new Date(now - 30 * day),
    cuttingDate: new Date(now - 28 * day),
    packingDate: new Date(now - 27 * day),
    expiryDate: new Date(now + 10 * day),
    ...overrides,
  };
}

describe("validateLot", () => {
  it("accepts a valid lot", () => {
    expect(() => validateLot(baseLot(), { product })).not.toThrow();
  });

  it("rejects a product id mismatch", () => {
    expect(() =>
      validateLot(baseLot({ productId: "other" }), { product }),
    ).toThrowError(LotValidationError);
  });

  it("rejects a farm mismatch (R9)", () => {
    expect(() =>
      validateLot(baseLot({ farmId: "farm-2" }), { product }),
    ).toThrow(/FARM_MISMATCH|does not match product farmId/);
  });

  it("rejects negative units (R12)", () => {
    try {
      validateLot(baseLot({ units: -1 }), { product });
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(LotValidationError);
      expect((e as LotValidationError).code).toBe("NEGATIVE_UNITS");
    }
  });

  it("rejects non-integer units", () => {
    expect(() => validateLot(baseLot({ units: 1.5 }), { product })).toThrow(
      LotValidationError,
    );
  });

  it("rejects bad date order: packing after expiry (R10)", () => {
    const day = 24 * 60 * 60 * 1000;
    const bad = baseLot({
      packingDate: new Date(Date.now() + 20 * day),
      expiryDate: new Date(Date.now() + 10 * day),
    });
    try {
      validateLot(bad, { product });
      throw new Error("should have thrown");
    } catch (e) {
      expect((e as LotValidationError).code).toBe("BAD_DATE_ORDER");
    }
  });

  it("rejects bad date order: cutting before slaughter", () => {
    const day = 24 * 60 * 60 * 1000;
    const bad = baseLot({
      slaughterDate: new Date(Date.now() - 10 * day),
      cuttingDate: new Date(Date.now() - 20 * day),
    });
    expect(() => validateLot(bad, { product })).toThrow(LotValidationError);
  });

  it("rejects a duplicate reference (R11)", () => {
    const existing = new Set(["REF-0001"]);
    try {
      validateLot(baseLot({ reference: "REF-0001" }), {
        product,
        existingReferences: existing,
      });
      throw new Error("should have thrown");
    } catch (e) {
      expect((e as LotValidationError).code).toBe("DUPLICATE_REFERENCE");
    }
  });

  it("accepts a unique reference against existing set", () => {
    const existing = new Set(["REF-9999"]);
    expect(() =>
      validateLot(baseLot({ reference: "REF-0001" }), {
        product,
        existingReferences: existing,
      }),
    ).not.toThrow();
  });

  it("rejects an empty reference", () => {
    expect(() => validateLot(baseLot({ reference: "" }), { product })).toThrow(
      LotValidationError,
    );
  });
});
