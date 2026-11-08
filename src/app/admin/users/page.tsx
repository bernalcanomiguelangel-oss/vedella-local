import { requirePlatformAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { UsersPanel } from "@/components/admin/UsersPanel";

export const dynamic = "force-dynamic";

/**
 * Usuarios y permisos (Users & permissions, §3.10). Platform-only UI over the
 * FEAT-001 create-user / assign-role / assign-farm server actions. New accounts
 * are NEVER auto-admin and are created with a temporary password
 * (mustChangePassword=true). Assigning a farm respects the unique User.farmId.
 */
export default async function AdminUsersPage() {
  await requirePlatformAdmin();

  const [users, farms] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        farmId: true,
        mustChangePassword: true,
      },
    }),
    prisma.farm.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  // Which farms already have a manager (unique User.farmId).
  const takenFarmIds = new Set(
    users.filter((u) => u.farmId).map((u) => u.farmId as string),
  );
  const farmById = new Map(farms.map((f) => [f.id, f.name]));

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-bark-900">
        Usuaris i permisos
      </h1>
      <p className="mt-1 max-w-2xl text-sm text-bark-600">
        Crea usuaris, assigna rol i vincula una granja als gestors. Cap compte nou
        és administrador per defecte; es crea amb contrasenya temporal i canvi
        obligatori al primer accés.
      </p>

      <UsersPanel
        users={users.map((u) => ({
          id: u.id,
          email: u.email,
          name: u.name,
          role: u.role,
          farmName: u.farmId ? farmById.get(u.farmId) ?? null : null,
          mustChangePassword: u.mustChangePassword,
        }))}
        farms={farms.map((f) => ({
          id: f.id,
          name: f.name,
          hasManager: takenFarmIds.has(f.id),
        }))}
      />
    </div>
  );
}
