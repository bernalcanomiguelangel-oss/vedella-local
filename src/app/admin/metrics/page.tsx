import { requireAdmin } from "@/lib/auth";
import { loadMetricsDashboard } from "@/lib/admin/metrics-data";
import { formatCents } from "@/lib/pricing";
import { RunMetricsButton } from "@/components/admin/RunMetricsButton";

export const dynamic = "force-dynamic";

/**
 * Metrics dashboard. Shows the weekly average market price per cut (the
 * FEAT-003 deterministic metric — AI never invents the numbers) plus basic
 * marketplace counts. Test records are excluded from the production figures.
 */
export default async function AdminMetricsPage({
  searchParams,
}: {
  searchParams?: { week?: string };
}) {
  await requireAdmin();
  // Optional ?week=YYYY-MM-DD lets an admin inspect a historical ISO week; the
  // default (no param) is the current week, which the seed now populates.
  const weekParam = searchParams?.week;
  const reference =
    weekParam && !Number.isNaN(new Date(weekParam).getTime())
      ? new Date(weekParam)
      : new Date();
  const data = await loadMetricsDashboard(reference);

  const m = data.marketplace;
  const cards = [
    { label: "Granges actives", value: m.activeFarms },
    { label: "Productes actius", value: m.activeProducts },
    { label: "Pendents de revisió", value: m.pendingRecords },
    { label: "Reserves", value: m.openOrders },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Mètriques del mercat</h1>
          <p className="mt-1 text-sm text-pasture-600">
            Preu mitjà setmanal per tall (setmana ISO que comença el{" "}
            <b>{data.weekStart}</b>). Els registres de prova queden exclosos.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {/* Week selector: GET form so an admin can inspect any ISO week. */}
          <form method="get" className="flex items-center gap-2">
            <label htmlFor="week" className="text-sm text-pasture-600">
              Setmana
            </label>
            <input
              type="date"
              id="week"
              name="week"
              defaultValue={weekParam ?? ""}
              data-testid="metrics-week"
              className="rounded-lg border border-pasture-200 px-2 py-1 text-sm"
            />
            <button
              type="submit"
              className="rounded-lg bg-pasture-100 px-3 py-1 text-sm font-semibold text-pasture-700 hover:bg-pasture-200"
            >
              Veure
            </button>
          </form>
          <RunMetricsButton />
        </div>
      </div>

      {/* Marketplace counts */}
      <div className="mt-6 grid gap-4 sm:grid-cols-4">
        {cards.map((c) => (
          <div
            key={c.label}
            className="rounded-2xl bg-cream-50 p-4 shadow-sm ring-1 ring-pasture-100"
          >
            <p className="text-xs font-semibold text-pasture-500">{c.label}</p>
            <p className="mt-1 text-3xl font-extrabold">{c.value}</p>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-pasture-400">
        {m.testRecordsExcluded} registres <code>isTest</code> exclosos de les
        xifres de producció.
      </p>

      {/* Weekly average price per cut */}
      <section className="mt-8">
        <h2 className="mb-3 text-lg font-bold">
          Preu mitjà del mercat per tall · setmana {data.weekStart}
        </h2>
        {data.perCut.length === 0 ? (
          <p className="rounded-2xl bg-cream-50 p-5 text-sm text-pasture-600 ring-1 ring-pasture-100">
            No hi ha talls amb lots empaquetats en aquesta setmana ISO. Executa
            la feina setmanal o consulta una altra setmana.
          </p>
        ) : (
          <div className="overflow-hidden rounded-2xl ring-1 ring-pasture-100">
            <table className="w-full text-sm" data-testid="metrics-table">
              <thead className="bg-pasture-100 text-left text-pasture-700">
                <tr>
                  <th className="px-4 py-2">Tall</th>
                  <th className="px-4 py-2">Preu mitjà</th>
                  <th className="px-4 py-2">Mostres</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-pasture-100 bg-cream-50">
                {data.perCut.map((c) => (
                  <tr key={c.cutName} data-testid="metrics-row">
                    <td className="px-4 py-2 font-medium">{c.cutName}</td>
                    <td className="px-4 py-2 font-semibold">
                      {formatCents(c.avgPriceCents)}
                    </td>
                    <td className="px-4 py-2 text-pasture-500">
                      {c.sampleCount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Persisted snapshot history */}
      {data.snapshots.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-bold">
            Històric de snapshots (MarketPriceSnapshot)
          </h2>
          <div className="overflow-hidden rounded-2xl ring-1 ring-pasture-100">
            <table className="w-full text-sm">
              <thead className="bg-pasture-100 text-left text-pasture-700">
                <tr>
                  <th className="px-4 py-2">Setmana</th>
                  <th className="px-4 py-2">Tall</th>
                  <th className="px-4 py-2">Preu mitjà</th>
                  <th className="px-4 py-2">Mostres</th>
                  <th className="px-4 py-2">Generat per</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-pasture-100 bg-cream-50">
                {data.snapshots.map((s, i) => (
                  <tr key={`${s.cutName}-${s.weekStart}-${i}`}>
                    <td className="px-4 py-2">{s.weekStart}</td>
                    <td className="px-4 py-2 font-medium">{s.cutName}</td>
                    <td className="px-4 py-2 font-semibold">
                      {formatCents(s.avgPriceCents)}
                    </td>
                    <td className="px-4 py-2 text-pasture-500">
                      {s.sampleCount}
                    </td>
                    <td className="px-4 py-2 text-pasture-400">
                      {s.generatedBy}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
