import { requireAdmin, visibleFarmScope } from "@/lib/auth";
import { SectionPlaceholder } from "@/components/admin/SectionPlaceholder";

export const dynamic = "force-dynamic";

/**
 * Productos y packs (Products & packs). Definitions (canonical cut catalogue),
 * farm-specific offers and single/multi-farm packs. A farm_manager edits only
 * their own offers/packs; platform_admin manages all. Full editors land later.
 */
export default async function AdminProductsPage() {
  const user = await requireAdmin();
  const scope = visibleFarmScope(user);

  return (
    <SectionPlaceholder
      title="Productes i packs"
      description="Definicions canòniques de talls, ofertes per granja i packs d'una o diverses granges."
      scopeNote={
        scope === null
          ? "Veus totes les ofertes i packs (platform_admin)."
          : "Edites només les ofertes i packs de la teva granja."
      }
    />
  );
}
