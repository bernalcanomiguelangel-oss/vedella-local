import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { loadMetricsDashboard } from "@/lib/admin/metrics-data";
import { loadAnalyticsDashboard } from "@/lib/admin/analytics-dashboard";
import {
  parseMetricFilters,
  buildMetricsQuery,
} from "@/lib/admin/metrics-filters";
import { CHANNELS } from "@/lib/analytics";
import { formatCents } from "@/lib/pricing";
import { BarChart } from "@/components/admin/BarChart";
import { RunMetricsButton } from "@/components/admin/RunMetricsButton";

export const dynamic = "force-dynamic";

/** Format a ratio KPI as a percentage. */
function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

/**
 * Metrics dashboard (FEAT-005). Two tiers:
 *  - farm_manager  : own-farm metrics only (scoped at the data layer).
 *  - platform_admin: platform-wide aggregates + drill-down into any single farm.
 *
 * Shows KPI cards (NO margin/cost card — decision 2), multi-farm cards, charts
 * rendered from real DB rows as server-side SVG, a URL-encoded filter bar with a
 * reset, the interested (notify-me) list, and the existing weekly average price
 * per cut. Every card links to the pre-filtered record list.
 */
export default async function AdminMetricsPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const user = await requireAdmin();
  const filters = parseMetricFilters(searchParams);

  const dashboard = await loadAnalyticsDashboard(user, filters);
  const { metrics, charts, interested, farmOptions, scopedFarmId } = dashboard;
  const isPlatform = user.role === "platform_admin";

  // Weekly average price per cut (existing FEAT-003 surface).
  const weekParam = filters.raw.week;
  const reference =
    weekParam && !Number.isNaN(new Date(weekParam).getTime())
      ? new Date(weekParam)
      : new Date();
  const weekly = await loadMetricsDashboard(reference);

  const k = metrics.kpis;
  // KPI cards. Explicitly NO margin/cost card (decision 2).
  const kpiCards: {
    label: string;
    display: string;
    kpiKey: string;
    drill?: string;
  }[] = [
    {
      label: "Ingressos registrats",
      display: formatCents(k.recordedRevenue.value),
      kpiKey: "recordedRevenue",
      drill: "confirmed",
    },
    {
      label: "Reserves",
      display: String(k.reservations.value),
      kpiKey: "reservations",
    },
    {
      label: "Valor mitjà de comanda",
      display: formatCents(k.aov.value),
      kpiKey: "aov",
    },
    {
      label: "Conversió",
      display: pct(k.conversion.value),
      kpiKey: "conversion",
    },
    {
      label: "Cost d'enviament / comanda",
      display: formatCents(k.deliveryCostPerOrder.value),
      kpiKey: "deliveryCostPerOrder",
    },
    {
      label: "Compra repetida",
      display: pct(k.repeatPurchase.value),
      kpiKey: "repeatPurchase",
    },
    {
      label: "Interès pròxim cicle",
      display: pct(k.interestNextCycle.value),
      kpiKey: "interestNextCycle",
    },
  ];

  const resetHref = "/admin/metrics";

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Mètriques</h1>
          <p className="mt-1 text-sm text-pasture-600">
            {isPlatform
              ? scopedFarmId
                ? "Vista d'una sola granja (desglossament)."
                : "Vista global de la plataforma."
              : "Les mètriques de la teva granja."}{" "}
            Els registres de prova queden exclosos per defecte.
          </p>
        </div>
        <RunMetricsButton />
      </div>

      {/* Filter bar: URL-encoded state + reset + test-excluded default. */}
      <form
        method="get"
        data-testid="metrics-filters"
        className="mt-5 grid gap-3 rounded-2xl bg-cream-50 p-4 ring-1 ring-pasture-100 sm:grid-cols-2 lg:grid-cols-4"
      >
        {isPlatform && (
          <label className="text-xs font-semibold text-pasture-600">
            Granja
            <select
              name="farmId"
              defaultValue={filters.raw.farmId}
              className="mt-1 w-full rounded-lg border border-pasture-200 px-2 py-1 text-sm"
            >
              <option value="">Tota la plataforma</option>
              {farmOptions.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="text-xs font-semibold text-pasture-600">
          Des de
          <input
            type="date"
            name="from"
            defaultValue={filters.raw.from}
            className="mt-1 w-full rounded-lg border border-pasture-200 px-2 py-1 text-sm"
          />
        </label>
        <label className="text-xs font-semibold text-pasture-600">
          Fins a
          <input
            type="date"
            name="to"
            defaultValue={filters.raw.to}
            className="mt-1 w-full rounded-lg border border-pasture-200 px-2 py-1 text-sm"
          />
        </label>
        <label className="text-xs font-semibold text-pasture-600">
          Idioma
          <select
            name="language"
            defaultValue={filters.raw.language}
            className="mt-1 w-full rounded-lg border border-pasture-200 px-2 py-1 text-sm"
          >
            <option value="">Tots</option>
            <option value="ca">ca</option>
            <option value="es">es</option>
            <option value="en">en</option>
          </select>
        </label>
        <label className="text-xs font-semibold text-pasture-600">
          Canal
          <select
            name="channel"
            defaultValue={filters.raw.channel}
            className="mt-1 w-full rounded-lg border border-pasture-200 px-2 py-1 text-sm"
          >
            <option value="">Tots</option>
            {CHANNELS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold text-pasture-600">
          Lliurament
          <select
            name="deliveryMethod"
            defaultValue={filters.raw.deliveryMethod}
            className="mt-1 w-full rounded-lg border border-pasture-200 px-2 py-1 text-sm"
          >
            <option value="">Tots</option>
            <option value="delivery">delivery</option>
            <option value="pickup">pickup</option>
          </select>
        </label>
        <label className="text-xs font-semibold text-pasture-600">
          Estat
          <select
            name="status"
            defaultValue={filters.raw.status}
            className="mt-1 w-full rounded-lg border border-pasture-200 px-2 py-1 text-sm"
          >
            <option value="">Per defecte</option>
            <option value="all">Tots</option>
            <option value="reserved">reserved</option>
            <option value="confirmed">confirmed</option>
            <option value="fulfilling">fulfilling</option>
            <option value="fulfilled">fulfilled</option>
            <option value="cancelled">cancelled</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs font-semibold text-pasture-600">
          <input
            type="checkbox"
            name="includeTest"
            value="1"
            defaultChecked={filters.includeTest}
          />
          Inclou dades de prova
        </label>
        <div className="flex items-end gap-2">
          <button
            type="submit"
            className="rounded-lg bg-pasture-600 px-3 py-1.5 text-sm font-semibold text-cream-50 hover:bg-pasture-700"
          >
            Aplica
          </button>
          <Link
            href={resetHref}
            data-testid="metrics-reset"
            className="rounded-lg bg-pasture-100 px-3 py-1.5 text-sm font-semibold text-pasture-700 hover:bg-pasture-200"
          >
            Reinicia
          </Link>
        </div>
      </form>

      {/* KPI cards — NO margin/cost card (decision 2). */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpiCards.map((c) => {
          const kpi = k[c.kpiKey];
          const drillQuery = buildMetricsQuery(filters.raw, {
            status: c.drill === "confirmed" ? "confirmed" : filters.raw.status,
          });
          return (
            <Link
              key={c.kpiKey}
              href={`/admin/orders${drillQuery}`}
              data-testid={`kpi-${c.kpiKey}`}
              className="rounded-2xl bg-cream-50 p-4 shadow-sm ring-1 ring-pasture-100 transition hover:ring-pasture-300"
            >
              <p className="text-xs font-semibold text-pasture-500">
                {c.label}
              </p>
              <p className="mt-1 text-2xl font-extrabold">{c.display}</p>
              {kpi.sampleTooSmall && (
                <p className="mt-1 text-xs font-medium text-beef-700">
                  Mostra massa petita ({kpi.sampleCount})
                </p>
              )}
            </Link>
          );
        })}
      </div>

      {/* Multi-farm cards: platform scope only. */}
      {isPlatform && !scopedFarmId && (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-bold">Cartes multi-granja</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl bg-cream-50 p-4 ring-1 ring-pasture-100">
              <p className="text-xs font-semibold text-pasture-500">
                Granges actives
              </p>
              <p className="mt-1 text-3xl font-extrabold">
                {metrics.multiFarm.activeFarms}
              </p>
            </div>
            <div className="rounded-2xl bg-cream-50 p-4 ring-1 ring-pasture-100">
              <p className="text-xs font-semibold text-pasture-500">
                Comandes pendents de confirmació de granja
              </p>
              <p className="mt-1 text-3xl font-extrabold">
                {metrics.multiFarm.ordersAwaitingFarmConfirmation}
              </p>
            </div>
            <div className="rounded-2xl bg-cream-50 p-4 ring-1 ring-pasture-100">
              <p className="text-xs font-semibold text-pasture-500">
                Ofertes amb poca disponibilitat
              </p>
              <p className="mt-1 text-3xl font-extrabold">
                {metrics.multiFarm.lowAvailabilityOffers}
              </p>
            </div>
          </div>
          {metrics.multiFarm.revenueByFarm.length > 0 && (
            <div className="mt-4 overflow-hidden rounded-2xl ring-1 ring-pasture-100">
              <table className="w-full text-sm">
                <thead className="bg-pasture-100 text-left text-pasture-700">
                  <tr>
                    <th className="px-4 py-2">Granja</th>
                    <th className="px-4 py-2">Ingressos</th>
                    <th className="px-4 py-2">Reserves</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-pasture-100 bg-cream-50">
                  {metrics.multiFarm.revenueByFarm.map((r) => (
                    <tr key={r.farmId}>
                      <td className="px-4 py-2 font-medium">{r.farmName}</td>
                      <td className="px-4 py-2 font-semibold">
                        {formatCents(r.revenueCents)}
                      </td>
                      <td className="px-4 py-2 text-pasture-600">
                        {r.reservations}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <Link
                          href={`/admin/metrics${buildMetricsQuery(filters.raw, { farmId: r.farmId })}`}
                          className="text-xs font-semibold text-pasture-700 underline"
                        >
                          Desglossa
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Charts from real DB rows (server-rendered SVG). */}
      <section className="mt-8">
        <h2 className="mb-3 text-lg font-bold">Gràfics</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          {isPlatform && !scopedFarmId && (
            <BarChart
              series={charts.revenueByFarm}
              title="Ingressos per granja"
              emptyLabel="Encara no hi ha ingressos registrats."
              smallSampleLabel="Mostra massa petita per ser fiable."
              format={formatCents}
            />
          )}
          <BarChart
            series={charts.funnel}
            title="Embut de conversió"
            emptyLabel="Encara no hi ha visites registrades."
            smallSampleLabel="Mostra massa petita per ser fiable."
          />
          <BarChart
            series={charts.reservationsByChannel}
            title="Sessions per canal"
            emptyLabel="Encara no hi ha sessions registrades."
            smallSampleLabel="Mostra massa petita per ser fiable."
          />
          <BarChart
            series={charts.demandByLanguage}
            title="Demanda per idioma"
            emptyLabel="Encara no hi ha visites registrades."
            smallSampleLabel="Mostra massa petita per ser fiable."
          />
          <BarChart
            series={charts.deliveryVsPickup}
            title="Lliurament vs recollida"
            emptyLabel="Encara no hi ha preferència registrada."
            smallSampleLabel="Mostra massa petita per ser fiable."
          />
        </div>
      </section>

      {/* Interested (notify-me) list — opt-in emails only. */}
      <section className="mt-8">
        <h2 className="mb-3 text-lg font-bold">
          Interessats pel pròxim cicle ({interested.length})
        </h2>
        {interested.length === 0 ? (
          <p className="rounded-2xl bg-cream-50 p-5 text-sm text-pasture-600 ring-1 ring-pasture-100">
            Encara ningú no ha deixat el seu correu.
          </p>
        ) : (
          <div className="overflow-hidden rounded-2xl ring-1 ring-pasture-100">
            <table className="w-full text-sm" data-testid="interested-table">
              <thead className="bg-pasture-100 text-left text-pasture-700">
                <tr>
                  <th className="px-4 py-2">Correu</th>
                  <th className="px-4 py-2">Idioma</th>
                  <th className="px-4 py-2">Data</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-pasture-100 bg-cream-50">
                {interested.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-2 font-medium">{r.email}</td>
                    <td className="px-4 py-2 text-pasture-600">
                      {r.locale ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-pasture-500">
                      {r.createdAt.toISOString().slice(0, 10)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Weekly average market price per cut (FEAT-003). */}
      <section className="mt-8">
        <h2 className="mb-3 text-lg font-bold">
          Preu mitjà del mercat per tall · setmana {weekly.weekStart}
        </h2>
        {weekly.perCut.length === 0 ? (
          <p className="rounded-2xl bg-cream-50 p-5 text-sm text-pasture-600 ring-1 ring-pasture-100">
            No hi ha talls amb lots empaquetats en aquesta setmana ISO.
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
                {weekly.perCut.map((c) => (
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
    </div>
  );
}
