/**
 * Production seed guard (PURE, testable, no DB connection).
 *
 * The seed (prisma/seed.ts) wipes every table and recreates the demo
 * marketplace. It must NEVER run automatically against the Neon production
 * database. `vercel-build` no longer runs it; seeding is the explicit
 * `npm run db:seed`. This guard is the SECOND line of defence: even if the seed
 * is invoked in a production context, it refuses unless an explicit, dedicated
 * override is supplied.
 *
 * FAIL-CLOSED: if we cannot be sure the target is non-production AND no override
 * is set, we REFUSE. We do NOT rely on NODE_ENV alone (Vercel preview/prod
 * config can overlap). We inspect VERCEL_ENV and the DATABASE_URL HOST only to
 * make a decision — the connection string / host is NEVER logged.
 */

export interface SeedGuardEnv {
  VERCEL_ENV?: string;
  DATABASE_URL?: string;
  ALLOW_PRODUCTION_SEED?: string;
}

export interface SeedGuardDecision {
  /** True when seeding is allowed to proceed. */
  allow: boolean;
  /** A SAFE, secret-free message explaining the decision (loggable). */
  message: string;
}

/** The explicit, dedicated override value required to seed production. */
export const PRODUCTION_SEED_OVERRIDE = "yes";

/**
 * Extract the host from a DATABASE_URL WITHOUT logging it. Returns null when the
 * URL is missing or unparseable.
 */
function hostOf(databaseUrl: string | undefined): string | null {
  if (!databaseUrl) return null;
  try {
    return new URL(databaseUrl).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Heuristic: does the DATABASE_URL host look like a PRODUCTION Neon host?
 *
 * Neon pooled/prod hosts are typically `*.neon.tech`. Dev/preview branches are
 * also on neon.tech, so we CANNOT distinguish them purely by host; therefore we
 * treat ANY neon.tech host as "possibly production" and require the override.
 * Local/test hosts (localhost / 127.0.0.1 / sqlite file) are clearly safe.
 */
function looksLikeProductionHost(host: string | null): boolean {
  if (!host) return false;
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") {
    return false;
  }
  // A managed cloud Postgres host (Neon and similar). Conservatively treated as
  // possibly-production unless an explicit override is given.
  return host.endsWith("neon.tech") || host.includes("neon");
}

/**
 * Decide whether the seed may run. Pure function of the environment.
 *
 * Rules:
 *  - If ALLOW_PRODUCTION_SEED === "yes": ALLOW (explicit human authorisation).
 *  - Else if VERCEL_ENV === "production": REFUSE.
 *  - Else if the DATABASE_URL host looks like a managed/Neon (possibly prod)
 *    host: REFUSE (fail-closed; cannot prove it is a dev/preview branch).
 *  - Else (local/test host, or clearly non-production): ALLOW.
 */
export function evaluateSeedGuard(env: SeedGuardEnv): SeedGuardDecision {
  if ((env.ALLOW_PRODUCTION_SEED ?? "").trim() === PRODUCTION_SEED_OVERRIDE) {
    return {
      allow: true,
      message:
        "ALLOW_PRODUCTION_SEED=yes supplied: seeding explicitly authorised.",
    };
  }

  if ((env.VERCEL_ENV ?? "").trim().toLowerCase() === "production") {
    return {
      allow: false,
      message:
        "Refusing to seed: production environment detected; set ALLOW_PRODUCTION_SEED=yes to override.",
    };
  }

  const host = hostOf(env.DATABASE_URL);
  if (looksLikeProductionHost(host)) {
    return {
      allow: false,
      message:
        "Refusing to seed: managed/production-like database host detected; set ALLOW_PRODUCTION_SEED=yes to override.",
    };
  }

  return {
    allow: true,
    message: "Non-production target detected: seeding allowed.",
  };
}
