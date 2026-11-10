/**
 * Google Gemini provider unit + factory tests. NO network: `fetch` is stubbed
 * with `vi.stubGlobal` and returns a canned `:generateContent` response, so
 * nothing ever leaves the process.
 *
 * Covers:
 *  - valid JSON candidate -> schema passes and returns a typed result;
 *  - malformed JSON candidate -> the Zod parse throws (caller falls back);
 *  - a forbidden field in the output -> stripped by applyGuardrails;
 *  - createGeminiProvider throws when no key, and the key never appears in the
 *    thrown error message (nor anywhere the provider serializes);
 *  - a non-2xx response throws with the STATUS only (no body/key echo);
 *  - the factory returns isReal=true/name='gemini' with AI_PROVIDER='gemini' +
 *    key + flag, and the mock (isReal=false) with no key.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { createGeminiProvider } from "../../src/lib/ai/gemini-provider";
import { getAiProvider } from "../../src/lib/ai/provider";
import { applyGuardrails } from "../../src/lib/ai/guardrails";

const SECRET = "AIza-super-secret-key-value";

/** Build a fake Gemini `:generateContent` response whose candidate text is `text`. */
function geminiResponse(text: string, ok = true, status = 200): Response {
  const body = {
    candidates: [{ content: { parts: [{ text }] } }],
  };
  return {
    ok,
    status,
    json: async () => body,
  } as unknown as Response;
}

const keyEnv = {
  DATABASE_URL: "file:./ignore.db",
  GEMINI_API_KEY: SECRET,
} as unknown as NodeJS.ProcessEnv;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("createGeminiProvider construction", () => {
  it("throws when no key is present, and the error never contains key material", () => {
    let message = "";
    try {
      createGeminiProvider({ DATABASE_URL: "file:./x" } as NodeJS.ProcessEnv);
      throw new Error("should not reach here");
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    }
    expect(message).toMatch(/refusing to build a real provider/i);
    // A blank/whitespace key is also treated as absent.
    expect(() =>
      createGeminiProvider({
        DATABASE_URL: "file:./x",
        GEMINI_API_KEY: "   ",
        AI_API_KEY: "",
      } as NodeJS.ProcessEnv),
    ).toThrow();
  });

  it("builds with GEMINI_API_KEY and reports name/model/promptVersion; never leaks the key", () => {
    const p = createGeminiProvider(keyEnv);
    expect(p.name).toBe("gemini");
    expect(p.model).toBe("gemini-1.5-flash");
    expect(p.promptVersion).toBe("gemini-1");
    // The key must not be reachable via serialization of the provider object.
    expect(JSON.stringify(p)).not.toContain(SECRET);
  });

  it("accepts AI_API_KEY as a fallback key and honours GEMINI_MODEL override", () => {
    const p = createGeminiProvider({
      DATABASE_URL: "file:./x",
      AI_API_KEY: SECRET,
      GEMINI_MODEL: "gemini-1.5-pro",
    } as NodeJS.ProcessEnv);
    expect(p.name).toBe("gemini");
    expect(p.model).toBe("gemini-1.5-pro");
  });
});

describe("GeminiProvider.translate (mocked fetch)", () => {
  it("parses a valid JSON candidate into a typed TranslationResult", async () => {
    const fetchMock = vi.fn(async () =>
      geminiResponse(
        JSON.stringify({
          items: [
            { locale: "es", text: "Entrecot madurado" },
            { locale: "en", text: "Aged ribeye" },
          ],
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const p = createGeminiProvider(keyEnv);
    const result = await p.translate({
      sourceText: "Entrecot madurat",
      targetLocales: ["es", "en"],
      inputRef: "product:1:name",
    });
    expect(result.items).toHaveLength(2);
    expect(result.items.find((i) => i.locale === "en")?.text).toBe("Aged ribeye");

    // The request hit the Generative Language endpoint for the chosen model and
    // carried the key ONLY in the x-goog-api-key header (never in the URL).
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("models/gemini-1.5-flash:generateContent");
    expect(url).not.toContain(SECRET);
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe(SECRET);
  });

  it("throws when the candidate text is not valid JSON (safe fallback at caller)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => geminiResponse("not-json {{{")),
    );
    const p = createGeminiProvider(keyEnv);
    await expect(
      p.translate({
        sourceText: "x",
        targetLocales: ["es"],
        inputRef: "product:1:name",
      }),
    ).rejects.toThrow();
  });

  it("throws when the JSON is well-formed but violates the schema", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => geminiResponse(JSON.stringify({ items: [] }))),
    );
    const p = createGeminiProvider(keyEnv);
    await expect(
      p.translate({
        sourceText: "x",
        targetLocales: ["es"],
        inputRef: "product:1:name",
      }),
    ).rejects.toThrow();
  });

  it("throws with the STATUS only on a non-2xx response (no body/key echo)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => geminiResponse("irrelevant", false, 429)),
    );
    const p = createGeminiProvider(keyEnv);
    let message = "";
    try {
      await p.translate({
        sourceText: "x",
        targetLocales: ["es"],
        inputRef: "product:1:name",
      });
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    }
    expect(message).toContain("429");
    expect(message).not.toContain(SECRET);
    expect(message).not.toContain("irrelevant");
  });
});

