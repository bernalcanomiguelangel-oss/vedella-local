/**
 * Rate limiter (review issue #1): bounds anonymous abuse of the public
 * reservation endpoint. The authoritative no-oversell guarantee lives in
 * reserve() + the DB CHECK; this only raises the cost of scripted draining.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { RateLimiter, clientKeyFromRequest } from "../../src/lib/rateLimit";

describe("RateLimiter", () => {
  it("allows up to the limit then blocks within the window", () => {
    const rl = new RateLimiter({ limit: 3, windowMs: 1000 });
    const now = 1_000_000;
    expect(rl.check("ip", now).allowed).toBe(true);
    expect(rl.check("ip", now).allowed).toBe(true);
    expect(rl.check("ip", now).allowed).toBe(true);
    const blocked = rl.check("ip", now);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it("resets after the window elapses", () => {
    const rl = new RateLimiter({ limit: 1, windowMs: 1000 });
    const now = 2_000_000;
    expect(rl.check("ip", now).allowed).toBe(true);
    expect(rl.check("ip", now).allowed).toBe(false);
    // After the window, the counter resets.
    expect(rl.check("ip", now + 1001).allowed).toBe(true);
  });

  it("tracks separate keys independently", () => {
    const rl = new RateLimiter({ limit: 1, windowMs: 1000 });
    const now = 3_000_000;
    expect(rl.check("a", now).allowed).toBe(true);
    expect(rl.check("b", now).allowed).toBe(true);
    expect(rl.check("a", now).allowed).toBe(false);
  });
});

describe("clientKeyFromRequest", () => {
  it("prefers the first X-Forwarded-For hop", () => {
    const req = new Request("http://t", {
      headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
    });
    expect(clientKeyFromRequest(req)).toBe("1.2.3.4");
  });
  it("falls back to X-Real-IP then a constant", () => {
    expect(
      clientKeyFromRequest(new Request("http://t", { headers: { "x-real-ip": "9.9.9.9" } })),
    ).toBe("9.9.9.9");
    expect(clientKeyFromRequest(new Request("http://t"))).toBe("unknown");
  });
});

describe("POST /api/reserve rate limiting", () => {
  const reserve = vi.fn();
  beforeEach(() => {
    vi.resetModules();
    reserve.mockReset();
  });

  it("returns 429 once the per-client window is exhausted", async () => {
    vi.doMock("@/lib/reserve", () => ({ reserve: (...a: unknown[]) => reserve(...a) }));
    vi.doMock("@/lib/db", () => ({ prisma: {} }));
    reserve.mockResolvedValue({
      ok: true,
      orderId: "o1",
      lotReference: "L",
      subtotalCents: 0,
      discountCents: 0,
      deliveryFeeCents: 600,
      totalCents: 600,
      cycleName: "c",
      deliveryDate: new Date(),
      items: [],
      payment: { provider: "pay_on_delivery", charged: false, status: "pending" },
    });
    const { reserveRateLimiter } = await import("../../src/lib/rateLimit");
    reserveRateLimiter.reset();
    const { POST } = await import("@/app/api/reserve/route");

    const body = JSON.stringify({ items: [{ productId: "p1", quantity: 1 }] });
    const makeReq = () =>
      new Request("http://t/api/reserve", {
        method: "POST",
        headers: { "x-forwarded-for": "7.7.7.7" },
        body,
      });

    // The limiter allows 10/min. The 11th from the same client is blocked.
    let last = 0;
    for (let i = 0; i < 10; i++) {
      last = (await POST(makeReq())).status;
    }
    expect(last).toBe(201);
    const blocked = await POST(makeReq());
    expect(blocked.status).toBe(429);
  });
});
