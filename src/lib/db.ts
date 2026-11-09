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
    // Load the SQLite test client that only `pretest` generates into
    // node_modules/.prisma-test/client.
    //
    // WHY THE INDIRECTION (do not "simplify" this back to a static require):
    // Next.js/webpack statically analyzes `require("<string literal>")` at BUILD
    // time, regardless of the runtime `process.env.VITEST` guard. The test client
    // does not exist on Vercel (only the local pretest step generates it), so a
    // literal require makes the production build fail with
    // "Module not found: Can't resolve '../../node_modules/.prisma-test/client'".
    // To keep this branch test-only, we build the specifier from a runtime value
    // and resolve it through an eval'd require so the bundler cannot follow it.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const nodeRequire: NodeRequire = eval("require");
    const testClientPath = [process.cwd(), "node_modules", ".prisma-test", "client"].join("/");
    const { PrismaClient: TestPrismaClient } = nodeRequire(testClientPath);
    return new TestPrismaClient({ log }) as unknown as PrismaClient;
  }

  return new PrismaClient({ log });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export default prisma;
