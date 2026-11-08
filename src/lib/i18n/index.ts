/**
 * i18n for Vedella Local.
 *
 * Two kinds of translation:
 *  1. UI chrome strings: static JSON dictionaries (ca default, es, en).
 *  2. Content (farm/product/pack copy): stored in the Translation table and
 *     resolved per locale using ONLY `approved` entries, with fallback to ca.
 *     (FEAT-003 produces machine translations; a human approves them before they
 *     surface here — this keeps the content model plug-in ready.)
 */
import ca from "./ca.json";
import es from "./es.json";
import en from "./en.json";

export const LOCALES = ["ca", "es", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "ca";

export type Dictionary = typeof ca;

const DICTIONARIES: Record<Locale, Dictionary> = {
  ca,
  es: es as Dictionary,
  en: en as Dictionary,
};

export function isLocale(value: string | undefined | null): value is Locale {
  return !!value && (LOCALES as readonly string[]).includes(value);
}

/** Normalise an incoming segment to a supported locale, defaulting to ca. */
export function resolveLocale(value: string | undefined | null): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

/** Get the UI dictionary for a locale (always falls back to the default). */
export function getDictionary(locale: string | undefined | null): Dictionary {
  return DICTIONARIES[resolveLocale(locale)];
}

export const localeNames: Record<Locale, string> = {
  ca: "Català",
  es: "Español",
  en: "English",
};

/**
 * A translatable content record coming from the DB. We keep this shape minimal
 * so both server components and tests can use it.
 */
export interface TranslationRow {
  entityType: string;
  entityId: string;
  field: string;
  locale: string;
  text: string;
  status: string;
}

/**
 * Build a lookup from a list of Translation rows. Only `approved` rows are
 * considered publishable (ai-guardrails: machine output is human-reviewed
 * before it is shown). The key is `entityType:entityId:field:locale`.
 */
export function buildTranslationIndex(
  rows: TranslationRow[],
): Map<string, string> {
  const index = new Map<string, string>();
  for (const row of rows) {
    if (row.status !== "approved") continue;
    index.set(
      `${row.entityType}:${row.entityId}:${row.field}:${row.locale}`,
      row.text,
    );
  }
  return index;
}

/**
 * Resolve a content field for a locale. Looks up an approved translation for the
 * requested locale; if none exists, falls back to the default locale (ca) value
 * supplied by the caller (the base column on the record).
 */
export function resolveContent(
  index: Map<string, string>,
  entityType: string,
  entityId: string,
  field: string,
  locale: Locale,
  fallbackCa: string,
): string {
  if (locale === DEFAULT_LOCALE) return fallbackCa;
  const hit = index.get(`${entityType}:${entityId}:${field}:${locale}`);
  return hit ?? fallbackCa;
}

/** Interpolate `{name}`-style placeholders in a dictionary string. */
export function interpolate(
  template: string,
  vars: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (_, key) =>
    key in vars ? String(vars[key]) : `{${key}}`,
  );
}
