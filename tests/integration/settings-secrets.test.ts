/**
 * FEAT-006 security: the Settings surface exposes the AI key ONLY as a presence
 * boolean. Even with a (fake) AI_API_KEY set in the environment, the key value
 * must NEVER appear in the settings/diagnostics payload the server returns to
 * the browser — only `hasApiKey=true`.
 */
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createTestDb, type TestDb } from "../helpers/testDb";
import {
  ensureDefaultSettings,
  listSettings,
  buildAiDiagnostics,
} from "../../src/lib/admin/settings";

let tdb: TestDb;
let db: PrismaClient;

// A clearly fake, non-secret test value. It must never surface in any payload.
const FAKE_KEY = "sk-FAKE-TEST-KEY-should-never-leak-1234567890";

beforeAll(async () => {
  tdb = await createTestDb();
  db = tdb.prisma;
}, 60_000);

afterAll(async () => {
  await tdb.cleanup();
});

describe("buildAiDiagnostics presence-only", () => {
  it("reports hasApiKey=true when a key is present but never returns the value", () => {
    const diag = buildAiDiagnostics({
      AI_API_KEY: FAKE_KEY,
      AI_PROVIDER: "openai",
      AI_TRANSLATION_ENABLED: "true",
    } as unknown as NodeJS.ProcessEnv);

    expect(diag.hasApiKey).toBe(true);
    expect(diag.flags.translation).toBe(true);
    // The label now communicates BOTH accepted env-var names (presence-only).
    expect(diag.keyEnvVar).toBe("AI_API_KEY o GEMINI_API_KEY");

    // The full serialised diagnostics must not contain the key value anywhere.
    const serialised = JSON.stringify(diag);
    expect(serialised).not.toContain(FAKE_KEY);
    // Nor should any individual string field hold it.
    expect(Object.values(diag).some((v) => typeof v === "string" && v.includes(FAKE_KEY))).toBe(
      false,
    );
  });

  it("reports hasApiKey=true when only GEMINI_API_KEY is present, never leaking it", () => {
    const diag = buildAiDiagnostics({
      GEMINI_API_KEY: FAKE_KEY,
      AI_PROVIDER: "gemini",
      AI_TRANSLATION_ENABLED: "true",
    } as unknown as NodeJS.ProcessEnv);
    expect(diag.hasApiKey).toBe(true);
    expect(diag.provider).toBe("gemini");
    expect(JSON.stringify(diag)).not.toContain(FAKE_KEY);
  });

  it("reports hasApiKey=false in mock mode", () => {
    const diag = buildAiDiagnostics({} as unknown as NodeJS.ProcessEnv);
    expect(diag.hasApiKey).toBe(false);
    expect(diag.provider).toBe("mock");
  });
});

describe("Settings payload carries no secret", () => {
  it("listSettings returns only non-secret config rows", async () => {
    // Even with a fake key in the process env, settings never persist or echo it.
    process.env.AI_API_KEY = FAKE_KEY;
    try {
      await ensureDefaultSettings(db);
      const settings = await listSettings(db);

      const serialised = JSON.stringify(settings);
      expect(serialised).not.toContain(FAKE_KEY);

      // No setting row key should even hint at a secret value column.
      const keys = settings.map((s) => s.key);
      expect(keys.some((k) => k.toLowerCase().includes("apikey"))).toBe(false);
      expect(keys.some((k) => k.toLowerCase().includes("secret"))).toBe(false);

      // And the DB itself must not contain the key value in any column.
      const rows = await db.setting.findMany();
      const dbSerialised = JSON.stringify(rows);
      expect(dbSerialised).not.toContain(FAKE_KEY);
    } finally {
      delete process.env.AI_API_KEY;
    }
  });
});
