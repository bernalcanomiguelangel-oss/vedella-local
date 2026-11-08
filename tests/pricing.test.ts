import { describe, it, expect } from "vitest";
import {
  priceBasket,
  discountRateForUnits,
  cutPriceFromPackUnit,
  formatCents,
  DELIVERY_FEE_CENTS,
  CUT_SURCHARGE_RATE,
} from "../src/lib/pricing";

describe("discountRateForUnits", () => {
  it("applies no discount below 3 units", () => {
    expect(discountRateForUnits(0)).toBe(0);
    expect(discountRateForUnits(1)).toBe(0);
    expect(discountRateForUnits(2)).toBe(0);
  });

  it("applies 2% from 3 units", () => {
    expect(discountRateForUnits(3)).toBe(0.02);
    expect(discountRateForUnits(4)).toBe(0.02);
  });

  it("applies 3% from 5 units", () => {
    expect(discountRateForUnits(5)).toBe(0.03);
    expect(discountRateForUnits(7)).toBe(0.03);
  });

  it("applies 5% from 8 units", () => {
    expect(discountRateForUnits(8)).toBe(0.05);
    expect(discountRateForUnits(20)).toBe(0.05);
  });
});

describe("priceBasket", () => {
  it("handles an empty basket with no delivery fee", () => {
    const r = priceBasket([]);
    expect(r.unitCount).toBe(0);
    expect(r.subtotalCents).toBe(0);
    expect(r.deliveryFeeCents).toBe(0);
    expect(r.totalCents).toBe(0);
  });

  it("adds a flat delivery fee and no discount below 3 units", () => {
    const r = priceBasket([{ unitPriceCents: 4200, quantity: 2 }]);
    expect(r.unitCount).toBe(2);
    expect(r.subtotalCents).toBe(8400);
    expect(r.discountRate).toBe(0);
    expect(r.discountCents).toBe(0);
    expect(r.deliveryFeeCents).toBe(DELIVERY_FEE_CENTS);
    expect(r.totalCents).toBe(8400 + 600);
  });

  it("applies the 2% tier at 3 units (each pack counts as one unit)", () => {
    const r = priceBasket([{ unitPriceCents: 4200, quantity: 3 }]);
    expect(r.unitCount).toBe(3);
    expect(r.subtotalCents).toBe(12600);
    expect(r.discountRate).toBe(0.02);
    expect(r.discountCents).toBe(252); // round(12600 * 0.02)
    expect(r.totalCents).toBe(12600 - 252 + 600);
  });

  it("applies the 5% tier at 8 units across mixed lines", () => {
    const r = priceBasket([
      { unitPriceCents: 4200, quantity: 5 }, // 5 packs
      { unitPriceCents: 1438, quantity: 3 }, // 3 cuts
    ]);
    expect(r.unitCount).toBe(8);
    const subtotal = 4200 * 5 + 1438 * 3;
    expect(r.subtotalCents).toBe(subtotal);
    expect(r.discountRate).toBe(0.05);
    expect(r.discountCents).toBe(Math.round(subtotal * 0.05));
    expect(r.totalCents).toBe(subtotal - Math.round(subtotal * 0.05) + 600);
  });

  it("excludes the delivery fee from the discount", () => {
    const r = priceBasket([{ unitPriceCents: 1000, quantity: 5 }]);
    // Discount computed only on 5000, not 5600.
    expect(r.discountCents).toBe(Math.round(5000 * 0.03));
  });
});

describe("cutPriceFromPackUnit", () => {
  it("applies a +15% surcharge rounded to the nearest cent", () => {
    expect(CUT_SURCHARGE_RATE).toBe(0.15);
    expect(cutPriceFromPackUnit(1000)).toBe(1150);
    expect(cutPriceFromPackUnit(1251)).toBe(Math.round(1251 * 1.15));
  });
});

describe("formatCents", () => {
  it("formats cents as a Catalan euro string", () => {
    expect(formatCents(4200)).toBe("42,00 €");
    expect(formatCents(1438)).toBe("14,38 €");
    expect(formatCents(600)).toBe("6,00 €");
  });
});
