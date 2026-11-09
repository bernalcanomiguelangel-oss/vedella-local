import { login } from "@/lib/admin/session-actions";

export const dynamic = "force-dynamic";

/**
 * Admin login: email + password. The password is verified server-side against a
 * salted bcrypt hash; all authorisation is enforced server-side on every admin
 * page and action regardless of what the client submits. Accounts that carry a
 * temporary password are routed to the forced change-password flow before any
 * protected page is reachable.
 */
export default function AdminLoginPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const hasError = Boolean(searchParams.error);

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-2xl font-bold">Accés a l&apos;administració</h1>
      <p className="mt-2 text-sm text-pasture-600">
        Introdueix el teu correu i contrasenya. La validació de credencials i de
        permisos s&apos;aplica sempre al servidor.
      </p>

      {hasError && (
        <p
          data-testid="login-error"
          className="mt-4 rounded-lg bg-beef-50 p-3 text-sm text-beef-800 ring-1 ring-beef-200"
        >
          No s&apos;ha pogut iniciar la sessió. Comprova el correu i la
          contrasenya.
        </p>
      )}

      <form action={login} className="mt-6 space-y-4">
        <div>
          <label
            htmlFor="email"
            className="block text-sm font-semibold text-pasture-700"
          >
            Correu electrònic
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            required
            data-testid="login-email"
            className="mt-1 w-full rounded-xl border border-pasture-200 px-3 py-2 text-sm focus:border-beef-500 focus:outline-none focus:ring-1 focus:ring-beef-500"
          />
        </div>
        <div>
          <label
            htmlFor="password"
            className="block text-sm font-semibold text-pasture-700"
          >
            Contrasenya
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            data-testid="login-password"
            className="mt-1 w-full rounded-xl border border-pasture-200 px-3 py-2 text-sm focus:border-beef-500 focus:outline-none focus:ring-1 focus:ring-beef-500"
          />
        </div>
        <button
          type="submit"
          data-testid="login-submit"
          className="w-full rounded-full bg-beef-600 px-4 py-2 text-sm font-semibold text-cream-50 hover:bg-beef-700"
        >
          Inicia la sessió
        </button>
      </form>
    </div>
  );
}
