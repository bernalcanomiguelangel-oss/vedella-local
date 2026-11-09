import { PrismaClient } from "@prisma/client";

/**
 * Prisma client singleton.
 *
 * In development Next.js hot-reloads modules, which would otherwise create a new
 * PrismaClient on every reload and exhaust the connection pool. We cache the
 * instance on globalThis to reuse it across reloads.
 *
 * OFFLINE TESTS: the default @prisma/client now targets Postgres (Neon/Vercel),
 * whose query engine cannot open the temp SQLite files the Vitest integration
 * suite uses. When running under Vitest (process.env.VITEST set), we therefore
 * instantiate the SQLite TEST client generated from prisma/schema.test.prisma
 * into node_modules/.prisma-test/client instead. This branch is test-only; it is
 * never taken in dev/production (where VITEST is unset and the test client may
 * not exist). The two clients are structurally identical, so app code that
 * imports this singleton is unaffected. See tests/helpers/testDb.ts.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createClient(): PrismaClient {
  const log: ("warn" | "error")[] =
    process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"];

  if (process.env.VITEST) {
    // Dynamically resolve the SQLite test client so production bundles never
    // depend on node_modules/.prisma-test (which only `pretest` generates).
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const {
      PrismaClient: TestPrismaClient,
    } = require("../../node_modules/.prisma-test/client");
    return new TestPrismaClient({ log }) as unknown as PrismaClient;
  }

  return new PrismaClient({ log });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export default prisma;
