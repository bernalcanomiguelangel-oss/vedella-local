/**
 * Auth gate tests (FEAT-001): a user carrying a temporary password
 * (mustChangePassword) is treated as not-yet-fully-authenticated for protected
 * pages and redirected to the change-password route, while the change-password
 * route itself (requireSession) stays reachable. Once the flag clears, protected
 * pages are reachable again.
 *
 * next/headers (cookies) and next/navigation (redirect) are mocked; the user
 * lookup goes through a mocked prisma so no real DB is needed.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const cookieStore = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: () => ({
    get: (k: string) =>
      cookieStore.has(k) ? { value: cookieStore.get(k)! } : undefined,
    set: (k: string, v: string) => cookieStore.set(k, v),
    delete: (k: string) => cookieStore.delete(k),
  }),
}));

class RedirectError extends Error {
  constructor(public to: string) {
    super(`REDIRECT:${to}`);
  }
}
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new RedirectError(to);
  },
}));

const findUnique = vi.fn();
vi.mock("../../src/lib/db", () => ({ prisma: { user: { findUnique: (a: unknown) => findUnique(a) } } }));
// src/lib/auth imports "./db" which resolves to the same module above.
vi.mock("@/lib/db", () => ({ prisma: { user: { findUnique: (a: unknown) => findUnique(a) } } }));

const SESSION = "vl_session";

beforeEach(() => {
  cookieStore.clear();
  findUnique.mockReset();
});

function seedUser(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: "u1",
    email: "miguel@admin.com",
    name: "Miguel",
    role: "platform_admin",
    farmId: null,
    passwordHash: "hash",
    mustChangePassword: false,
    ...over,
  };
}

describe("requireAdmin gate", () => {
  it("redirects an unauthenticated visitor to /admin/login", async () => {
    const { requireAdmin } = await import("../../src/lib/auth");
    await expect(requireAdmin()).rejects.toThrow("REDIRECT:/admin/login");
  });

  it("redirects a customer to /admin/denied", async () => {
    cookieStore.set(SESSION, "u1");
    findUnique.mockResolvedValue(seedUser({ role: "customer" }));
    const { requireAdmin } = await import("../../src/lib/auth");
    await expect(requireAdmin()).rejects.toThrow("REDIRECT:/admin/denied");
  });

  it("redirects a mustChangePassword admin to /admin/change-password", async () => {
    cookieStore.set(SESSION, "u1");
    findUnique.mockResolvedValue(seedUser({ mustChangePassword: true }));
    const { requireAdmin } = await import("../../src/lib/auth");
    await expect(requireAdmin()).rejects.toThrow(
      "REDIRECT:/admin/change-password",
    );
  });

  it("allows a fully-authenticated admin (flag cleared)", async () => {
    cookieStore.set(SESSION, "u1");
    findUnique.mockResolvedValue(seedUser({ mustChangePassword: false }));
    const { requireAdmin } = await import("../../src/lib/auth");
    const user = await requireAdmin();
    expect(user.role).toBe("platform_admin");
    expect(user.mustChangePassword).toBe(false);
  });
});

describe("requireSession (change-password route)", () => {
  it("stays reachable for a mustChangePassword admin (no redirect loop)", async () => {
    cookieStore.set(SESSION, "u1");
    findUnique.mockResolvedValue(seedUser({ mustChangePassword: true }));
    const { requireSession } = await import("../../src/lib/auth");
    const user = await requireSession();
    expect(user.mustChangePassword).toBe(true);
  });

  it("still denies a customer", async () => {
    cookieStore.set(SESSION, "u1");
    findUnique.mockResolvedValue(seedUser({ role: "customer" }));
    const { requireSession } = await import("../../src/lib/auth");
    await expect(requireSession()).rejects.toThrow("REDIRECT:/admin/denied");
  });
});
