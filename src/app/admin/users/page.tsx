import { requirePlatformAdmin } from "@/lib/auth";
import { SectionPlaceholder } from "@/components/admin/SectionPlaceholder";

export const dynamic = "force-dynamic";

/**
 * Usuarios y permisos (Users & permissions). Platform-only. Create users,
 * assign role and (for a farm_manager) assign a farm. New accounts are NEVER
 * auto-admin. Reuses User.role + User.farmId. Full UI lands later.
 */
export default async function AdminUsersPage() {
  await requirePlatformAdmin();

  return (
    <SectionPlaceholder
      title="Usuaris i permisos"
      description="Crea usuaris, assigna rol i assigna una granja als gestors. Cap compte nou és administrador per defecte."
      scopeNote="Només platform_admin."
    />
  );
}
