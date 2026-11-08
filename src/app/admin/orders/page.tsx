import { requireAdmin, visibleFarmScope } from "@/lib/auth";
import { SectionPlaceholder } from "@/components/admin/SectionPlaceholder";

export const dynamic = "force-dynamic";

/**
 * Pedidos (Orders). Filterable order list with explicit fulfilment statuses.
 * Multi-farm orders split into farm-level fulfilment groups so each farm sees
 * only its slice. The `?status=` query (used by the Overview action lists) will
 * drive the filter bar when the full list lands.
 */
export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams?: { status?: string };
}) {
  const user = await requireAdmin();
  const scope = visibleFarmScope(user);
  const status = searchParams?.status;

  return (
    <SectionPlaceholder
      title="Comandes"
      description="Llista filtrable de comandes amb estats explícits de preparació i lliurament; les comandes multigranja es divideixen per granja."
      scopeNote={
        scope === null
          ? "Veus totes les comandes (platform_admin)."
          : "Veus només els grups de preparació de la teva granja."
      }
    >
      {status && (
        <p
          className="mt-3 inline-block rounded-full bg-gold-100 px-3 py-1 text-xs font-semibold text-bark-800"
          data-testid="orders-status-filter"
        >
          Filtre d&apos;estat: {status}
        </p>
      )}
    </SectionPlaceholder>
  );
}
