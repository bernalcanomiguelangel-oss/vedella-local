/**
 * Zod schema rejection tests: malformed AI JSON must fail validation so callers
 * fall back safely (never crash, never persist garbage).
 */
import { describe, expect, it } from "vitest";
import {
  TranslationResultSchema,
  ReceiptExtractionSchema,
  MetricsSummarySchema,
} from "../../src/lib/ai/schemas";

describe("TranslationResultSchema", () => {
  it("rejects missing items", () => {
    expect(TranslationResultSchema.safeParse({}).success).toBe(false);
  });
  it("rejects an unsupported locale", () => {
    const bad = { items: [{ locale: "fr", text: "Bonjour" }] };
    expect(TranslationResultSchema.safeParse(bad).success).toBe(false);
  });
  it("rejects empty text", () => {
    const bad = { items: [{ locale: "en", text: "" }] };
    expect(TranslationResultSchema.safeParse(bad).success).toBe(false);
  });
  it("accepts a valid payload", () => {
    const ok = { items: [{ locale: "en", text: "Ribeye" }] };
    expect(TranslationResultSchema.safeParse(ok).success).toBe(true);
  });
});

describe("ReceiptExtractionSchema", () => {
  it("rejects non-object / malformed JSON shape", () => {
    expect(ReceiptExtractionSchema.safeParse("not json").success).toBe(false);
    expect(ReceiptExtractionSchema.safeParse({ farmName: "x" }).success).toBe(
      false,
    );
  });
  it("rejects negative units", () => {
    const base = {
      value: null,
      evidence: { sourceRef: null, needsEvidence: true },
    };
    const bad = {
      farmName: base,
      productName: base,
      lotReference: base,
      units: { value: -5, evidence: { sourceRef: null, needsEvidence: true } },
      slaughterDate: base,
      cuttingDate: base,
      packingDate: base,
      expiryDate: base,
    };
    expect(ReceiptExtractionSchema.safeParse(bad).success).toBe(false);
  });
});

describe("MetricsSummarySchema", () => {
  it("rejects a missing headline", () => {
    expect(
      MetricsSummarySchema.safeParse({ weekStart: "2026-01-05" }).success,
    ).toBe(false);
  });
  it("accepts a valid summary", () => {
    const ok = {
      weekStart: "2026-01-05",
      headline: "Observed averages.",
      perCut: [{ cutName: "Entrecot", avgPriceCents: 1438, sampleCount: 2 }],
    };
    expect(MetricsSummarySchema.safeParse(ok).success).toBe(true);
  });
});
