/**
 * Small, dependency-free formatting helpers for public pages. Dates are
 * rendered from the real DB timestamps (never hard-coded strings) using the
 * locale, so the public cycle block stays DB-driven.
 */
import type { Locale } from "./i18n";

const LOCALE_TAG: Record<Locale, string> = {
  ca: "ca-ES",
  es: "es-ES",
  en: "en-GB",
};

/** Format an ISO date string as a localized long date (e.g. "28 de novembre de 2026"). */
export function formatDate(iso: string, locale: Locale): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(LOCALE_TAG[locale] ?? "ca-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}
