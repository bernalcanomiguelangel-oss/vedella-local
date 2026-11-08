import { requireAdmin, visibleFarmScope } from "@/lib/auth";
import { SectionPlaceholder } from "@/components/admin/SectionPlaceholder";

export const dynamic = "force-dynamic";

/**
 * Ciclos (Cycles). Reservation cycles with capacity allocation and
 * participating farms. All cycle facts are DB-driven (no hard-coded dates or
 * capacity). Full CRUD lands later.
 */
export default async function AdminCyclesPage() {
  const user = await requireAdmin();
  const scope = visibleFarmScope(user);

  return (
    <SectionPlaceholder
      title="Cicles"
      description="Cicles de reserva amb zones, dates, capacitat total i per granja, tots guardats a la base de dades."
      scopeNote={
        scope === null
          ? "Gestió completa dels cicles (platform_admin)."
          : "Veus la participació de la teva granja en els cicles."
      }
    />
  );
}
