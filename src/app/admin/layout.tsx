import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { logout } from "@/lib/admin/session-actions";

export const dynamic = "force-dynamic";

/**
 * Admin shell. The nav is shown only when signed in as an admin role; gating of
 * each page is still enforced server-side in the page itself (requireAdmin /
 * requirePlatformAdmin). This layout only decorates — it never grants access.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  const isAdmin =
    user && (user.role === "platform_admin" || user.role === "farm_manager");

  return (
    <div className="min-h-screen bg-pasture-50 text-pasture-900">
      <header className="border-b border-pasture-200 bg-cream-50">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link href="/admin" className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-beef-600 text-cream-50">
              🐄
            </span>
            <span className="font-extrabold tracking-tight">
              Vedella Local · Admin
            </span>
          </Link>
          {isAdmin && (
            <nav className="flex items-center gap-4 text-sm">
              <Link href="/admin" className="hover:text-beef-700">
                Panell
              </Link>
              <Link href="/admin/review" className="hover:text-beef-700">
                Revisió
              </Link>
              <Link href="/admin/records" className="hover:text-beef-700">
                Cicle de vida
              </Link>
              <Link href="/admin/metrics" className="hover:text-beef-700">
                Mètriques
              </Link>
              <Link href="/admin/receipts" className="hover:text-beef-700">
                Rebuts
              </Link>
              <span className="hidden text-pasture-500 sm:inline">
                {user?.email} · <b data-testid="current-role">{user?.role}</b>
              </span>
              <form action={logout}>
                <button
                  type="submit"
                  className="rounded-full bg-pasture-200 px-3 py-1 font-semibold hover:bg-pasture-300"
                >
                  Surt
                </button>
              </form>
            </nav>
          )}
          {!isAdmin && (
            <Link
              href="/admin/login"
              className="rounded-full bg-beef-600 px-3 py-1 text-sm font-semibold text-cream-50 hover:bg-beef-700"
            >
              Entra
            </Link>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
