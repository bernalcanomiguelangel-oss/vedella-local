/**
 * Dependency-free, server-rendered SVG bar chart (FEAT-005). No charting
 * library is installed (the build has no reliable network; see README) so
 * charts are plain SVG computed from a ChartSeries. Renders an empty state when
 * the series is empty and a small-sample caveat when flagged
 * (analytics-dictionary §1/§4).
 */
import type { ChartSeries } from "@/lib/admin/chart-series";

export function BarChart({
  series,
  title,
  emptyLabel,
  smallSampleLabel,
  format,
}: {
  series: ChartSeries;
  title: string;
  emptyLabel: string;
  smallSampleLabel: string;
  format?: (value: number) => string;
}) {
  const fmt = format ?? ((v: number) => String(v));

  if (series.isEmpty) {
    return (
      <figure
        data-testid="chart-empty"
        className="rounded-2xl bg-cream-50 p-5 ring-1 ring-pasture-100"
      >
        <figcaption className="mb-2 text-sm font-semibold text-pasture-700">
          {title}
        </figcaption>
        <p className="text-sm text-pasture-500">{emptyLabel}</p>
      </figure>
    );
  }

  const barHeight = 22;
  const gap = 10;
  const labelWidth = 150;
  const chartWidth = 320;
  const height = series.points.length * (barHeight + gap);

  return (
    <figure className="rounded-2xl bg-cream-50 p-5 ring-1 ring-pasture-100">
      <figcaption className="mb-3 text-sm font-semibold text-pasture-700">
        {title}
      </figcaption>
      {series.sampleTooSmall && (
        <p
          data-testid="chart-small-sample"
          className="mb-2 text-xs font-medium text-beef-700"
        >
          {smallSampleLabel}
        </p>
      )}
      <svg
        role="img"
        aria-label={title}
        width="100%"
        viewBox={`0 0 ${labelWidth + chartWidth + 60} ${height}`}
        className="overflow-visible"
      >
        {series.points.map((p, i) => {
          const y = i * (barHeight + gap);
          const w =
            series.max > 0 ? Math.round((p.value / series.max) * chartWidth) : 0;
          return (
            <g key={p.label}>
              <text
                x={0}
                y={y + barHeight / 2 + 4}
                className="fill-pasture-700"
                fontSize={12}
              >
                {p.label}
              </text>
              <rect
                x={labelWidth}
                y={y}
                width={Math.max(w, 1)}
                height={barHeight}
                rx={4}
                className="fill-pasture-500"
              />
              <text
                x={labelWidth + Math.max(w, 1) + 6}
                y={y + barHeight / 2 + 4}
                className="fill-pasture-600"
                fontSize={12}
              >
                {fmt(p.value)}
              </text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
