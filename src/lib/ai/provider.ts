/**
 * The single server-side AI service boundary (ai-guardrails + R27/R28).
 *
 * Everything the app does with AI goes through the `AiProvider` interface. Two
 * implementations exist: the deterministic `MockAiProvider` (default, offline,
 * zero-config) and a real provider instantiated ONLY when an API key is present
 * AND the relevant use-case flag is on.
 *
 * Security: this module NEVER reads or stores a key value. The factory asks the
 * config reader only whether a key is PRESENT (a boolean). The real provider is
 * imported lazily and reads the key itself, from process.env, only when actually
 * constructed. Keys are never logged.
 *
 * This file must remain server-only. Do not import it from client components.
 */
import type { Locale } from "@/lib/i18n";
import type {
  ReceiptExtraction,
  TranslationResult,
  MetricsSummary,
  FarmProfileDraft,
  OfferCompare,
  TraceabilityReview,
  MetricsAnalyst,
  CycleRecommendation,
} from "./schemas";

/**
 * The five bounded in-panel assistants (FEAT-007, decision 7). Each is a
 * separate use case behind its own feature flag. They only draft/suggest; they
 * never price, approve, publish or create traceability.
 */
export type AiAssistantUseCase =
  | "farmProfileDraft"
  | "offerCompare"
  | "traceabilityReview"
  | "metricsAnalyst"
  | "cycleRecommendation";

export type AiUseCase =
  | "translate"
  | "metrics"
  | "receipt"
  | AiAssistantUseCase;

export const ASSISTANT_USE_CASES: AiAssistantUseCase[] = [
  "farmProfileDraft",
  "offerCompare",
  "traceabilityReview",
  "metricsAnalyst",
  "cycleRecommendation",
];

// ---------------------------------------------------------------------------
// Provider interface
// ---------------------------------------------------------------------------

export interface TranslateInput {
  /** The source text to translate (base ca copy). Treated as trusted content. */
  sourceText: string;
  /** The locales to produce. The source locale may be included (echoed back). */
  targetLocales: Locale[];
  /** A non-sensitive reference for the audit log, e.g. "product:123:name". */
  inputRef: string;
}

export interface ExtractReceiptInput {
  /** Raw bytes of the uploaded image/PDF. UNTRUSTED. */
  bytes: Uint8Array;
  /** Original filename (used only as a non-sensitive audit ref). */
  filename: string;
  /** MIME type of the upload. */
  mimeType: string;
  /**
   * Optional plain-text already extracted from the document (e.g. OCR). This is
   * UNTRUSTED and will be wrapped as data before any model sees it.
   */
  text?: string;
}

export interface MetricsInput {
  /** ISO date (yyyy-mm-dd) of the Monday that starts the week being summarised. */
  weekStart: string;
  /** Observed, server-computed per-cut averages (never invented by the model). */
  perCut: { cutName: string; avgPriceCents: number; sampleCount: number }[];
}

// ---------------------------------------------------------------------------
// Bounded-assistant inputs (FEAT-007). Every assistant receives ALREADY
// server-resolved, structured FACTS plus an optional block of UNTRUSTED text
// (free-form notes a human typed, or document text). The untrusted block is
// wrapped as data (sanitize.ts) before any model sees it and can never change
// application state.
// ---------------------------------------------------------------------------

export interface AssistantFacts {
  /** Structured, trusted facts the server already resolved from the DB. */
  facts: Record<string, string | number | null>;
  /** Non-sensitive audit reference, e.g. "farm:123". */
  inputRef: string;
  /** Optional free-form text typed by the human. UNTRUSTED. */
  untrustedNote?: string;
}

export interface OfferCompareFacts extends AssistantFacts {
  definitionName: string;
  offers: {
    farmName: string;
    offerName: string;
    observedWeight: string | null;
    observedMaturation: string | null;
  }[];
}

export interface TraceabilityFacts extends AssistantFacts {
  chain: {
    farmName: string;
    lotReference: string | null;
    offerName: string | null;
    packName: string | null;
  };
}

/** The provider-agnostic AI boundary. Implementations must be side-effect free
 * with respect to application state (no DB writes, no approvals, no pricing). */
export interface AiProvider {
  readonly name: string; // "mock" | "openai" ...
  readonly model: string;
  readonly promptVersion: string;

  translate(input: TranslateInput): Promise<TranslationResult>;
  extractReceipt(input: ExtractReceiptInput): Promise<ReceiptExtraction>;
  summarizeMetrics(input: MetricsInput): Promise<MetricsSummary>;

  // Bounded assistants (FEAT-007). Draft/suggest only.
  draftFarmProfile(input: AssistantFacts): Promise<FarmProfileDraft>;
  compareOffers(input: OfferCompareFacts): Promise<OfferCompare>;
  reviewTraceability(input: TraceabilityFacts): Promise<TraceabilityReview>;
  analyzeMetrics(input: MetricsInput): Promise<MetricsAnalyst>;
  recommendCycle(input: AssistantFacts): Promise<CycleRecommendation>;
}

// ---------------------------------------------------------------------------
// Configuration / feature flags
// ---------------------------------------------------------------------------

