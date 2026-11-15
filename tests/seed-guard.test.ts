/**
 * Unit tests for the production seed guard (prisma/seed-guard.ts). Pure function
 * of the environment; no DB connection. Representative env combinations only.
 */
import { describe, expect, it } from "vitest";
import { evaluateSeedGuard } from "../prisma/seed-guard";

describe("evaluateSeedGuard", () => {
  it("ALLOWS local/test targets with no production signals", () => {
    expect(
      evaluateSeedGuard({
        DATABASE_URL: "postgresql://user:pw@localhost:5432/vedella",
      }).allow,
    ).toBe(true);
    expect(
      evaluateSeedGuard({
        DATABASE_URL: "file:./test.db",
      }).allow,
    ).toBe(true);
    // No env at all -> non-production target -> allow (local dev).
    expect(evaluateSeedGuard({}).allow).toBe(true);
  });

  it("REFUSES when VERCEL_ENV is production (no override)", () => {
    const d = evaluateSeedGuard({ VERCEL_ENV: "production" });
    expect(d.allow).toBe(false);
    expect(d.message).toMatch(/Refusing to seed/i);
    expect(d.message).toMatch(/ALLOW_PRODUCTION_SEED=yes/);
  });

  it("REFUSES a managed/Neon-looking host (fail-closed, cannot prove preview)", () => {
    const d = evaluateSeedGuard({
      DATABASE_URL:
        "postgresql://user:pw@ep-cool-name-123456.eu-central-1.aws.neon.tech/db",
    });
    expect(d.allow).toBe(false);
    expect(d.message).toMatch(/Refusing to seed/i);
  });

  it("ALLOWS production target only with the explicit override", () => {
    expect(
      evaluateSeedGuard({
        VERCEL_ENV: "production",
        ALLOW_PRODUCTION_SEED: "yes",
      }).allow,
    ).toBe(true);
    expect(
      evaluateSeedGuard({
        DATABASE_URL:
          "postgresql://user:pw@ep-cool-name-123456.aws.neon.tech/db",
        ALLOW_PRODUCTION_SEED: "yes",
      }).allow,
    ).toBe(true);
  });

  it("never leaks the connection string in its message", () => {
    const url =
      "postgresql://secretuser:secretpw@ep-cool-123.aws.neon.tech/db?sslmode=require";
    const d = evaluateSeedGuard({ DATABASE_URL: url });
    expect(d.message).not.toContain("secretpw");
    expect(d.message).not.toContain("secretuser");
    expect(d.message).not.toContain("ep-cool-123");
  });
});
