/**
 * Unit tests for the admin navigation model. These assert on the pure
 * nav-item builder + visibility helper (not on rendered HTML) and verify the
 * i18n dictionaries carry every admin.nav key in ca/es/en.
 *
 * Nav visibility is COSMETIC — hiding an item never grants/denies access (each
 * page re-authenticates server-side). These tests only pin the label set and
 * which items each role should see.
 */
import { describe, expect, it } from "vitest";
import {
  ADMIN_NAV_ITEMS,
  ADMIN_NAV_KEYS,
  canSeeNavItem,
  navItemsForRole,
} from "../../src/lib/admin/nav";
import ca from "../../src/lib/i18n/ca.json";
import es from "../../src/lib/i18n/es.json";
import en from "../../src/lib/i18n/en.json";

const PLATFORM_ONLY = ["websiteText", "users", "settings"];

describe("ADMIN_NAV_ITEMS", () => {
  it("defines exactly the 14 sections from the IA doc, in order", () => {
    expect(ADMIN_NAV_ITEMS).toHaveLength(14);
    expect(ADMIN_NAV_KEYS).toEqual([
      "overview",
      "metrics",
      "farms",
      "products",
      "lots",
      "cycles",
      "orders",
      "incidents",
      "websiteText",
      "users",
      "review",
      "audit",
      "settings",
      "logout",
    ]);
  });
});

describe("navItemsForRole", () => {
  it("platform_admin sees all 14 items", () => {
    const items = navItemsForRole("platform_admin");
    expect(items).toHaveLength(14);
    expect(items.map((i) => i.key)).toEqual(ADMIN_NAV_KEYS);
  });

  it("farm_manager does NOT get website-text/users/settings", () => {
    const keys = navItemsForRole("farm_manager").map((i) => i.key);
    for (const platformOnly of PLATFORM_ONLY) {
      expect(keys).not.toContain(platformOnly);
    }
    // It still sees every non-platform item (14 total minus the 3 hidden).
    expect(keys).toHaveLength(ADMIN_NAV_ITEMS.length - PLATFORM_ONLY.length);
    expect(keys).toContain("overview");
    expect(keys).toContain("review");
    expect(keys).toContain("logout");
  });

  it("customer sees nothing (never reaches the admin shell)", () => {
    expect(navItemsForRole("customer")).toHaveLength(0);
  });
});

describe("canSeeNavItem", () => {
  it("platform-only items are visible only to platform_admin", () => {
    const settings = ADMIN_NAV_ITEMS.find((i) => i.key === "settings")!;
    expect(canSeeNavItem("platform_admin", settings)).toBe(true);
    expect(canSeeNavItem("farm_manager", settings)).toBe(false);
    expect(canSeeNavItem("customer", settings)).toBe(false);
  });

  it("any-admin items are visible to both admin roles", () => {
    const review = ADMIN_NAV_ITEMS.find((i) => i.key === "review")!;
    expect(canSeeNavItem("platform_admin", review)).toBe(true);
    expect(canSeeNavItem("farm_manager", review)).toBe(true);
    expect(canSeeNavItem("customer", review)).toBe(false);
  });
});

describe("i18n dictionaries contain admin.nav labels", () => {
  const dicts: Record<string, Record<string, unknown>> = { ca, es, en };

  for (const [locale, dict] of Object.entries(dicts)) {
    it(`${locale}.json has every admin.nav key with a non-empty value`, () => {
      const nav = (dict.admin as { nav?: Record<string, string> })?.nav;
      expect(nav).toBeDefined();
      for (const key of ADMIN_NAV_KEYS) {
        expect(typeof nav![key]).toBe("string");
        expect(nav![key].length).toBeGreaterThan(0);
      }
    });
  }

  it("uses the canonical Spanish labels from the IA table", () => {
    const esNav = (es.admin as { nav: Record<string, string> }).nav;
    expect(esNav.overview).toBe("Resumen");
    expect(esNav.products).toBe("Productos y packs");
    expect(esNav.websiteText).toBe("Textos web");
    expect(esNav.users).toBe("Usuarios y permisos");
    expect(esNav.audit).toBe("Registro de actividad");
    expect(esNav.logout).toBe("Cerrar sesión");
  });
});
