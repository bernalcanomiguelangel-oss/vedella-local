/**
 * Pure navigation model for the admin shell (no Next.js dependencies) so it can
 * be unit tested directly. The 14 sections, their routes and per-role
 * visibility come from docs/admin-information-architecture.md §2.
 *
 * IMPORTANT: this model is purely COSMETIC. Hiding a nav item never grants or
 * denies access — every admin page re-authenticates server-side via
 * requireAdmin / requirePlatformAdmin. This module only decides which links to
 * paint for a given role.
 */
import type { Role } from "./scope";

/** A single admin navigation entry. */
export interface AdminNavItem {
  /** Stable key, also the i18n key under `admin.nav.*`. */
  key: string;
  /** Route the item links to. The log-out entry has no href (it is an action). */
  href: string | null;
  /**
   * Visibility:
   *  - "admin"    : any admin role (platform_admin or farm_manager).
   *  - "platform" : platform_admin only.
   */
  visibility: "admin" | "platform";
  /** True for the log-out control (rendered as a form action, not a link). */
  isAction?: boolean;
}

/**
 * The canonical 14-item admin navigation, in display order. Items 9/10/13
 * (Textos web, Usuarios y permisos, Ajustes) are platform-admin only; the rest
 * are visible to any admin. Item 14 (Cerrar sesión) is an action, not a route.
 */
export const ADMIN_NAV_ITEMS: readonly AdminNavItem[] = [
  { key: "overview", href: "/admin", visibility: "admin" },
  { key: "metrics", href: "/admin/metrics", visibility: "admin" },
  { key: "farms", href: "/admin/farms", visibility: "admin" },
  { key: "products", href: "/admin/products", visibility: "admin" },
  { key: "copy", href: "/admin/copy", visibility: "admin" },
  { key: "lots", href: "/admin/lots", visibility: "admin" },
  { key: "cycles", href: "/admin/cycles", visibility: "admin" },
  { key: "orders", href: "/admin/orders", visibility: "admin" },
  { key: "incidents", href: "/admin/incidents", visibility: "admin" },
  { key: "websiteText", href: "/admin/website-text", visibility: "platform" },
  { key: "users", href: "/admin/users", visibility: "platform" },
  { key: "review", href: "/admin/review", visibility: "admin" },
  { key: "audit", href: "/admin/audit", visibility: "admin" },
  { key: "settings", href: "/admin/settings", visibility: "platform" },
  { key: "logout", href: null, visibility: "admin", isAction: true },
] as const;

/** The i18n keys expected under `admin.nav` in every dictionary. */
export const ADMIN_NAV_KEYS: readonly string[] = ADMIN_NAV_ITEMS.map(
  (i) => i.key,
);

/** A rendered admin nav link: a nav item resolved against a label dictionary. */
export interface AdminNavLink {
  key: string;
  href: string | null;
  isAction: boolean;
  label: string;
}

/** Resolve role-filtered nav items into rendered links using a label map. */
export function toNavLinks(
  items: readonly AdminNavItem[],
  labels: Record<string, string>,
): AdminNavLink[] {
  return items.map((item) => ({
    key: item.key,
    href: item.href,
    isAction: Boolean(item.isAction),
    label: labels[item.key] ?? item.key,
  }));
}

/** True when this role may see a given nav item (cosmetic visibility only). */
export function canSeeNavItem(role: Role, item: AdminNavItem): boolean {
  if (role === "customer") return false;
  if (item.visibility === "platform") return role === "platform_admin";
  return role === "platform_admin" || role === "farm_manager";
}

/**
 * The nav items a given role should see, in display order. For a customer this
 * is empty (customers never reach the admin shell).
 */
export function navItemsForRole(role: Role): AdminNavItem[] {
  return ADMIN_NAV_ITEMS.filter((item) => canSeeNavItem(role, item));
}
