/**
 * MockAiProvider determinism + schema conformance. These run with no DB and no
 * key: the mock is the offline demo path.
 */
import { describe, expect, it } from "vitest";
import { MockAiProvider } from "../../src/lib/ai/mock-provider";
import {
  TranslationResultSchema,
  ReceiptExtractionSchema,
  MetricsSummarySchema,
} from "../../src/lib/ai/schemas";

const mock = new MockAiProvider();

describe("MockAiProvider.translate", () => {
  it("is deterministic and locale-tagged, and validates against the schema", async () => {
    const input = {
      sourceText: "Entrecot madurat",
      targetLocales: ["es", "en"] as const,
      inputRef: "product:1:name",
    };
    const a = await mock.translate({ ...input, targetLocales: ["es", "en"] });
    const b = await mock.translate({ ...input, targetLocales: ["es", "en"] });
    expect(a).toEqual(b); // deterministic

    expect(() => TranslationResultSchema.parse(a)).not.toThrow();
    expect(a.items.find((i) => i.locale === "es")?.text).toContain("[ES]");
    expect(a.items.find((i) => i.locale === "en")?.text).toContain("[EN]");
  });
});

describe("MockAiProvider.extractReceipt", () => {
  it("returns fixed, schema-valid fields and never includes a price field", async () => {
    const r = await mock.extractReceipt({
      bytes: new Uint8Array([1, 2, 3]),
      filename: "receipt.pdf",
      mimeType: "application/pdf",
    });
    expect(() => ReceiptExtractionSchema.parse(r)).not.toThrow();
    // No price field anywhere in the extraction (AI never prices).
    expect(JSON.stringify(r).toLowerCase()).not.toContain("price");
    // Deterministic
    const r2 = await mock.extractReceipt({
      bytes: new Uint8Array([9]),
      filename: "receipt.pdf",
      mimeType: "application/pdf",
    });
    expect(r2.farmName.value).toBe(r.farmName.value);
  });
});

describe("MockAiProvider.summarizeMetrics", () => {
  it("echoes server numbers verbatim and validates", async () => {
    const perCut = [
      { cutName: "Entrecot", avgPriceCents: 1438, sampleCount: 2 },
      { cutName: "Galta", avgPriceCents: 1035, sampleCount: 1 },
    ];
    const s = await mock.summarizeMetrics({ weekStart: "2026-01-05", perCut });
    expect(() => MetricsSummarySchema.parse(s)).not.toThrow();
    expect(s.perCut).toEqual(perCut); // numbers unchanged
    expect(s.weekStart).toBe("2026-01-05");
  });
});
