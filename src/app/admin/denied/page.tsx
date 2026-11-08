import Link from "next/link";
import { logout } from "@/lib/admin/session-actions";

export const dynamic = "force-dynamic";

/**
 * Access-denied page. Reached when a signed-in customer (or a farm_manager
 * attempting a platform-only action) hits an admin route. Gating itself is done
 * in requireAdmin/requirePlatformAdmin; this is just the friendly 403 surface.
 */
export default function AdminDeniedPage() {
  return (
    <div className="mx-auto max-w-lg text-center" data-testid="access-denied">
      <h1 className="text-2xl font-bold text-beef-700">Accés denegat</h1>
      <p className="mt-3 text-pasture-600">
        El teu rol no té permís per accedir a aquesta àrea
        d&apos;administració.
      </p>
      <div className="mt-6 flex justify-center gap-3">
        <Link
          href="/ca"
          className="rounded-full bg-pasture-600 px-4 py-2 text-sm font-semibold text-cream-50 hover:bg-pasture-700"
        >
          Torna al mercat
        </Link>
        <form action={logout}>
          <button
            type="submit"
            className="rounded-full bg-pasture-200 px-4 py-2 text-sm font-semibold hover:bg-pasture-300"
          >
            Canvia d&apos;usuari
          </button>
        </form>
      </div>
    </div>
  );
}
