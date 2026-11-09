/**
 * Website-text CMS logic (FEAT-006, docs/admin-information-architecture.md §3.9).
 *
 * WebsiteText holds GENERIC marketing/site copy only, in ca/es/en, with a
 * draft + published lifecycle. The hard guardrail: operational facts (weights,
 * prices, dates, capacity, farm/traceability data) must NEVER be stored here —
 * those come from structured records. We reject such content at the write
 * boundary so an operator cannot accidentally (or maliciously) bake a frozen,
 * un-traceable "fact" into free-text copy that bypasses the data model.
 *
 * This module is pure logic over a PrismaClient so it can be unit/integration
 * tested directly; the thin server-action wrappers live in website-text-actions.
 */
import type { PrismaClient } from "@prisma/client";

export interface WebsiteTextResult {
  ok: boolean;
  code?: string;
  message?: string;
  id?: string;
  /** The specific operational-fact term that tripped the guardrail, if any. */
  offendingTerm?: string;
}

/**
 * Patterns that indicate an operational fact has been embedded in generic copy.
 * These are intentionally conservative: they target the *data* the structured
 * model owns (prices, weights, dates, capacity/places, lot/traceability codes),
 * not ordinary prose. Any match rejects the write.
 */
const OPERATIONAL_FACT_PATTERNS: { term: string; re: RegExp }[] = [
  // Prices: a currency amount like "42,00 €", "€ 42", "42 EUR", "14.38€".
  { term: "price", re: /(?:€|eur\b)\s*\d|\d[\d.,]*\s*(?:€|eur\b)/i },
  // Weights: "1500 g", "2,3 kg", "300g".
  { term: "weight", re: /\d[\d.,]*\s?(?:g|kg|gr|grams?|grams|quilos?|kilos?)\b/i },
  // Explicit dates: 2026-11-08, 08/11/2026, 8 de novembre de 2026. Checked
  // BEFORE capacity so a "dd/mm/yyyy" date is not mislabelled as capacity.
  {
    term: "date",
    re: /\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}\/\d{1,2}\/\d{2,4}\b|\b\d{1,2}\s+de\s+[a-zàéèíòóúç]+\s+de\s+\d{4}\b/i,
  },
  // Capacity / free places: "37/50" (a two-number ratio, not a date) or
  // "37 places". Bounded so it does not swallow date fragments.
  { term: "capacity", re: /\b\d{1,3}\s*\/\s*\d{1,3}\b|\b\d+\s*(?:places?|plazas?|llocs?)\b/i },
  // Traceability / lot codes: "lot ABC-123", "LOT-2026-001", "ref XYZ-9".
  {
    term: "traceability",
    re: /\b(?:lot|lote|ref|refer[eè]ncia)\b[:\s-]*[a-z]*\d/i,
  },
];

/**
 * Scan a candidate copy string for embedded operational facts. Returns the
 * first offending term, or null when the text is clean generic copy.
 */
export function detectOperationalFact(text: string): string | null {
  const value = text ?? "";
  for (const { term, re } of OPERATIONAL_FACT_PATTERNS) {
    if (re.test(value)) return term;
  }
  return null;
}

const VALID_LOCALES = new Set(["ca", "es", "en"]);

export interface UpsertWebsiteTextInput {
  pageKey: string;
  sectionKey: string;
  locale: string;
  draftText: string;
  charLimit?: number | null;
  editorUserId: string;
}

/**
 * Create or update the DRAFT of a website-text block. Validates the locale, the
 * optional char limit, and — critically — rejects any operational fact so such
 * data can never be stored here. Publishing is a separate step (publishWebsiteText).
 */