export interface AiConfig {
  /** The configured provider name (defaults to "mock"). */
  provider: string;
  /** Whether a non-empty API key is present in the environment. */
  hasApiKey: boolean;
  flags: {
    translation: boolean;
    metrics: boolean;
    receipt: boolean;
    // Bounded in-panel assistants (FEAT-007), each behind its own flag.
    farmProfileDraft: boolean;
    offerCompare: boolean;
    traceabilityReview: boolean;
    metricsAnalyst: boolean;
    cycleRecommendation: boolean;
  };
}

function envFlag(value: string | undefined): boolean {
  if (!value) return false;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

/**
 * Read AI configuration from the environment. Returns ONLY whether a key is
 * present — never the key value itself — so the key cannot leak through this
 * path. Keys are read for real only inside the real provider.
 */
export function readAiConfig(env: NodeJS.ProcessEnv = process.env): AiConfig {
  // AI_PROVIDER accepts "mock" (default, zero-config offline), "gemini" (free
  // gemini-1.5-flash), or "openai" (any OpenAI-compatible endpoint).
  // A key present under EITHER accepted name counts as present. We only ever
  // expose the boolean — never the value — through this path.
  const hasAnyKey = (value: string | undefined): boolean =>
    typeof value === "string" && value.trim().length > 0;
  const hasApiKey = hasAnyKey(env.AI_API_KEY) || hasAnyKey(env.GEMINI_API_KEY);
  return {
    provider: (env.AI_PROVIDER ?? "mock").trim().toLowerCase(),
    hasApiKey,
    flags: {
      translation: envFlag(env.AI_TRANSLATION_ENABLED),
      metrics: envFlag(env.AI_METRICS_ENABLED),
      receipt: envFlag(env.AI_RECEIPT_ENABLED),
      farmProfileDraft: envFlag(env.AI_FARM_PROFILE_DRAFT_ENABLED),
      offerCompare: envFlag(env.AI_OFFER_COMPARE_ENABLED),
      traceabilityReview: envFlag(env.AI_TRACEABILITY_REVIEW_ENABLED),
      metricsAnalyst: envFlag(env.AI_METRICS_ANALYST_ENABLED),
      cycleRecommendation: envFlag(env.AI_CYCLE_RECOMMENDATION_ENABLED),
    },
  };
}

/** Map a use case to its feature flag. */
export function flagForUseCase(config: AiConfig, useCase: AiUseCase): boolean {
  switch (useCase) {
    case "translate":
      return config.flags.translation;
    case "metrics":
      return config.flags.metrics;
    case "receipt":
      return config.flags.receipt;
    case "farmProfileDraft":
      return config.flags.farmProfileDraft;
    case "offerCompare":
      return config.flags.offerCompare;
    case "traceabilityReview":
      return config.flags.traceabilityReview;
    case "metricsAnalyst":
      return config.flags.metricsAnalyst;
    case "cycleRecommendation":
      return config.flags.cycleRecommendation;
  }
}

/**
 * Whether the REAL provider should be used for a use case: a key must be present
 * AND the use-case flag on AND a non-mock provider configured. Otherwise we use
 * the MockAiProvider (safe fallback, never crash).
 */
export function shouldUseRealProvider(
  config: AiConfig,
  useCase: AiUseCase,
): boolean {
  return (
    config.hasApiKey &&
    config.provider !== "mock" &&
    flagForUseCase(config, useCase)
  );
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

// Cache instances so hot-reload / repeated calls reuse the same object.
let mockSingleton: AiProvider | null = null;

async function getMockProvider(): Promise<AiProvider> {
  if (!mockSingleton) {
    const { MockAiProvider } = await import("./mock-provider");
    mockSingleton = new MockAiProvider();
  }
  return mockSingleton;
}

export interface ResolvedProvider {
  provider: AiProvider;
  /** True when the real provider was selected (key present + flag on). */
  isReal: boolean;
  /** The use-case flag state, for the audit record. */
  flagEnabled: boolean;
}

/**
 * Return the provider to use for a use case. The real provider is imported and
 * instantiated LAZILY and ONLY when `shouldUseRealProvider` is true, so when no
 * key is set it is never even loaded. Any error constructing/selecting the real
 * provider falls back to the mock (never crash — ai-guardrails).
 */
export async function getAiProvider(
  useCase: AiUseCase,
  env: NodeJS.ProcessEnv = process.env,
): Promise<ResolvedProvider> {
  const config = readAiConfig(env);
  const flagEnabled = flagForUseCase(config, useCase);

  if (shouldUseRealProvider(config, useCase)) {
    try {
      // Branch on the configured provider. The chosen module is imported LAZILY
      // and ONLY here, so with no key (shouldUseRealProvider false) neither real
      // provider module is ever loaded. Any construction error (e.g. a missing
      // key under a different name) falls through to the mock below.
      let provider: AiProvider;
      if (config.provider === "gemini") {
        const { createGeminiProvider } = await import("./gemini-provider");
        provider = createGeminiProvider(env);
      } else {
        // "openai" or any other non-mock value uses the OpenAI-compatible path.
        const { createRealProvider } = await import("./openai-provider");
        provider = createRealProvider(env);
      }
      return { provider, isReal: true, flagEnabled };
    } catch (err) {
      console.error(
        "[ai] real provider unavailable, falling back to mock:",
        err instanceof Error ? err.message : "unknown error",
      );
      // fall through to mock
    }
  }

  const provider = await getMockProvider();
  return { provider, isReal: false, flagEnabled };
}
