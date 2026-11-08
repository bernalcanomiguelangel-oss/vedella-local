import { requireAdmin, visibleFarmScope } from "@/lib/auth";
import { listIncidents } from "@/lib/admin/incidents";
import { prisma } from "@/lib/db";
import { IncidentsPanel } from "@/components/admin/IncidentsPanel";

export const dynamic = "force-dynamic";

/**
 * Incidencias (Incidents, §3.8). List + create, linking to structured records.
 * A high-severity lot incident offers "withdraw lot + list affected unfulfilled
 * orders". Farm managers see only their own-farm incidents (scoped in the data
 * layer). All actions are audited server-side.
 */
export default async function AdminIncidentsPage() {
  const user = await requireAdmin();
  const scope = visibleFarmScope(user);

  const [incidents, farms] = await Promise.all([
    listIncidents(prisma, user),
    scope === null
      ? prisma.farm.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } })
      : prisma.farm.findMany({
          where: { id: { in: scope } },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        }),
  ]);

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-bark-900">Incidències</h1>
      <p className="mt-1 max-w-2xl text-sm text-bark-600">
        Registre d&apos;incidències enllaçades amb granges, lots, ofertes i comandes,
        amb severitat i acció correctiva.
      </p>
      <p className="mt-2 text-xs text-bark-500" data-testid="scope-note">
        {scope === null
          ? "Veus totes les incidències (platform_admin)."
          : "Veus només les incidències de la teva granja."}
      </p>

      <IncidentsPanel
        isPlatform={scope === null}
        incidents={incidents.map((i) => ({
          id: i.id,
          reference: i.reference,
          category: i.category,
          severity: i.severity,
          status: i.status,
          description: i.description,
          canWithdrawLot: i.canWithdrawLot,
          reportedAt: i.reportedAt.toISOString().slice(0, 10),
        }))}
        farms={farms}
      />
    </div>
  );
}