export async function upsertWebsiteTextDraft(
  prisma: PrismaClient,
  input: UpsertWebsiteTextInput,
): Promise<WebsiteTextResult> {
  const pageKey = (input.pageKey ?? "").trim();
  const sectionKey = (input.sectionKey ?? "").trim();
  const locale = (input.locale ?? "").trim().toLowerCase();
  const draftText = (input.draftText ?? "").trim();

  if (!pageKey || !sectionKey) {
    return { ok: false, code: "BAD_KEY", message: "Page and section keys are required." };
  }
  if (!VALID_LOCALES.has(locale)) {
    return { ok: false, code: "BAD_LOCALE", message: "Locale must be ca, es or en." };
  }
  if (draftText.length === 0) {
    return { ok: false, code: "EMPTY", message: "Draft text is required." };
  }

  const charLimit =
    input.charLimit != null && Number.isFinite(input.charLimit)
      ? Math.max(1, Math.floor(input.charLimit))
      : null;
  if (charLimit != null && draftText.length > charLimit) {
    return {
      ok: false,
      code: "TOO_LONG",
      message: `Text exceeds the ${charLimit}-character limit.`,
    };
  }

  // GUARDRAIL: operational facts never live in website copy.
  const offendingTerm = detectOperationalFact(draftText);
  if (offendingTerm) {
    return {
      ok: false,
      code: "OPERATIONAL_FACT",
      offendingTerm,
      message:
        "Operational facts (prices, weights, dates, capacity, traceability) must come from structured records, not website text.",
    };
  }

  const row = await prisma.websiteText.upsert({
    where: {
      pageKey_sectionKey_locale: { pageKey, sectionKey, locale },
    },
    update: {
      draftText,
      charLimit,
      lastEditorUserId: input.editorUserId,
    },
    create: {
      pageKey,
      sectionKey,
      locale,
      draftText,
      charLimit,
      lastEditorUserId: input.editorUserId,
    },
  });

  return { ok: true, id: row.id };
}

/**
 * Publish the current draft: copy draftText -> publishedText and stamp
 * lastPublishedAt. The draft is re-validated against the guardrail so a row
 * that somehow holds an operational fact can never reach the published state.
 */
export async function publishWebsiteText(
  prisma: PrismaClient,
  id: string,
  editorUserId: string,
): Promise<WebsiteTextResult> {
  const row = await prisma.websiteText.findUnique({ where: { id } });
  if (!row) return { ok: false, code: "NOT_FOUND", message: "Text block not found." };

  const offendingTerm = detectOperationalFact(row.draftText);
  if (offendingTerm) {
    return {
      ok: false,
      code: "OPERATIONAL_FACT",
      offendingTerm,
      message:
        "Cannot publish: the draft contains an operational fact that must come from structured records.",
    };
  }

  await prisma.websiteText.update({
    where: { id },
    data: {
      publishedText: row.draftText,
      lastPublishedAt: new Date(),
      lastEditorUserId: editorUserId,
    },
  });

  return { ok: true, id };
}

export interface WebsiteTextRow {
  id: string;
  pageKey: string;
  sectionKey: string;
  locale: string;
  draftText: string;
  publishedText: string | null;
  charLimit: number | null;
  lastEditorUserId: string | null;
  lastPublishedAt: Date | null;
  isPublished: boolean;
  hasUnpublishedChanges: boolean;
}

/** List all website-text blocks for the CMS, ordered for stable display. */
export async function listWebsiteTexts(
  prisma: PrismaClient,
): Promise<WebsiteTextRow[]> {
  const rows = await prisma.websiteText.findMany({
    orderBy: [{ pageKey: "asc" }, { sectionKey: "asc" }, { locale: "asc" }],
  });
  return rows.map((r) => ({
    id: r.id,
    pageKey: r.pageKey,
    sectionKey: r.sectionKey,
    locale: r.locale,
    draftText: r.draftText,
    publishedText: r.publishedText,
    charLimit: r.charLimit,
    lastEditorUserId: r.lastEditorUserId,
    lastPublishedAt: r.lastPublishedAt,
    isPublished: r.publishedText != null,
    hasUnpublishedChanges:
      r.publishedText != null && r.publishedText !== r.draftText,
  }));
}
