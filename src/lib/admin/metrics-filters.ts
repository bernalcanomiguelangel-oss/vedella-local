/**
 * URL-encoded filter state for the metrics dashboard (FEAT-005,
 * analytics-dictionary §1 "URL state"). Pure parse/serialise helpers so the
 * page can read filters from searchParams and build drill-down links that carry
 * the current filter state. A reset is simply a link with no params.
 */
import type { MetricFilters } from "./analytics-metrics";

export interface ParsedMetricFilters extends MetricFilters {
  /** Raw values kept for re-rendering the form controls. */
  raw: {
    farmId: string;
    cycleId: string;
    from: string;
    to: string;
    language: string;
    channel: string;
    deliveryMethod: string;
    status: string;
    includeTest: string;
    week: string;
  };
}

function one(
  sp: Record<string, string | string[] | undefined> | undefined,
  key: string,
): string {
  const v = sp?.[key];
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v[0] ?? "";
  return "";
}

function parseDate(v: string): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function parseMetricFilters(
  sp: Record<string, string | string[] | undefined> | undefined,
): ParsedMetricFilters {
  const raw = {
    farmId: one(sp, "farmId"),
    cycleId: one(sp, "cycleId"),
    from: one(sp, "from"),
    to: one(sp, "to"),
    language: one(sp, "language"),
    channel: one(sp, "channel"),
    deliveryMethod: one(sp, "deliveryMethod"),
    status: one(sp, "status"),
    includeTest: one(sp, "includeTest"),
    week: one(sp, "week"),
  };
  return {
    raw,
    farmId: raw.farmId || null,
    cycleId: raw.cycleId || null,
    from: parseDate(raw.from),
    to: parseDate(raw.to),
    language: raw.language || null,
    channel: raw.channel || null,
    deliveryMethod: raw.deliveryMethod || null,
    status: raw.status || null,
    // Test records excluded by default; only included when explicitly "1".
    includeTest: raw.includeTest === "1",
  };
}

/** Serialise the current raw filters to a query string, with overrides applied
 * (used for drill-down links that pin an extra filter). */
export function buildMetricsQuery(
  raw: ParsedMetricFilters["raw"],
  overrides: Partial<Record<keyof ParsedMetricFilters["raw"], string>> = {},
): string {
  const merged = { ...raw, ...overrides };
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) {
    if (v) params.set(k, v);
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}
