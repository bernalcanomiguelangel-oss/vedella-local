import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { navItemsForRole, toNavLinks } from "@/lib/admin/nav";
import { getDictionary } from "@/lib/i18n";
import { AdminNav } from "@/components/admin/AdminNav";

export const dynamic = "force-dynamic";

/**
 * Admin shell. On desktop it renders a LEFT vertical navigation; on mobile a
 * collapsible drawer. The nav is shown only when signed in as an admin role and
 * is COSMETIC — each page still enforces access server-side (requireAdmin /
 * requirePlatformAdmin). This layout only decorates; it never grants access.
 *
 * Labels come from the i18n dictionaries under `admin.nav`. The admin uses the
 * default (ca) dictionary chrome; canonical labels are Spanish and all three
 * locales are available for when a locale preference is wired through.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  const isAdmin =
    user && (user.role === "platform_admin" || user.role === "farm_manager");

  const dict = getDictionary(undefined);
  const labels = dict.admin.nav as Record<string, string>;
  const brand = dict.brand;

  if (!isAdmin || !user) {
    return (
      <div
        data-admin-shell
        className="min-h-screen bg-cream-100 text-bark-900"
      >
        <header className="border-b border-bark-200 bg-cream-50">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
            <Link
              href="/admin"
              className="flex items-center gap-2 font-display text-lg font-bold"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-bark-700 text-cream-50">
                🐄
              </span>
              {brand} · {dict.admin.title}
            </Link>
            <Link
              href="/admin/login"
              className="rounded-full bg-bark-700 px-3 py-1 text-sm font-semibold text-cream-50 hover:bg-bark-800"
            >
              Entra
            </Link>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
      </div>
    );
  }

  const links = toNavLinks(navItemsForRole(user.role), labels);

  return (
    <div
      data-admin-shell
      className="flex min-h-screen flex-col bg-cream-100 text-bark-900 md:flex-row"
    >
      <AdminNav
        links={links}
        sessionEmail={user.email}
        sessionRole={user.role}
        brand={brand}
      />
      <main className="min-w-0 flex-1 px-4 py-8 sm:px-6 lg:px-10">
        <div className="mx-auto max-w-5xl">{children}</div>
      </main>
    </div>
  );
}
