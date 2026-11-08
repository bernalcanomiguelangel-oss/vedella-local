/**
 * FEAT-006 guardrail: WebsiteText holds GENERIC copy only. Operational facts
 * (prices, weights, dates, capacity, traceability/lot codes) must be REJECTED
 * and never stored — they come from structured records, not website copy.
 */
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createTestDb, type TestDb } from "../helpers/testDb";
import {
  upsertWebsiteTextDraft,
  publishWebsiteText,
  detectOperationalFact,
} from "../../src/lib/admin/website-text";

let tdb: TestDb;
let db: PrismaClient;

beforeAll(async () => {
  tdb = await createTestDb();
  db = tdb.prisma;
}, 60_000);

afterAll(async () => {
  await tdb.cleanup();
});

const base = { pageKey: "home", sectionKey: "hero", locale: "ca", editorUserId: "u1" };

describe("detectOperationalFact", () => {
  it("flags prices, weights, capacity, dates and lot codes", () => {
    expect(detectOperationalFact("Preu 42,00 €")).toBe("price");
    expect(detectOperationalFact("Pes 1500 g per peça")).toBe("weight");
    expect(detectOperationalFact("Queden 37/50 places")).toBe("capacity");
    expect(detectOperationalFact("Lliurament 2026-11-08")).toBe("date");
    expect(detectOperationalFact("Codi de lot LOT-2026-001")).toBe("traceability");
  });

  it("passes clean generic copy", () => {
    expect(
      detectOperationalFact(
        "Vedella local i traçable de Catalunya, criada en extensiu.",
      ),
    ).toBeNull();
  });
});

describe("WebsiteText write guardrail", () => {
  it("stores clean generic copy as a draft", async () => {
    const res = await upsertWebsiteTextDraft(db, {
      ...base,
      draftText: "Granges seleccionades amb benestar animal.",
    });
    expect(res.ok).toBe(true);
    const row = await db.websiteText.findUnique({
      where: { pageKey_sectionKey_locale: { pageKey: "home", sectionKey: "hero", locale: "ca" } },
    });
    expect(row?.draftText).toContain("benestar animal");
  });

  it("rejects a price and does NOT store it", async () => {
    const res = await upsertWebsiteTextDraft(db, {
      pageKey: "home",
      sectionKey: "promo",
      locale: "ca",
      editorUserId: "u1",
      draftText: "Pack A només 42,00 € aquesta setmana!",
    });
    expect(res.ok).toBe(false);
    expect(res.code).toBe("OPERATIONAL_FACT");
    expect(res.offendingTerm).toBe("price");

    const row = await db.websiteText.findUnique({
      where: { pageKey_sectionKey_locale: { pageKey: "home", sectionKey: "promo", locale: "ca" } },
    });
    expect(row).toBeNull();
  });

  it("rejects weights, capacity, dates and lot codes", async () => {
    for (const [sectionKey, text, term] of [
      ["w", "Entrecot de 300 g", "weight"],
      ["c", "Només 37/50 places lliures", "capacity"],
      ["d", "Tancament el 08/11/2026", "date"],
      ["t", "Mira el teu lot REF-12", "traceability"],
    ] as const) {
      const res = await upsertWebsiteTextDraft(db, {
        pageKey: "home",
        sectionKey,
        locale: "ca",
        editorUserId: "u1",
        draftText: text,
      });
      expect(res.ok, `${sectionKey} should be rejected`).toBe(false);
      expect(res.offendingTerm).toBe(term);
      const row = await db.websiteText.findUnique({
        where: { pageKey_sectionKey_locale: { pageKey: "home", sectionKey, locale: "ca" } },
      });
      expect(row).toBeNull();
    }
  });

  it("cannot publish a block whose draft contains an operational fact", async () => {
    // Create a clean draft, then tamper the stored draft directly (simulating a
    // row that somehow holds a fact) and assert publish refuses it.
    const created = await upsertWebsiteTextDraft(db, {
      pageKey: "about",
      sectionKey: "story",
      locale: "ca",
      editorUserId: "u1",
      draftText: "La nostra història familiar.",
    });
    expect(created.ok).toBe(true);
    await db.websiteText.update({
      where: { id: created.id! },
      data: { draftText: "Obre el 2026-11-08" },
    });
    const pub = await publishWebsiteText(db, created.id!, "u1");
    expect(pub.ok).toBe(false);
    expect(pub.code).toBe("OPERATIONAL_FACT");
    const row = await db.websiteText.findUnique({ where: { id: created.id! } });
    expect(row?.publishedText).toBeNull();
  });
});
