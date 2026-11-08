import { requireAdmin } from "@/lib/auth";
import { listAdminLots, listAdminOffers } from "@/lib/admin/data";
import { LotCreateForm } from "@/components/admin/LotCreateForm";

export const dynamic = "force-dynamic";

/**
 * Lotes (Lots). Traceability lots scoped by farm, with a create form that
 * enforces offer-belongs-to-farm, date ordering, unique reference and units>=0
 * server-side. A farm_manager's new lot is a traceability change: it routes the
 * backing offer through review (per rule B).
 */
export default async function AdminLotsPage() {
  const user = await requireAdmin();
  const [lots, offers] = await Promise.all([
    listAdminLots(user),
    listAdminOffers(user),
  ]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-bold text-bark-900">Lots</h1>
        <p className="mt-1 max-w-2xl text-sm text-bark-600">
          Lots de traçabilitat (granja → lot → tall → paquet) amb validació de
          dates i referència única.
        </p>
      </header>

      <LotCreateForm
        role={user.role}
        offers={offers.map((o) => ({
          id: o.id,
          label: `${o.farmName} · ${o.publicName}`,
          farmId: o.farmId,
        }))}
      />

      <section>
        <h2 className="font-semibold text-bark-800">Lots existents</h2>
        <table className="mt-2 w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-bark-500">
              <th className="py-1">Referència</th>
              <th>Granja</th>
              <th>Oferta</th>
              <th>Unitats</th>
              <th>Caducitat</th>
              <th>Estat</th>
            </tr>
          </thead>
          <tbody>
            {lots.map((l) => (
              <tr key={l.id} className="border-t border-bark-100">
                <td className="py-1 font-mono text-xs">{l.reference}</td>
                <td>{l.farm.name}</td>
                <td>{l.offer?.publicName ?? "—"}</td>
                <td>{l.units}</td>
                <td>{new Date(l.expiryDate).toISOString().slice(0, 10)}</td>
                <td>
                  {l.isWithdrawn ? (
                    <span className="text-red-600">retirat</span>
                  ) : (
                    <span className="text-olive-700">actiu</span>
                  )}
                </td>
              </tr>
            ))}
            {lots.length === 0 && (
              <tr>
                <td colSpan={6} className="py-2 text-bark-500">
                  Cap lot visible.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
