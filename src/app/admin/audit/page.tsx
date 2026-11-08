import { requireAdmin, visibleFarmScope } from "@/lib/auth";
import { SectionPlaceholder } from "@/components/admin/SectionPlaceholder";

export const dynamic = "force-dynamic";

/**
 * Registro de actividad (Audit log). Read-only browse over the AdminAudit
 * (human actions) and AiRun (AI runs) tables, scoped by farm. The full
 * filterable view lands in a later phase.
 */
export default async function AdminAuditPage() {
  const user = await requireAdmin();
  const scope = visibleFarmScope(user);

  return (
    <SectionPlaceholder
      title="Registre d'activitat"
      description="Historial de només lectura de les accions humanes (AdminAudit) i les execucions d'IA (AiRun)."
      scopeNote={
        scope === null
          ? "Veus tot el registre (platform_admin)."
          : "Veus només les entrades de la teva granja."
      }
    />
  );
}
