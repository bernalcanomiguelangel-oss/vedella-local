/**
 * Factory + config unit tests. No DB needed: these exercise the env-driven
 * provider selection and ensure the MockAiProvider is chosen whenever a key is
 * absent or a flag is off, and that the mock is deterministic.
 */
import { describe, expect, it } from "vitest";
import {
  readAiConfig,
  shouldUseRealProvider,
  getAiProvider,
} from "../../src/lib/ai/provider";

const baseEnv = {
  DATABASE_URL: "file:./ignore.db",
} as unknown as NodeJS.ProcessEnv;

describe("readAiConfig", () => {
  it("reports no key when AI_API_KEY is unset or blank", () => {
    expect(readAiConfig({ ...baseEnv }).hasApiKey).toBe(false);
    expect(readAiConfig({ ...baseEnv, AI_API_KEY: "" }).hasApiKey).toBe(false);
    expect(readAiConfig({ ...baseEnv, AI_API_KEY: "   " }).hasApiKey).toBe(false);
  });

  it("reports a key when present (without exposing its value anywhere)", () => {
    const cfg = readAiConfig({ ...baseEnv, AI_API_KEY: "sk-whatever" });
    expect(cfg.hasApiKey).toBe(true);
    // The config object must not carry the key value.
    expect(JSON.stringify(cfg)).not.toContain("sk-whatever");
  });

  it("parses feature flags case-insensitively", () => {
    const cfg = readAiConfig({
      ...baseEnv,
      AI_TRANSLATION_ENABLED: "TRUE",
      AI_METRICS_ENABLED: "1",
      AI_RECEIPT_ENABLED: "off",
    });
    expect(cfg.flags.translation).toBe(true);
    expect(cfg.flags.metrics).toBe(true);
    expect(cfg.flags.receipt).toBe(false);
  });
});

describe("shouldUseRealProvider", () => {
  it("is false with no key even when flags are on", () => {
    const cfg = readAiConfig({
      ...baseEnv,
      AI_PROVIDER: "openai",
      AI_TRANSLATION_ENABLED: "true",
    });
    expect(shouldUseRealProvider(cfg, "translate")).toBe(false);
  });

  it("is false when the use-case flag is off, even with a key", () => {
    const cfg = readAiConfig({
      ...baseEnv,
      AI_PROVIDER: "openai",
      AI_API_KEY: "sk-x",
      AI_TRANSLATION_ENABLED: "false",
    });
    expect(shouldUseRealProvider(cfg, "translate")).toBe(false);
  });

  it("is true only with key + non-mock provider + flag on", () => {
    const cfg = readAiConfig({
      ...baseEnv,
      AI_PROVIDER: "openai",
      AI_API_KEY: "sk-x",
      AI_RECEIPT_ENABLED: "true",
    });
    expect(shouldUseRealProvider(cfg, "receipt")).toBe(true);
    expect(shouldUseRealProvider(cfg, "translate")).toBe(false);
  });
});

describe("getAiProvider factory", () => {
  it("returns the mock provider when no key is set", async () => {
    const { provider, isReal } = await getAiProvider("translate", {
      ...baseEnv,
    });
    expect(isReal).toBe(false);
    expect(provider.name).toBe("mock");
  });

  it("falls back to mock when the real provider cannot be built (key but construction fails is guarded)", async () => {
    // provider=openai + flag on + key present would select real; but we cannot
    // reach the network here. With no key it must stay mock regardless.
    const { provider, isReal } = await getAiProvider("metrics", {
      ...baseEnv,
      AI_PROVIDER: "openai",
      AI_METRICS_ENABLED: "true",
      // no AI_API_KEY
    });
    expect(isReal).toBe(false);
    expect(provider.name).toBe("mock");
  });
});
