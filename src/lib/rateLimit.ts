/**
 * Minimal in-memory fixed-window rate limiter.
 *
 * Purpose: give the public /api/reserve endpoint a basic abuse guard so a single
 * anonymous client cannot loop-call it and exhaust a reservation cycle's free
 * places in a tight burst. It is intentionally simple (no external store): a
 * per-process Map keyed by an identifier (e.g. client IP), counting requests in
 * a fixed time window. The authoritative no-oversell guarantee still lives in
 * reserve() + the DB CHECK; this only raises the cost of scripted abuse.
 *
 * NOTE: a single-process in-memory limiter is a pragmatic baseline for this
 * demo, not a distributed solution. A real deployment behind multiple instances
 * would swap this for a shared store (Redis). The interface is kept tiny so that
 * swap is a drop-in.
 */

interface Window {
  count: number;
  resetAt: number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Requests remaining in the current window (never negative). */
  remaining: number;
  /** Epoch ms when the current window resets. */
  resetAt: number;
}

export interface RateLimiterOptions {
  /** Max requests permitted per window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

export class RateLimiter {
  readonly #limit: number;
  readonly #windowMs: number;
  readonly #hits = new Map<string, Window>();

  constructor(opts: RateLimiterOptions) {
    this.#limit = opts.limit;
    this.#windowMs = opts.windowMs;
  }

  /** Record a hit for `key` and report whether it is allowed. */
  check(key: string, now: number = Date.now()): RateLimitResult {
    const existing = this.#hits.get(key);
    if (!existing || now >= existing.resetAt) {
      const resetAt = now + this.#windowMs;
      this.#hits.set(key, { count: 1, resetAt });
      return { allowed: true, remaining: this.#limit - 1, resetAt };
    }
    if (existing.count >= this.#limit) {
      return { allowed: false, remaining: 0, resetAt: existing.resetAt };
    }
    existing.count += 1;
    return {
      allowed: true,
      remaining: this.#limit - existing.count,
      resetAt: existing.resetAt,
    };
  }

  /** Test helper: forget all recorded windows. */
  reset(): void {
    this.#hits.clear();
  }
}

/**
 * Shared limiter for the public reservation endpoint: at most 10 reservation
 * attempts per minute per client identifier. Generous for a real customer,
 * restrictive for a loop trying to drain a cycle anonymously.
 */
export const reserveRateLimiter = new RateLimiter({
  limit: 10,
  windowMs: 60_000,
});

/**
 * Best-effort client identifier from a request: the first X-Forwarded-For hop,
 * then X-Real-IP, else a constant fallback. Used only as a rate-limit key, never
 * for authorization or stored as PII.
 */
export function clientKeyFromRequest(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  const real = request.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}
