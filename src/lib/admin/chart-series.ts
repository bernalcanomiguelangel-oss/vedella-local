/**
 * Pure chart series builders (FEAT-005). Deterministic, dependency-free so they
 * can be unit tested and rendered as server-side SVG (no charting library — the
 * build has no reliable network; see README "Charts"). Each builder returns an
 * `isEmpty` marker and a `sampleTooSmall` caveat flag so the view can show an
 * empty state or a small-sample note rather than a misleading chart
 * (analytics-dictionary §1/§4).
 */
import { SMALL_SAMPLE_THRESHOLD } from "./analytics-metrics";

export interface SeriesPoint {
  label: string;
  value: number;
}

export interface ChartSeries {
  points: SeriesPoint[];
  isEmpty: boolean;
  sampleTooSmall: boolean;
  total: number;
  max: number;
}

/** Build a generic bar/line series from label/value pairs. */
export function buildSeries(
  raw: Array<{ label: string; value: number }>,
): ChartSeries {
  const points = raw.map((r) => ({ label: r.label, value: r.value }));
  const total = points.reduce((s, p) => s + p.value, 0);
  const max = points.reduce((m, p) => Math.max(m, p.value), 0);
  return {
    points,
    isEmpty: points.length === 0 || total === 0,
    sampleTooSmall: total > 0 && total < SMALL_SAMPLE_THRESHOLD,
    total,
    max,
  };
}

/**
 * Build the conversion funnel series from event counts. The funnel is ordered:
 * visits → reservation_started → reservation_completed. Empty when there are no
 * visits at all.
 */
export function buildFunnelSeries(counts: {
  visits: number;
  started: number;
  completed: number;
}): ChartSeries {
  return buildSeries([
    { label: "visits", value: counts.visits },
    { label: "reservation_started", value: counts.started },
    { label: "reservation_completed", value: counts.completed },
  ]);
}
