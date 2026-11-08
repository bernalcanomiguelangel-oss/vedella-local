import { requireAdmin, visibleFarmScope } from "@/lib/auth";
import { SectionPlaceholder } from "@/components/admin/SectionPlaceholder";

export const dynamic = "force-dynamic";

/**
 * Lotes (Lots). Traceability lots scoped by farm. Validation (date ordering,
 * unique reference, composite farm-FK) is enforced server-side when the full
 * create/edit UI lands.
 */
export default async function AdminLotsPage() {
  const user = await requireAdmin();
  const scope = visibleFarmScope(user);

  return (
    <SectionPlaceholder
      title="Lots"
      description="Lots de traçabilitat (granja → lot → tall → paquet) amb validació de dates i referència única."
      scopeNote={
        scope === null
          ? "Veus tots els lots (platform_admin)."
          : "Veus només els lots de la teva granja."
      }
    />
  );
}
