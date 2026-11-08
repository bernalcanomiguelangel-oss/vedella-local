/**
 * ISO-8601 week helpers. The weekly metric buckets lots by the ISO week of a
 * reference date. An ISO week starts on Monday; the "week start" is the Monday
 * (UTC) of that week.
 */

/** The UTC Monday that starts the ISO week containing `date`. */
export function isoWeekStart(date: Date): Date {
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  // getUTCDay: 0=Sun..6=Sat. ISO day: Mon=1..Sun=7.
  const isoDay = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - (isoDay - 1));
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/** ISO year+week label, e.g. "2026-W03". Useful for grouping/keys. */
export function isoWeekLabel(date: Date): string {
  const start = isoWeekStart(date);
  // Thursday of the ISO week decides the ISO year.
  const thursday = new Date(start);
  thursday.setUTCDate(start.getUTCDate() + 3);
  const isoYear = thursday.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const week = Math.ceil(
    ((thursday.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}

/** yyyy-mm-dd of the ISO week start (UTC). */
export function isoWeekStartKey(date: Date): string {
  return isoWeekStart(date).toISOString().slice(0, 10);
}
