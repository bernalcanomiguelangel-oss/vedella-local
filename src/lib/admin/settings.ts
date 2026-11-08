/**
 * Settings logic (FEAT-006, docs/admin-information-architecture.md §3.13).
 *
 * Settings cover marketplace identity, localization, delivery, cycle defaults,
 * notification toggles, feature flags, AI flags and analytics consent/retention.
 *
 * HARD SECURITY RULE: NO secret VALUES are ever stored in Settings or sent to
 * the browser. AI/provider keys live ONLY in the git-ignored .env (var
 * AI_API_KEY) and are surfaced through `buildAiDiagnostics` as PRESENCE-ONLY
 * booleans. The diagnostics block also LABELS where the real key is configured
 * so a future operator knows where to plug a provider in — without ever seeing
 * or storing a value. `readAiConfig` itself never returns the key value.
 */
import type { PrismaClient } from "@prisma/client";
import { readAiConfig, type AiConfig } from "@/lib/ai/provider";

export type SettingValueType = "string" | "number" | "boolean" | "json";

export interface SettingRow {
  key: string;
  value: string | number | boolean | unknown;
  valueType: SettingValueType;
  category: string;
  label: string;
}

/** The default settings seeded for a fresh marketplace. NONE are secrets. */
export const DEFAULT_SETTINGS: {
  key: string;
  valueType: SettingValueType;
  value: string | number | boolean;
  category: string;
  label: string;
}[] = [
  // identity
  { key: "marketplace.name", valueType: "string", value: "Vedella Local", category: "identity", label: "Nom del mercat" },
  // localization
  { key: "localization.defaultLocale", valueType: "string", value: "ca", category: "localization", label: "Idioma per defecte" },
  { key: "localization.locales", valueType: "json", value: JSON.stringify(["ca", "es", "en"]) as unknown as string, category: "localization", label: "Idiomes disponibles" },
  { key: "localization.currency", valueType: "string", value: "EUR", category: "localization", label: "Moneda" },
  { key: "localization.timezone", valueType: "string", value: "Europe/Madrid", category: "localization", label: "Zona horària" },
  // delivery
  { key: "delivery.feeCents", valueType: "number", value: 600, category: "delivery", label: "Cost d'enviament (cèntims)" },
  // cycles
  { key: "cycles.orderRefFormat", valueType: "string", value: "VL-{cycle}-{seq}", category: "cycles", label: "Format de referència de comanda" },
  { key: "cycles.defaultTotalPlaces", valueType: "number", value: 50, category: "cycles", label: "Places per defecte del cicle" },
  // notifications
  { key: "notifications.notifyMeEnabled", valueType: "boolean", value: true, category: "notifications", label: "Captura d'interès (avisa'm)" },
  // features
  { key: "features.multiFarmPacks", valueType: "boolean", value: true, category: "features", label: "Packs multi-granja" },
  // analytics
  { key: "analytics.consentRequired", valueType: "boolean", value: false, category: "analytics", label: "Requereix consentiment d'analítica" },
  { key: "analytics.retentionDays", valueType: "number", value: 365, category: "analytics", label: "Retenció d'analítica (dies)" },
];

function decodeValue(row: {
  valueType: string;
  stringValue: string | null;
  numberValue: number | null;
  booleanValue: boolean | null;
  jsonValue: string | null;
}): string | number | boolean | unknown {
  switch (row.valueType) {
    case "number":
      return row.numberValue ?? 0;
    case "boolean":
      return row.booleanValue ?? false;
    case "json":
      try {
        return row.jsonValue ? JSON.parse(row.jsonValue) : null;
      } catch {
        return null;
      }
    default:
      return row.stringValue ?? "";
  }
}

/** Idempotently seed the default settings (used by the seed + first load). */
export async function ensureDefaultSettings(prisma: PrismaClient): Promise<void> {
  for (const d of DEFAULT_SETTINGS) {
    await prisma.setting.upsert({
      where: { key: d.key },
      update: { category: d.category, label: d.label },
      create: {
        key: d.key,
        valueType: d.valueType,
        category: d.category,
        label: d.label,
        stringValue: d.valueType === "string" ? String(d.value) : null,
        numberValue: d.valueType === "number" ? Number(d.value) : null,
        booleanValue: d.valueType === "boolean" ? Boolean(d.value) : null,
        jsonValue: d.valueType === "json" ? String(d.value) : null,
      },
    });
  }
}

/** List all settings rows as decoded, UI-friendly values (never secrets). */
export async function listSettings(prisma: PrismaClient): Promise<SettingRow[]> {
  const rows = await prisma.setting.findMany({ orderBy: [{ category: "asc" }, { key: "asc" }] });
  return rows.map((r) => ({
    key: r.key,
    value: decodeValue(r),
    valueType: r.valueType as SettingValueType,
    category: r.category,
    label: r.label,
  }));
}

