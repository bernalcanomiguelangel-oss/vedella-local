import { prisma } from "@/lib/db";
import { loginAs } from "@/lib/admin/session-actions";

export const dynamic = "force-dynamic";

/**
 * Dev login / role selector. Lists the seeded users and signs in as the chosen
 * one. This is a development convenience (no external auth provider is wired);
 * all authorisation is still enforced server-side on every admin page/action.
 */
export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const users = await prisma.user.findMany({ orderBy: { role: "asc" } });

  const roleLabel: Record<string, string> = {
    platform_admin: "Administrador de plataforma",
    farm_manager: "Gestor de granja",
    customer: "Client",
  };

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-2xl font-bold">Accés a l&apos;administració</h1>
      <p className="mt-2 text-sm text-pasture-600">
        Selector de rol de desenvolupament. Tria una identitat sembrada. La
        validació de permisos s&apos;aplica sempre al servidor.
      </p>

      {searchParams.error && (
        <p className="mt-4 rounded-lg bg-beef-50 p-3 text-sm text-beef-800 ring-1 ring-beef-200">
          No s&apos;ha pogut iniciar la sessió ({searchParams.error}).
        </p>
      )}

      <ul className="mt-6 space-y-3">
        {users.map((u) => (
          <li
            key={u.id}
            className="flex items-center justify-between gap-4 rounded-2xl bg-cream-50 p-4 shadow-sm ring-1 ring-pasture-100"
          >
            <div>
              <p className="font-semibold">{u.name ?? u.email}</p>
              <p className="text-sm text-pasture-500">{u.email}</p>
              <p className="mt-1 inline-block rounded-full bg-pasture-100 px-2 py-0.5 text-xs font-semibold text-pasture-700">
                {roleLabel[u.role] ?? u.role}
              </p>
            </div>
            <form action={loginAs.bind(null, u.id)}>
              <button
                type="submit"
                data-testid={`login-${u.role}`}
                className="rounded-full bg-beef-600 px-4 py-2 text-sm font-semibold text-cream-50 hover:bg-beef-700"
              >
                Entra com a {roleLabel[u.role] ?? u.role}
              </button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
