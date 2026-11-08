import { requireAdmin, visibleFarmScope } from "@/lib/auth";
import { SectionPlaceholder } from "@/components/admin/SectionPlaceholder";

export const dynamic = "force-dynamic";

/**
 * Incidencias (Incidents). Incident log linked to farm/lot/offer/order records,
 * scoped by farm. A high-severity lot incident will offer a lot-withdrawal
 * action in a later phase.
 */
export default async function AdminIncidentsPage() {
  const user = await requireAdmin();
  const scope = visibleFarmScope(user);

  return (
    <SectionPlaceholder
      title="Incidències"
      description="Registre d'incidències enllaçades amb granges, lots, ofertes i comandes, amb severitat i acció correctiva."
      scopeNote={
        scope === null
          ? "Veus totes les incidències (platform_admin)."
          : "Veus només les incidències de la teva granja."
      }
    />
  );
}
