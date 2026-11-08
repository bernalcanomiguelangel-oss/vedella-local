/**
 * Unit tests for the i18n layer: locale resolution, UI dictionaries, and the
 * content-translation resolver (approved-only with fallback to ca).
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_LOCALE,
  buildTranslationIndex,
  getDictionary,
  interpolate,
  isLocale,
  resolveContent,
  resolveLocale,
  LOCALES,
  type TranslationRow,
} from "../src/lib/i18n";

describe("locale resolution", () => {
  it("defaults to ca", () => {
    expect(DEFAULT_LOCALE).toBe("ca");
    expect(resolveLocale(undefined)).toBe("ca");
    expect(resolveLocale("zz")).toBe("ca");
  });
  it("recognises supported locales", () => {
    expect(isLocale("es")).toBe(true);
    expect(isLocale("en")).toBe(true);
    expect(isLocale("fr")).toBe(false);
    expect(LOCALES).toEqual(["ca", "es", "en"]);
  });
});

describe("UI dictionaries", () => {
  it("returns the right dictionary per locale", () => {
    expect(getDictionary("ca").locale).toBe("ca");
    expect(getDictionary("es").locale).toBe("es");
    expect(getDictionary("en").locale).toBe("en");
  });
  it("falls back to ca for unknown locales", () => {
    expect(getDictionary("xx").locale).toBe("ca");
  });
  it("every locale has the same key set (no missing strings)", () => {
    const keys = (obj: unknown, prefix = ""): string[] => {
      if (typeof obj !== "object" || obj === null) return [prefix];
      return Object.entries(obj).flatMap(([k, v]) =>
        keys(v, prefix ? `${prefix}.${k}` : k),
      );
    };
    const ca = keys(getDictionary("ca")).sort();
    const es = keys(getDictionary("es")).sort();
    const en = keys(getDictionary("en")).sort();
    expect(es).toEqual(ca);
    expect(en).toEqual(ca);
  });
});

describe("content translation resolver", () => {
  const rows: TranslationRow[] = [
    {
      entityType: "farm",
      entityId: "f1",
      field: "name",
      locale: "en",
      text: "Approved EN name",
      status: "approved",
    },
    {
      entityType: "farm",
      entityId: "f1",
      field: "story",
      locale: "en",
      text: "Machine EN story (not approved)",
      status: "machine",
    },
  ];
  const index = buildTranslationIndex(rows);

  it("uses the base (ca) value for the default locale", () => {
    expect(
      resolveContent(index, "farm", "f1", "name", "ca", "Nom base"),
    ).toBe("Nom base");
  });

  it("uses an approved translation when present", () => {
    expect(
      resolveContent(index, "farm", "f1", "name", "en", "Nom base"),
    ).toBe("Approved EN name");
  });

  it("falls back to ca when the translation is only machine (not approved)", () => {
    expect(
      resolveContent(index, "farm", "f1", "story", "en", "Història base"),
    ).toBe("Història base");
  });

  it("falls back to ca when no translation exists at all", () => {
    expect(
      resolveContent(index, "farm", "f1", "name", "es", "Nom base"),
    ).toBe("Nom base");
  });
});

describe("interpolate", () => {
  it("substitutes placeholders", () => {
    expect(interpolate("{a} of {b}", { a: 37, b: 50 })).toBe("37 of 50");
  });
  it("leaves unknown placeholders intact", () => {
    expect(interpolate("{x}", {})).toBe("{x}");
  });
});
