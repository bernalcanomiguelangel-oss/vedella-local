/**
 * Server-side authentication & role gating for the admin area.
 *
 * This is a lightweight DEV session: no external auth provider is wired (per the
 * product brief). A signed-in identity is just a seeded User.id stored in an
 * httpOnly cookie, chosen from a dev login/role selector at /admin/login. The
 * important property is that **gating is always enforced on the server** — admin
 * pages and server actions call `requireRole`/`requireAdmin`, which read the
 * cookie, look the user up in the database, and 403/redirect on failure. No
 * client-only check is ever trusted.
 *
 * Roles (product steering):
 *  - platform_admin : manages the whole marketplace; sees & transitions ALL records.
 *  - farm_manager   : manages ONLY their own farm's records; cannot approve.
 *  - customer       : no admin access at all.
 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import {
  isAdminRole as isAdminRolePure,
  canActOnFarm as canActOnFarmPure,
  visibleFarmScope as visibleFarmScopePure,
  type Role,
  type ScopedUser,
} from "./admin/scope";

export const SESSION_COOKIE = "vl_session";

export type { Role };

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  /** The farm this user manages (farm_manager only); null otherwise. */
  farmId: string | null;
}

function normaliseRole(role: string): Role {
  if (role === "platform_admin" || role === "farm_manager") return role;
  return "customer";
}

/**
 * Resolve the current signed-in user from the session cookie, or null when there
 * is no (valid) session. Always hits the database so a deleted/edited user does
 * not retain access.
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const jar = cookies();
  const userId = jar.get(SESSION_COOKIE)?.value;
  if (!userId) return null;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: normaliseRole(user.role),
    farmId: user.farmId,
  };
}

/** True when the role may enter the admin area at all (not a customer). */
export function isAdminRole(role: Role): boolean {
  return isAdminRolePure(role);
}

/**
 * Require ANY admin role (platform_admin or farm_manager). Redirects an
 * unauthenticated visitor to the login page and a customer to the access-denied
 * page. Returns the authenticated admin user on success.
 */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/login");
  if (!isAdminRole(user.role)) redirect("/admin/denied");
  return user;
}

/**
 * Require the platform_admin role specifically (approvals, cross-farm actions).
 * A farm_manager or customer is denied.
 */
export async function requirePlatformAdmin(): Promise<SessionUser> {
  const user = await requireAdmin();
  if (user.role !== "platform_admin") redirect("/admin/denied");
  return user;
}

/**
 * Authorisation check used by data loaders and server actions: can this user
 * act on a record belonging to `farmId`?
 *  - platform_admin : yes, for every farm (including records with no farm).
 *  - farm_manager   : only for their own farm.
 *  - customer       : never.
 */
export function canActOnFarm(user: SessionUser, farmId: string | null): boolean {
  return canActOnFarmPure(user as ScopedUser, farmId);
}

/**
 * The set of farm ids a user may see in the admin area. `null` means "all farms"
 * (platform_admin). An empty array means "none".
 */
export function visibleFarmScope(user: SessionUser): string[] | null {
  return visibleFarmScopePure(user as ScopedUser);
}