export interface UpdateSettingInput {
  key: string;
  /** Raw string from the form; coerced according to the stored valueType. */
  value: string;
}

/**
 * Update a single setting by key. The value is coerced to the row's stored
 * type. A setting key must already exist (settings are a fixed catalogue, not
 * arbitrary key/value), so there is no path to inject an un-typed secret row.
 */
export async function updateSetting(
  prisma: PrismaClient,
  input: UpdateSettingInput,
): Promise<{ ok: boolean; code?: string; message?: string }> {
  const row = await prisma.setting.findUnique({ where: { key: input.key } });
  if (!row) return { ok: false, code: "NOT_FOUND", message: "Unknown setting." };

  const data: Record<string, unknown> = {
    stringValue: null,
    numberValue: null,
    booleanValue: null,
    jsonValue: null,
  };
  switch (row.valueType) {
    case "number": {
      const n = Number(input.value);
      if (!Number.isFinite(n)) return { ok: false, code: "BAD_NUMBER", message: "Expected a number." };
      data.numberValue = Math.floor(n);
      break;
    }
    case "boolean":
      data.booleanValue = ["1", "true", "yes", "on"].includes(input.value.trim().toLowerCase());
      break;
    case "json":
      try {
        JSON.parse(input.value);
      } catch {
        return { ok: false, code: "BAD_JSON", message: "Expected valid JSON." };
      }
      data.jsonValue = input.value;
      break;
    default:
      data.stringValue = input.value;
  }

  await prisma.setting.update({ where: { key: input.key }, data });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// AI diagnostics: PRESENCE-ONLY. Never returns or renders a key value.
// ---------------------------------------------------------------------------

export interface AiDiagnostics {
  provider: string;
  /** TRUE when a non-empty AI_API_KEY is present in the environment. */
  hasApiKey: boolean;
  /** Per-use-case feature flags as booleans. */
  flags: AiConfig["flags"];
  /** Where each AI assistant lives in the admin panel (decision 7). */
  assistants: { useCase: string; label: string; location: string; flagEnabled: boolean }[];
  /** Human-readable note of WHERE the real key is configured (never the value). */
  keyConfigLocation: string;
  /** The env var name that holds the real key (a name, not a value). */
  keyEnvVar: string;
}

/**
 * Build the read-only AI diagnostics block for the Settings page. It reuses
 * `readAiConfig`, which returns ONLY presence booleans and flags — never the
 * key value. The returned object is safe to serialise to the browser.
 */
export function buildAiDiagnostics(env: NodeJS.ProcessEnv = process.env): AiDiagnostics {
  const config = readAiConfig(env);
  return {
    provider: config.provider,
    hasApiKey: config.hasApiKey,
    flags: config.flags,
    assistants: [
      {
        useCase: "translate",
        label: "Traducció de textos (ca/es/en)",
        location: "/admin/review",
        flagEnabled: config.flags.translation,
      },
      {
        useCase: "metrics",
        label: "Mètriques / preu mitjà setmanal",
        location: "/admin/metrics",
        flagEnabled: config.flags.metrics,
      },
      {
        useCase: "receipt",
        label: "Lectura d'albarans (pre-omple el formulari)",
        location: "/admin/receipts",
        flagEnabled: config.flags.receipt,
      },
      // The five bounded in-panel assistants (FEAT-007, decision 7). Each only
      // drafts/suggests; a human must accept/edit/reject with a reason.
      {
        useCase: "farmProfileDraft",
        label: "Assistent: esborrany de perfil de granja",
        location: "/admin/farms",
        flagEnabled: config.flags.farmProfileDraft,
      },
      {
        useCase: "offerCompare",
        label: "Assistent: comparativa d'ofertes (només lectura)",
        location: "/admin/products",
        flagEnabled: config.flags.offerCompare,
      },
      {
        useCase: "traceabilityReview",
        label: "Assistent: revisió de traçabilitat",
        location: "/admin/lots",
        flagEnabled: config.flags.traceabilityReview,
      },
      {
        useCase: "metricsAnalyst",
        label: "Assistent: anàlisi de mètriques",
        location: "/admin/metrics",
        flagEnabled: config.flags.metricsAnalyst,
      },
      {
        useCase: "cycleRecommendation",
        label: "Assistent: recomanacions de cicle (no vinculant)",
        location: "/admin/cycles",
        flagEnabled: config.flags.cycleRecommendation,
      },
    ],
    keyConfigLocation: "Fitxer .env (ignorat per git) a l'arrel del projecte",
    keyEnvVar: "AI_API_KEY",
  };
}
