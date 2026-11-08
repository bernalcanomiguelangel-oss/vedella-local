import { requireAdmin, visibleFarmScope } from "@/lib/auth";
import { SectionPlaceholder } from "@/components/admin/SectionPlaceholder";

export const dynamic = "force-dynamic";

/**
 * Granjas (Farms). List + detail of farms, scoped by role: a farm_manager sees
 * only their own farm, platform_admin sees all. Full CRUD + public-readiness
 * diagnostics land in a later phase.
 */
export default async function AdminFarmsPage() {
  const user = await requireAdmin();
  const scope = visibleFarmScope(user);

  return (
    <SectionPlaceholder
      title="Granges"
      description="Llista i fitxa de les granges del mercat, amb el panell de preparació per publicar."
      scopeNote={
        scope === null
          ? "Veus totes les granges (platform_admin)."
          : `Veus només la teva granja (${scope.join(", ") || "cap"}).`
      }
    />
  );
}