describe("GeminiProvider output + guardrails", () => {
  it("a forbidden field in the model output is stripped by applyGuardrails", async () => {
    // A hostile model returns a valid assistant shape but smuggles a price and
    // an approval flag. The schema parse keeps known keys; applyGuardrails then
    // strips any price/approval field at any depth.
    const hostile = {
      assistant: "farmProfileDraft",
      summary: "A short profile.",
      priceCents: 100, // forbidden
      isApproved: true, // forbidden
      fields: [
        {
          field: "story",
          suggestion: "Grass-fed herd.",
          evidence: { sourceRef: "farm:1:notes", needsEvidence: false },
          discount: 10, // forbidden, nested
        },
      ],
      notes: "",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => geminiResponse(JSON.stringify(hostile))),
    );
    const p = createGeminiProvider(keyEnv);
    const draft = await p.draftFarmProfile({
      facts: { name: "Farm A" },
      inputRef: "farm:1",
    });
    // Defence-in-depth layer 1: the strict Zod parse inside the provider already
    // drops unknown keys, so the typed result carries no forbidden field.
    const serializedProvider = JSON.stringify(draft).toLowerCase();
    expect(serializedProvider).not.toContain("price");
    expect(serializedProvider).not.toContain("discount");
    expect(serializedProvider).not.toContain("isapproved");
    expect(draft.fields[0].suggestion).toBe("Grass-fed herd.");

    // Defence-in-depth layer 2: even if a forbidden field reached applyGuardrails
    // (e.g. a schema that permitted passthrough), it is stripped at any depth.
    const { value: safe, report } = applyGuardrails(hostile);
    const serialized = JSON.stringify(safe).toLowerCase();
    expect(serialized).not.toContain("price");
    expect(serialized).not.toContain("discount");
    expect(serialized).not.toContain("isapproved");
    expect(report.strippedFields).toEqual(
      expect.arrayContaining(["priceCents", "isApproved", "discount"]),
    );
  });
});

describe("getAiProvider factory with Gemini", () => {
  it("returns the Gemini provider (isReal, name='gemini') with provider+key+flag", async () => {
    // No fetch needed: the factory only CONSTRUCTS the provider.
    const { provider, isReal, flagEnabled } = await getAiProvider("translate", {
      DATABASE_URL: "file:./ignore.db",
      AI_PROVIDER: "gemini",
      GEMINI_API_KEY: SECRET,
      AI_TRANSLATION_ENABLED: "true",
    } as unknown as NodeJS.ProcessEnv);
    expect(isReal).toBe(true);
    expect(flagEnabled).toBe(true);
    expect(provider.name).toBe("gemini");
  });

  it("falls back to the mock when AI_PROVIDER='gemini' but no key is present", async () => {
    const { provider, isReal } = await getAiProvider("translate", {
      DATABASE_URL: "file:./ignore.db",
      AI_PROVIDER: "gemini",
      AI_TRANSLATION_ENABLED: "true",
      // no key under either name
    } as unknown as NodeJS.ProcessEnv);
    expect(isReal).toBe(false);
    expect(provider.name).toBe("mock");
  });

  it("falls back to the mock when the flag is off even with a key", async () => {
    const { provider, isReal } = await getAiProvider("translate", {
      DATABASE_URL: "file:./ignore.db",
      AI_PROVIDER: "gemini",
      GEMINI_API_KEY: SECRET,
      AI_TRANSLATION_ENABLED: "false",
    } as unknown as NodeJS.ProcessEnv);
    expect(isReal).toBe(false);
    expect(provider.name).toBe("mock");
  });

  it("reports hasApiKey=true when only GEMINI_API_KEY is set (presence-only)", async () => {
    const { readAiConfig } = await import("../../src/lib/ai/provider");
    const cfg = readAiConfig({
      DATABASE_URL: "file:./ignore.db",
      GEMINI_API_KEY: SECRET,
    } as unknown as NodeJS.ProcessEnv);
    expect(cfg.hasApiKey).toBe(true);
    // The config object must never carry the key value.
    expect(JSON.stringify(cfg)).not.toContain(SECRET);
  });
});
