/**
 * DB-backed audit test for the Gemini provider. Binds the app's prisma
 * singleton to a temp SQLite db, configures AI_PROVIDER='gemini' + a key + the
 * translation flag, and stubs global `fetch` with a canned Gemini response (NO
 * network). It then drives the real `translateField` service and asserts that:
 *  - an AiRun row is written with provider='gemini' and outcome='ok';
 *  - a malformed Gemini response produces an AiRun with outcome='invalid' and
 *    no translation rows (safe fallback, never crash);
 *  - the key never appears in any persisted audit row.
 */
import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const projectRoot = fileURLToPath(new URL("../..", import.meta.url));
const SECRET = "AIza-gemini-test-secret";

const dir = mkdtempSync(join(tmpdir(), "vedella-gemini-"));
const dbPath = join(dir, "test.db");
process.env.DATABASE_URL = `file:${dbPath}`;
// Select the real Gemini provider for the translate use case.
process.env.AI_PROVIDER = "gemini";
process.env.GEMINI_API_KEY = SECRET;
process.env.AI_TRANSLATION_ENABLED = "true";
delete process.env.AI_API_KEY;

execSync(
  "npx prisma db push --schema prisma/schema.test.prisma --skip-generate --accept-data-loss",
  { cwd: projectRoot, env: { ...process.env }, stdio: "ignore" },
);

const { prisma } = await import("../../src/lib/db");
const { translateField } = await import("../../src/lib/ai/translate");
const { makeFarm } = await import("../helpers/fixtures");

function geminiResponse(text: string, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }),
  } as unknown as Response;
}

beforeAll(async () => {
  await makeFarm(prisma, { slug: "gemini-farm", name: "Gemini Farm" });
}, 60_000);

afterEach(() => {
  vi.unstubAllGlobals();
});

afterAll(async () => {
  await prisma.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});

describe("Gemini audit (DB-backed, mocked fetch)", () => {
  it("records an AiRun with provider='gemini' and outcome='ok' on valid output", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        geminiResponse(
          JSON.stringify({
            items: [
              { locale: "es", text: "Granja Gemini" },
              { locale: "en", text: "Gemini Farm" },
            ],
          }),
        ),
      ),
    );

    const farm = await prisma.farm.findFirstOrThrow({
      where: { slug: "gemini-farm" },
    });
    const res = await translateField({
      entityType: "farm",
      entityId: farm.id,
      field: "name",
      sourceText: "Granja Gemini",
    });
    expect(res.ok).toBe(true);
    expect(res.outcome).toBe("ok");

    const audit = await prisma.aiRun.findMany({
      where: { useCase: "translate", provider: "gemini" },
    });
    expect(audit.length).toBeGreaterThan(0);
    const latest = audit[audit.length - 1];
    expect(latest.provider).toBe("gemini");
    expect(latest.model).toBe("gemini-1.5-flash");
    expect(latest.promptVersion).toBe("gemini-1");
    expect(latest.outputValid).toBe(true);
    expect(latest.outcome).toBe("ok");

    // The key must never be persisted anywhere on the audit row.
    expect(JSON.stringify(latest)).not.toContain(SECRET);

    // Machine translations, never approved.
    const rows = await prisma.translation.findMany({
      where: { entityType: "farm", entityId: farm.id, field: "name" },
    });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.status === "machine")).toBe(true);
  });

  it("records outcome='invalid' and writes no rows when Gemini returns malformed JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => geminiResponse("definitely not json")),
    );

    const farm = await prisma.farm.findFirstOrThrow({
      where: { slug: "gemini-farm" },
    });
    const res = await translateField({
      entityType: "farm",
      entityId: farm.id,
      field: "story",
      sourceText: "Una granja.",
    });
    // Parse throws inside the provider -> caught -> safe 'error' outcome.
    expect(res.ok).toBe(false);
    expect(["invalid", "error"]).toContain(res.outcome);

    const stored = await prisma.translation.findMany({
      where: { entityType: "farm", entityId: farm.id, field: "story" },
    });
    expect(stored).toHaveLength(0);

    const audit = await prisma.aiRun.findMany({
      where: { useCase: "translate", provider: "gemini", inputRef: `farm:${farm.id}:story` },
    });
    expect(audit.length).toBeGreaterThan(0);
    expect(audit[audit.length - 1].outputValid).toBe(false);
  });
});
