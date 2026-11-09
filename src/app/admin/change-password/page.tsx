import { changePassword } from "@/lib/admin/session-actions";
import { requireSession } from "@/lib/auth";
import { MIN_PASSWORD_LENGTH } from "@/lib/password";

export const dynamic = "force-dynamic";

/**
 * Forced / voluntary change-password page. Reachable with an active admin
 * session (requireSession) even while mustChangePassword is still set — this is
 * the page that clears it. The server action enforces the password policy and
 * re-hashes; no password value is ever logged.
 */
export default async function ChangePasswordPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const user = await requireSession();
  const forced = user.mustChangePassword;

  const errorMessage =
    searchParams.error === "mismatch"
      ? "Les contrasenyes no coincideixen."
      : searchParams.error === "policy"
        ? `La contrasenya ha de tenir com a mínim ${MIN_PASSWORD_LENGTH} caràcters.`
        : null;

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-2xl font-bold">Canvia la contrasenya</h1>
      {forced ? (
        <p
          data-testid="change-password-forced"
          className="mt-2 text-sm text-beef-700"
        >
          El teu compte utilitza una contrasenya temporal. Has de definir-ne una
          de nova abans de continuar.
        </p>
      ) : (
        <p className="mt-2 text-sm text-pasture-600">
          Defineix una contrasenya nova per al teu compte.
        </p>
      )}

      {errorMessage && (
        <p
          data-testid="change-password-error"
          className="mt-4 rounded-lg bg-beef-50 p-3 text-sm text-beef-800 ring-1 ring-beef-200"
        >
          {errorMessage}
        </p>
      )}

      <form action={changePassword} className="mt-6 space-y-4">
        <div>
          <label
            htmlFor="password"
            className="block text-sm font-semibold text-pasture-700"
          >
            Contrasenya nova
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            data-testid="change-password-new"
            className="mt-1 w-full rounded-xl border border-pasture-200 px-3 py-2 text-sm focus:border-beef-500 focus:outline-none focus:ring-1 focus:ring-beef-500"
          />
        </div>
        <div>
          <label
            htmlFor="confirm"
            className="block text-sm font-semibold text-pasture-700"
          >
            Confirma la contrasenya
          </label>
          <input
            id="confirm"
            name="confirm"
            type="password"
            autoComplete="new-password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            data-testid="change-password-confirm"
            className="mt-1 w-full rounded-xl border border-pasture-200 px-3 py-2 text-sm focus:border-beef-500 focus:outline-none focus:ring-1 focus:ring-beef-500"
          />
        </div>
        <button
          type="submit"
          data-testid="change-password-submit"
          className="w-full rounded-full bg-beef-600 px-4 py-2 text-sm font-semibold text-cream-50 hover:bg-beef-700"
        >
          Desa la contrasenya
        </button>
      </form>
    </div>
  );
}
