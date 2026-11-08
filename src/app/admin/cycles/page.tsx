import { requireAdmin } from "@/lib/auth";
import { listAdminCycles } from "@/lib/admin/data";
import { CycleRow } from "@/components/admin/CycleRow";

export const dynamic = "force-dynamic";

/**
 * Ciclos (Cycles). Reservation cycles with participating farms, capacity and
 * the open/close/fulfil/cancel/archive lifecycle. Reservations are blocked after
 * the close timestamp. All facts are DB-driven. The CycleOfferAvailability rows
 * surface offers WITHOUT an eligible lot.
 */
export default async function AdminCyclesPage() {
  const user = await requireAdmin();
  const cycles = await listAdminCycles(user);
  const isPlatform = user.role === "platform_admin";

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-bold text-bark-900">Cicles</h1>
        <p className="mt-1 max-w-2xl text-sm text-bark-600">
          Cicles de reserva amb zones, dates, capacitat i granges participants.
          Les reserves es bloquegen passada la data de tancament.
        </p>
      </header>

      <div className="space-y-3">
        {cycles.map((c) => {
          const ineligible = c.offerAvailability.filter((a) => !a.hasEligibleLot).length;
          return (
            <CycleRow
              key={c.id}
              isPlatform={isPlatform}
              cycle={{
                id: c.id,
                name: c.publicTitle ?? c.name,
                zone: c.zone,
                status: c.status ?? "open",
                closeDate: new Date(c.closeAt ?? c.closeDate).toISOString().slice(0, 10),
                totalPlaces: c.totalPlaces,
                freePlaces: c.freePlaces,
                orderCount: c._count.orders,
                farms: c.farms.map((f) => ({ id: f.farmId, name: f.farm.name })),
                ineligibleOffers: ineligible,
              }}
            />
          );
        })}
        {cycles.length === 0 && (
          <p className="text-sm text-bark-500">Cap cicle encara.</p>
        )}
      </div>
    </div>
  );
}
