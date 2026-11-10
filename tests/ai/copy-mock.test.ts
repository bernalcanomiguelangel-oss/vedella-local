/**
 * MockAiProvider proposeCopy + judgeCopy: deterministic, offline, grounded.
 * No DB, no key — the mock is the offline demo path for the A/B-testing loop.
 */
import { describe, expect, it } from "vitest";
import { MockAiProvider } from "../../src/lib/ai/mock-provider";
import { CopyProposalSchema, JudgeVerdictSchema } from "../../src/lib/ai/schemas";

const mock = new MockAiProvider();

const FACTS = {
  publicName: "Entrecot madurat",
  canonicalName: "Entrecot",
  maturationDays: 21,
  packagingMethod: "al buit",
  storageState: "chilled",
  minimumShelfLifeDays: 14,
};

describe("MockAiProvider.proposeCopy", () => {
  it("is deterministic, schema-valid, and grounded only in provided facts", async () => {
    const a = await mock.proposeCopy({
      facts: FACTS,
      locale: "ca",
      count: 2,
      inputRef: "offer:1:ca",
      humanExamples: [],
    });
    const b = await mock.proposeCopy({
      facts: FACTS,
      locale: "ca",
      count: 2,
      inputRef: "offer:1:ca",
      humanExamples: [],
    });
    expect(a).toEqual(b); // deterministic
    expect(() => CopyProposalSchema.parse(a)).not.toThrow();
    expect(a.variants.length).toBe(2);
    // Every variant references the product name (a provided fact), no price.
    for (const v of a.variants) {
      expect(v.text).toContain("Entrecot");
      expect(JSON.stringify(v).toLowerCase()).not.toMatch(/price|€|eur\//);
      expect(v.evidence.length).toBeGreaterThan(0);
    }
  });

  it("never emits a fabricated/medical/scarcity claim from clean facts", async () => {
    const r = await mock.proposeCopy({
      facts: FACTS,
      locale: "en",
      count: 3,
      inputRef: "offer:1:en",
      humanExamples: [],
    });
    const joined = r.variants.map((v) => v.text.toLowerCase()).join(" ");
    expect(joined).not.toMatch(/certified|organic|cure|medicinal|last units|limited stock/);
  });
});

describe("MockAiProvider.judgeCopy", () => {
  it("PASS for a grounded description, schema-valid", async () => {
    const v = await mock.judgeCopy({
      variantText: "Entrecot. Maduració (dies): 21. Envàs: al buit.",
      locale: "ca",
      facts: FACTS,
      rules: ["Must mention maturation."],
      humanExamples: [],
      inputRef: "copyVariant:1",
    });
    expect(() => JudgeVerdictSchema.parse(v)).not.toThrow();
    expect(v.verdict).toBe("PASS");
    expect(v.reason.length).toBeGreaterThan(0);
  });

  it("FAIL when a fabricated/medical/scarcity claim is present", async () => {
    const v = await mock.judgeCopy({
      variantText: "Entrecot certified organic, cures illness, only last units left!",
      locale: "en",
      facts: FACTS,
      rules: [],
      humanExamples: [],
      inputRef: "copyVariant:2",
    });
    expect(v.verdict).toBe("FAIL");
  });

  it("UNKNOWN (safe) for empty text", async () => {
    const v = await mock.judgeCopy({
      variantText: "   ",
      locale: "ca",
      facts: FACTS,
      rules: [],
      humanExamples: [],
      inputRef: "copyVariant:3",
    });
    expect(v.verdict).toBe("UNKNOWN");
  });

  it("FAIL when the variant matches a previously-rejected human example (learned)", async () => {
    const rejectedText = "Entrecot amb un to massa comercial.";
    const v = await mock.judgeCopy({
      variantText: rejectedText,
      locale: "ca",
      facts: FACTS,
      rules: [],
      humanExamples: [
        {
          offerContext: "{}",
          variantText: rejectedText,
          verdict: "reject",
          reason: "To massa comercial.",
          editedText: null,
        },
      ],
      inputRef: "copyVariant:4",
    });
    expect(v.verdict).toBe("FAIL");
    expect(v.reason.toLowerCase()).toContain("rejected");
  });
});
