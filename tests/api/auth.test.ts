/**
 * HTTP-edge authorization tests (R21, review issue #1).
 *
 * The three /api/ai/* route handlers must reject an unauthenticated or
 * under-privileged caller BEFORE touching the AI layer, mirroring the gated
 * admin server actions. /api/reserve is public but rate-limited so a loop
 * cannot anonymously exhaust a cycle.
 *
 * These tests mock the auth boundary (getApiAdmin) and the AI service functions
 * so they are pure and need no database: the point is to prove the gate, not the
 * downstream behaviour (covered elsewhere).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks -----------------------------------------------------------------
const getApiAdmin = vi.fn();
vi.mock("@/lib/auth", () => ({ getApiAdmin: () => getApiAdmin() }));

const translateField = vi.fn();
vi.mock("@/lib/ai/translate", () => ({ translateField: (x: unknown) => translateField(x) }));

const extractReceipt = vi.fn();
const isAcceptedReceiptMime = vi.fn((_x: string) => true);
vi.mock("@/lib/ai/receipt", () => ({
  extractReceipt: (x: unknown) => extractReceipt(x),
  isAcceptedReceiptMime: (x: string) => isAcceptedReceiptMime(x),
}));

const runWeeklyMetrics = vi.fn<(x: unknown) => unknown>();
const computeWeeklyAverages = vi.fn<(x: unknown) => unknown>();
vi.mock("@/lib/ai/metrics", () => ({
  runWeeklyMetrics: (x: unknown) => runWeeklyMetrics(x),
  computeWeeklyAverages: (x: unknown) => computeWeeklyAverages(x),
}));

const ADMIN = { id: "u1", email: "a@x", name: "A", role: "platform_admin", farmId: null };

beforeEach(() => {
  vi.clearAllMocks();
  translateField.mockResolvedValue({ ok: true, outcome: "ok", stored: [], demotedApproved: [] });
  extractReceipt.mockResolvedValue({ ok: true, outcome: "ok", prefill: {}, injectionSuspected: false });
  runWeeklyMetrics.mockResolvedValue({ outcome: "ok", weekStart: "2026-01-05", perCut: [], summary: {} });
  computeWeeklyAverages.mockResolvedValue({ weekStart: new Date("2026-01-05"), perCut: [] });
  isAcceptedReceiptMime.mockReturnValue(true);
});

describe("POST /api/ai/translate auth gate", () => {
  it("rejects an unauthenticated caller with 401 and never runs the AI", async () => {
    getApiAdmin.mockResolvedValue(null);
    const { POST } = await import("@/app/api/ai/translate/route");
    const res = await POST(
      new Request("http://t/api/ai/translate", {
        method: "POST",
        body: JSON.stringify({ entityType: "farm", entityId: "f1", field: "name", sourceText: "x" }),
      }),
    );
    expect(res.status).toBe(401);
    expect(translateField).not.toHaveBeenCalled();
  });

  it("allows an admin caller", async () => {
    getApiAdmin.mockResolvedValue(ADMIN);
    const { POST } = await import("@/app/api/ai/translate/route");
    const res = await POST(
      new Request("http://t/api/ai/translate", {
        method: "POST",
        body: JSON.stringify({ entityType: "farm", entityId: "f1", field: "name", sourceText: "x" }),
      }),
    );
    expect(res.status).toBe(200);
    expect(translateField).toHaveBeenCalledTimes(1);
  });
});

describe("POST /api/ai/receipt auth gate", () => {
  it("rejects an unauthenticated caller with 401 and never runs the AI", async () => {
    getApiAdmin.mockResolvedValue(null);
    const { POST } = await import("@/app/api/ai/receipt/route");
    const form = new FormData();
    form.set("file", new File([new Uint8Array([1, 2, 3])], "r.png", { type: "image/png" }));
    const res = await POST(
      new Request("http://t/api/ai/receipt", { method: "POST", body: form }),
    );
    expect(res.status).toBe(401);
    expect(extractReceipt).not.toHaveBeenCalled();
  });
});

describe("GET/POST /api/ai/metrics auth gate", () => {
  it("GET rejects an unauthenticated caller with 401", async () => {
    getApiAdmin.mockResolvedValue(null);
    const { GET } = await import("@/app/api/ai/metrics/route");
    const res = await GET(new Request("http://t/api/ai/metrics"));
    expect(res.status).toBe(401);
    expect(computeWeeklyAverages).not.toHaveBeenCalled();
  });

  it("POST rejects an unauthenticated caller with 401 and never writes snapshots", async () => {
    getApiAdmin.mockResolvedValue(null);
    const { POST } = await import("@/app/api/ai/metrics/route");
    const res = await POST(
      new Request("http://t/api/ai/metrics", { method: "POST", body: "{}" }),
    );
    expect(res.status).toBe(401);
    expect(runWeeklyMetrics).not.toHaveBeenCalled();
  });

  it("GET allows an admin caller", async () => {
    getApiAdmin.mockResolvedValue(ADMIN);
    const { GET } = await import("@/app/api/ai/metrics/route");
    const res = await GET(new Request("http://t/api/ai/metrics"));
    expect(res.status).toBe(200);
    expect(computeWeeklyAverages).toHaveBeenCalled();
  });
});
