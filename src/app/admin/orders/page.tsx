import Link from "next/link";
import { requireAdmin, visibleFarmScope } from "@/lib/auth";
import { listAdminOrders } from "@/lib/admin/data";
import { formatCents } from "@/lib/pricing";

export const dynamic = "force-dynamic";

const STATUSES = ["all", "reserved", "confirmed", "fulfilling", "fulfilled", "cancelled"];

/**
 * Pedidos (Orders). Filterable order list with explicit fulfilment statuses.
 * Multi-farm orders split into farm-level FulfilmentGroups so each farm sees
 * only its slice. A farm_manager sees ONLY orders with a group for their farm.
 * Historical orders keep their preserved snapshot (R14).
 */
export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams?: { status?: string };
}) {
  const user = await requireAdmin();
  const scope = visibleFarmScope(user);
  const status = searchParams?.status ?? "all";
  const orders = await listAdminOrders(user, status);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-display text-2xl font-bold text-bark-900">Comandes</h1>
        <p className="mt-1 max-w-2xl text-sm text-bark-600">
          {scope === null
            ? "Totes les comandes del mercat."
            : "Només els grups de preparació de la teva granja."}
        </p>
      </header>

      <nav className="flex flex-wrap gap-2" data-testid="orders-status-filter">
        {STATUSES.map((s) => (
          <Link
            key={s}
            href={`/admin/orders?status=${s}`}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              s === status
                ? "bg-bark-700 text-cream-50"
                : "bg-cream-50 text-bark-700 ring-1 ring-bark-200"
            }`}
          >
            {s}
          </Link>
        ))}
      </nav>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-bark-500">
            <th className="py-1">Comanda</th>
            <th>Cicle</th>
            <th>Estat</th>
            <th>Total</th>
            <th>Granges (slices)</th>
            <th>Lot snapshot</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => {
            // A farm_manager only sees the fulfilment groups for their farm.
            const groups =
              scope === null
                ? o.fulfilmentGroups
                : o.fulfilmentGroups.filter((g) => scope.includes(g.farmId));
            return (
              <tr key={o.id} className="border-t border-bark-100 align-top">
                <td className="py-1 font-mono text-xs">{o.id.slice(0, 8)}</td>
                <td>{o.cycle?.name ?? "—"}</td>
                <td>
                  <span className="rounded-full bg-cream-100 px-2 py-0.5 text-xs">
                    {o.status}
                  </span>
                </td>
                <td>{formatCents(o.totalCents)}</td>
                <td>
                  {groups.length > 0
                    ? groups.map((g) => (
                        <span key={g.id} className="mr-1 inline-block rounded bg-gold-50 px-1.5 py-0.5 text-xs">
                          {g.farm.name}: {formatCents(g.subtotalCents)} · {g.status}
                        </span>
                      ))
                    : "—"}
                </td>
                <td className="font-mono text-xs">{o.lotReferenceSnapshot || "—"}</td>
              </tr>
            );
          })}
          {orders.length === 0 && (
            <tr>
              <td colSpan={6} className="py-2 text-bark-500">
                Cap comanda per aquest filtre.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
