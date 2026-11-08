/**
 * Pure authorisation helpers (no Next.js dependencies) so they can be unit
 * tested directly. The session-aware wrappers live in src/lib/auth.ts.
 */
export type Role = "platform_admin" | "farm_manager" | "customer";

export interface ScopedUser {
  role: Role;
  farmId: string | null;
}

/** True when the role may enter the admin area at all (not a customer). */
export function isAdminRole(role: Role): boolean {
  return role === "platform_admin" || role === "farm_manager";
}

/**
 * Can this user act on a record belonging to `farmId`?
 *  - platform_admin : yes, for every farm (including records with no farm).
 *  - farm_manager   : only for their own farm.
 *  - customer       : never.
 */
export function canActOnFarm(user: ScopedUser, farmId: string | null): boolean {
  if (user.role === "platform_admin") return true;
  if (user.role === "farm_manager") return !!farmId && user.farmId === farmId;
  return false;
}

/**
 * The set of farm ids a user may see in the admin area. `null` means "all farms"
 * (platform_admin). An empty array means "none".
 */
export function visibleFarmScope(user: ScopedUser): string[] | null {
  if (user.role === "platform_admin") return null;
  if (user.role === "farm_manager" && user.farmId) return [user.farmId];
  return [];
}
