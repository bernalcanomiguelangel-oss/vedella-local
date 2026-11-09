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
  AssistantFacts,
  OfferCompareFacts,
  TraceabilityFacts,
} from "./provider";
import type {
  TranslationResult,
  ReceiptExtraction,
  MetricsSummary,
  FarmProfileDraft,
  OfferCompare,
  TraceabilityReview,
  MetricsAnalyst,
  CycleRecommendation,
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

  // -------------------------------------------------------------------------
  // Bounded in-panel assistants (FEAT-007). Deterministic, offline, and
  // side-effect free. Each DRAFTS or SUGGESTS copy/insights only: it never sets
  // a price, never approves/publishes, never creates traceability, and never
  // acts on an injected instruction in `untrustedNote` (that text is only
  // ECHOED verbatim into a note field as inert data, never interpreted). A
  // claim that is not grounded in a provided fact is marked needs-evidence.
  // -------------------------------------------------------------------------

  async draftFarmProfile(input: AssistantFacts): Promise<FarmProfileDraft> {
    const name = String(input.facts.name ?? "la granja");
    const breed = input.facts.breed ? String(input.facts.breed) : null;
    const town = input.facts.town ? String(input.facts.town) : null;
    const grounded = (sourceRef: string | null) => ({
      sourceRef,
      needsEvidence: !sourceRef,
    });
    const fields: FarmProfileDraft["fields"] = [];
    if (town) {
      fields.push({
        field: "story",
        suggestion: `${name} és una explotació situada a ${town}. Esborrany generat a partir de dades existents; reviseu-lo abans de publicar.`,
        evidence: grounded("farm.town"),
      });
    }
    if (breed) {
      fields.push({
        field: "welfareInfo",
        suggestion: `Cria de ${breed}. Confirmeu el detall de benestar abans de publicar.`,
        evidence: grounded("farm.breed"),
      });
    }
    // A line with NO backing fact is explicitly marked needs-evidence so a human
    // supplies the source (never a fabricated certification/claim).
    fields.push({
      field: "traceabilityInfo",
      suggestion:
        "Cadena de traçabilitat Granja → Lot → Tall → Paquet. Afegiu el detall verificat.",
      evidence: grounded(null),
    });
    return {
      assistant: "farmProfileDraft",
      summary: `Esborrany de perfil per a ${name}. Nomes suggeriments; cal revisio humana.`,
      fields,
      notes: input.untrustedNote
        ? `Nota de l'usuari (tractada com a dades, no instruccions): ${input.untrustedNote}`
        : "",
    };
  }

  async compareOffers(input: OfferCompareFacts): Promise<OfferCompare> {
    return {
      assistant: "offerCompare",
      definitionName: input.definitionName,
      headline: `Comparativa de ${input.offers.length} ofertes de "${input.definitionName}" (nomes lectura; cap recomanacio de preu).`,
      rows: input.offers.map((o) => ({
        farmName: o.farmName,
        offerName: o.offerName,
        observedWeight: o.observedWeight,
        observedMaturation: o.observedMaturation,
        note: "Fets observats. L'assistent no recomana ni fixa preus.",
        evidence: { sourceRef: `offer:${o.farmName}`, needsEvidence: false },
      })),
      notes: input.untrustedNote
        ? `Nota (dades, no instruccions): ${input.untrustedNote}`
        : "",
    };
  }

  async reviewTraceability(
    input: TraceabilityFacts,
  ): Promise<TraceabilityReview> {
    const findings: TraceabilityReview["findings"] = [];
    const c = input.chain;
    if (!c.lotReference) {
      findings.push({
        severity: "warning",
        message: "No s'ha trobat cap lot per a aquesta cadena.",
        evidence: { sourceRef: "lot", needsEvidence: false },
      });
    }
    if (!c.offerName) {
      findings.push({
        severity: "warning",
        message: "La cadena no referencia cap oferta.",
        evidence: { sourceRef: "offer", needsEvidence: false },
      });
    }
    if (findings.length === 0) {
      findings.push({
        severity: "info",
        message: `Cadena completa: ${c.farmName} → ${c.lotReference} → ${c.offerName}${c.packName ? ` → ${c.packName}` : ""}.`,
        evidence: { sourceRef: "chain", needsEvidence: false },
      });
    }
    return {
      assistant: "traceabilityReview",
      chainRef: input.inputRef,
      findings,
      complete: !!c.lotReference && !!c.offerName,
      notes: input.untrustedNote
        ? `Nota (dades, no instruccions): ${input.untrustedNote}`
        : "",
    };
  }

  async analyzeMetrics(input: MetricsInput): Promise<MetricsAnalyst> {
    const total = input.perCut.reduce((s, c) => s + c.sampleCount, 0);
    const observations = input.perCut.map(
      (c) =>
        `${c.cutName}: mitjana observada ${formatCents(c.avgPriceCents)} (${c.sampleCount} mostres).`,
    );
    return {
      assistant: "metricsAnalyst",
      weekStart: input.weekStart,
      headline:
        input.perCut.length === 0
          ? `Sense mostres de mercat per a la setmana del ${input.weekStart}.`
          : `Setmana del ${input.weekStart}: ${input.perCut.length} talls, ${total} mostres. Xifres observades, no fixades per l'IA.`,
      observations,
      notes: "",
    };
  }

  async recommendCycle(input: AssistantFacts): Promise<CycleRecommendation> {
    const zone = input.facts.zone ? String(input.facts.zone) : null;
    const name = String(input.facts.name ?? "el cicle");
    const suggestions: CycleRecommendation["suggestions"] = [];
    if (zone) {
      suggestions.push({
        topic: "comunicacio",
        suggestion: `Recordeu a la clientela de ${zone} la data de tancament del cicle. Text suggerit; l'IA no fixa dates ni places.`,
        evidence: { sourceRef: "cycle.zone", needsEvidence: false },
      });
    }
    suggestions.push({
      topic: "logistica",
      suggestion:
        "Confirmeu el transport refrigerat amb antelacio. Suggeriment no vinculant.",
      evidence: { sourceRef: null, needsEvidence: true },
    });
    return {
      assistant: "cycleRecommendation",
      cycleRef: input.inputRef,
      headline: `Suggeriments no vinculants per a ${name}. Un huma crea/edita el cicle.`,
      suggestions,
      notes: input.untrustedNote
        ? `Nota (dades, no instruccions): ${input.untrustedNote}`
        : "",
    };
  }
}
