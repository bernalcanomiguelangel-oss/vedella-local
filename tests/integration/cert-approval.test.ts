/**
 * Certification approval workflow (FEAT-004, decision/rule C): unverified
 * certification claims are NEVER public; only a platform_admin approval makes
 * one public. A farm_manager cannot approve. Every transition is auditable.
 */
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createTestDb, type TestDb } from "../helpers/testDb";
import { makeFarm } from "../helpers/fixtures";
import {
  type Actor,
  applyCertSubmit,
  applyCertApprove,
  applyCertReject,
  listPublicCertifications,
} from "../../src/lib/admin/manage";

let tdb: TestDb;
let db: PrismaClient;

const platform: Actor = { id: "plat", role: "platform_admin", farmId: null };

beforeAll(async () => {
  tdb = await createTestDb();
  db = tdb.prisma;
}, 60_000);

afterAll(async () => {
  await tdb.cleanup();
});

describe("certification approval gating", () => {
  it("a submitted certification is NOT exposed to the public read path", async () => {
    const farm = await makeFarm(db, { slug: "cert-pub-a" });
    const mgr: Actor = { id: "mgr", role: "farm_manager", farmId: farm.id };
    const submitted = await applyCertSubmit(db, mgr, {
      farmId: farm.id,
      type: "IGP",
      title: "IGP Vedella dels Pirineus",
      evidenceRef: "file://igp.pdf",
    });
    expect(submitted.ok).toBe(true);

    const publicList = await listPublicCertifications(db, farm.id);
    expect(publicList.length).toBe(0); // pending_review -> invisible
  });

  it("a farm_manager cannot approve their own certification", async () => {
    const farm = await makeFarm(db, { slug: "cert-selfapprove" });
    const mgr: Actor = { id: "mgr", role: "farm_manager", farmId: farm.id };
    const submitted = await applyCertSubmit(db, mgr, {
      farmId: farm.id,
      type: "welfare",
      title: "Benestar animal",
    });
    const res = await applyCertApprove(db, mgr, submitted.certId!);
    expect(res.ok).toBe(false);
    expect(res.code).toBe("FORBIDDEN");
    expect((await listPublicCertifications(db, farm.id)).length).toBe(0);
  });

  it("only platform_admin approval publishes the certification", async () => {
    const farm = await makeFarm(db, { slug: "cert-approve-ok" });
    const mgr: Actor = { id: "mgr", role: "farm_manager", farmId: farm.id };
    const submitted = await applyCertSubmit(db, mgr, {
      farmId: farm.id,
      type: "organic",
      title: "Producció ecològica",
      evidenceRef: "file://eco.pdf",
    });

    const before = await listPublicCertifications(db, farm.id);
    expect(before.length).toBe(0);

    const approve = await applyCertApprove(db, platform, submitted.certId!);
    expect(approve.ok).toBe(true);

    const after = await listPublicCertifications(db, farm.id);
    expect(after.length).toBe(1);
    expect(after[0].title).toBe("Producció ecològica");
  });

  it("a rejected certification stays out of the public read path", async () => {
    const farm = await makeFarm(db, { slug: "cert-reject" });
    const mgr: Actor = { id: "mgr", role: "farm_manager", farmId: farm.id };
    const submitted = await applyCertSubmit(db, mgr, {
      farmId: farm.id,
      type: "breed",
      title: "Raça Bruna 100%",
    });
    const rej = await applyCertReject(db, platform, submitted.certId!, "sense prova");
    expect(rej.ok).toBe(true);
    expect((await listPublicCertifications(db, farm.id)).length).toBe(0);
  });
});
