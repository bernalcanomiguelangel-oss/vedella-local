/**
 * Deterministic MockAiProvider (ai-guardrails + R27). This makes the WHOLE app
 * run end-to-end with no API key: it is the default, zero-config demo path and
 * the tested path.
 *
 * Determinism rules:
 *  - translate(): rule-based, locale-tagged string transforms. Same input ->
 *    same output, every time. No network, no randomness.
 *  - extractReceipt(): returns fixed structured fields from a built-in fixture;
 *    if untrusted text is supplied it is scanned ONLY to populate sourceRef /
 *    needsEvidence evidence markers, never to change behaviour.
 *  - summarizeMetrics(): echoes the server-computed averages and phrases a
 *    neutral, deterministic headline. It never invents or changes a number.
 *
 * The mock never sets prices, never approves/publishes, never creates records.
 */
import type {
  AiProvider,
  TranslateInput,
  ExtractReceiptInput,
  MetricsInput,
} from "./provider";
import type {
  TranslationResult,
  ReceiptExtraction,
  MetricsSummary,
} from "./schemas";
import { formatCents } from "@/lib/pricing";

/** Locale tags appended to the source so mock translations are distinguishable
 * and deterministic without pretending to be real translations. */
const LOCALE_TAG: Record<string, string> = {
  ca: "[CA]",
  es: "[ES]",
  en: "[EN]",
};

/**
 * A tiny, deterministic glossary so mock "translations" look plausible for the
 * demo. Falls back to tagging the source text when a term is unknown. This is
 * explicitly NOT a claim of real translation — a human reviews every row before
 * publish (status stays `machine`).
 */
const GLOSSARY: Record<string, { es: string; en: string }> = {
  entrecot: { es: "Entrecot", en: "Ribeye steak" },
  "llom baix": { es: "Lomo bajo", en: "Striploin" },
  hamburguesa: { es: "Hamburguesa", en: "Burger" },
  "carn picada": { es: "Carne picada", en: "Minced beef" },
  galta: { es: "Carrillera", en: "Beef cheek" },
  "carn per estofar": { es: "Carne para estofar", en: "Stewing beef" },
  "brou d'os": { es: "Caldo de hueso", en: "Bone broth" },
  vedella: { es: "ternera", en: "beef" },
  granja: { es: "granja", en: "farm" },
  pack: { es: "pack", en: "pack" },
};

function glossaryTranslate(source: string, locale: "es" | "en"): string {
  const lower = source.toLowerCase();
  for (const [term, t] of Object.entries(GLOSSARY)) {
    if (lower.includes(term)) {
      return source.replace(new RegExp(term, "i"), t[locale]);
    }
  }
  return source;
}

export class MockAiProvider implements AiProvider {
  readonly name = "mock";
  readonly model = "mock-deterministic-v1";
  readonly promptVersion = "mock-1";

  async translate(input: TranslateInput): Promise<TranslationResult> {
    const items = input.targetLocales.map((locale) => {
      const tag = LOCALE_TAG[locale] ?? `[${locale.toUpperCase()}]`;
      if (locale === "ca") {
        // ca is the source; echo it verbatim with a tag.
        return { locale, text: `${tag} ${input.sourceText}` };
      }
      const translated = glossaryTranslate(input.sourceText, locale);
      return { locale, text: `${tag} ${translated}` };
    });
    return { items };
  }

  async extractReceipt(
    input: ExtractReceiptInput,
  ): Promise<ReceiptExtraction> {
    // Deterministic fixture. A real provider would OCR the bytes; the mock
    // returns a stable, clearly-marked example so the human review form always
    // has something concrete to correct. Every value carries evidence: if we
    // were given source text we reference it, otherwise we mark needs-evidence.
    const hasText = !!input.text && input.text.trim().length > 0;
    const sourceRef = hasText ? `document:${input.filename}` : null;
    const ev = (needs: boolean) => ({
      sourceRef: needs ? null : sourceRef,
      needsEvidence: needs || !hasText,
    });

    return {
      farmName: { value: "Mas Vallgorguina", evidence: ev(false) },
      productName: { value: "Entrecot", evidence: ev(false) },
      lotReference: { value: "MAS-L0001", evidence: ev(false) },
      units: { value: 24, evidence: ev(false) },
      slaughterDate: { value: "2026-01-05", evidence: ev(true) },
      cuttingDate: { value: "2026-01-07", evidence: ev(true) },
      packingDate: { value: "2026-01-08", evidence: ev(true) },
      expiryDate: { value: "2026-02-17", evidence: ev(true) },
      notes:
        "Mock extraction for human review. Confirm every field before creating a lot. Monetary values are entered by a human, never by AI.",
    };
  }

  async summarizeMetrics(input: MetricsInput): Promise<MetricsSummary> {
    // Echo the server-computed averages verbatim; phrase a neutral headline.
    const total = input.perCut.reduce((s, c) => s + c.sampleCount, 0);
    const cheapest = [...input.perCut].sort(
      (a, b) => a.avgPriceCents - b.avgPriceCents,
    )[0];
    const dearest = [...input.perCut].sort(
      (a, b) => b.avgPriceCents - a.avgPriceCents,
    )[0];
    const headline =
      input.perCut.length === 0
        ? `No market samples for the week of ${input.weekStart}.`
        : `Week of ${input.weekStart}: ${input.perCut.length} cuts, ${total} samples. ` +
          `Lowest average ${cheapest.cutName} at ${formatCents(cheapest.avgPriceCents)}, ` +
          `highest ${dearest.cutName} at ${formatCents(dearest.avgPriceCents)}.`;
    return {
      weekStart: input.weekStart,
      headline,
      perCut: input.perCut.map((c) => ({
        cutName: c.cutName,
        avgPriceCents: c.avgPriceCents,
        sampleCount: c.sampleCount,
      })),
    };
  }
}
