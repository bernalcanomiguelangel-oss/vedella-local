/**
 * neon-readonly-scan — read-only production data-quality scan (FEAT-005,
 * condition 4).
 *
 * PURPOSE
 *   Run SELECT-ONLY queries against a PRODUCTION/Neon snapshot to surface
 *   data-quality issues that cannot be confirmed offline (legacy/backfilled
 *   rows that predate a constraint). It reports ONLY aggregate counts and
 *   TECHNICAL record IDs that need human follow-up. It never writes, never runs
 *   DDL, and never exports customer names, emails, phones, credentials, or
 *   order-level PII.
 *
 * SAFETY (hard constraints — enforced here)
 *   - The connection string is read ONLY from the NEON_READONLY_URL env var (a
 *     Kiro secret). It is NEVER printed, logged, committed, or pasted anywhere.
 *   - When NEON_READONLY_URL is UNSET, the script prints
 *     "Not run (no read-only credential)" and exits 0 WITHOUT connecting.
 *   - Every query is SELECT-only. There is no INSERT/UPDATE/DELETE/DDL path.
 *   - Output is limited to counts + technical IDs; PII columns are never
 *     selected.
 *
 * WHAT IT CHECKS (all read-only)
 *   1. Counts of core records (Farm, FarmProductOffer, Lot, Order, ...).
 *   2. Technical record IDs needing follow-up:
 *      a. Lots pointing at another farm's product/offer (relationship
 *         inconsistency).
 *      b. Lots backed by neither a product nor an offer.
 *      c. Offers / products with a missing (dangling) farm ownership.
 *      d. Duplicate lot references.
 *      e. Invalid date sequences (NOT slaughter <= cutting <= packing < expiry).
 *      f. isTest=true rows that could leak into production metrics.
 *      g. Public records that do NOT satisfy the publication rule
 *         (isActive && isApproved) or that are served while a content flag is
 *         unresolved.
 *
 * DRIVER NOTE
 *   The repo does not bundle a raw-SQL Postgres driver, so this script uses the
 *   generated Prisma client with $queryRaw (parameter-free, SELECT-only SQL).
 *   It instantiates a client bound to NEON_READONLY_URL. A dedicated READ-ONLY
 *   Neon role / connection string is strongly recommended so the credential
 *   itself cannot write, as defence in depth on top of the SELECT-only queries.
 */

const CONNECTION_ENV = "NEON_READONLY_URL";

interface IdCountFinding {
  key: string;
  description: string;
  sql: string;
}

/**
 * The catalogue of SELECT-only findings. Kept as data so the exact queries can
 * be documented in docs/data-quality-audit.md and reviewed without running
 * anything. Each query returns rows of { id } (technical IDs) or a single
 * { count } — never a PII column.
 */
const FINDINGS: IdCountFinding[] = [
  {
    key: "lot_cross_farm_offer",
    description:
      "Lots whose farmId differs from their linked offer's farmId (relationship inconsistency).",
    sql: `SELECT l."id" FROM "Lot" l
          JOIN "FarmProductOffer" o ON o."id" = l."farmProductOfferId"
          WHERE l."farmProductOfferId" IS NOT NULL AND o."farmId" <> l."farmId"`,
  },
  {
    key: "lot_cross_farm_product",
    description:
      "Lots whose farmId differs from their linked product's farmId (relationship inconsistency).",
    sql: `SELECT l."id" FROM "Lot" l
          JOIN "Product" p ON p."id" = l."productId"
          WHERE l."productId" IS NOT NULL AND p."farmId" <> l."farmId"`,
  },
  {
    key: "lot_backed_by_nothing",
    description:
      "Lots backed by neither a product nor an offer (traceability gap).",
    sql: `SELECT l."id" FROM "Lot" l
          WHERE l."productId" IS NULL AND l."farmProductOfferId" IS NULL`,
  },
  {
    key: "offer_missing_farm",
    description: "Offers with a dangling farm ownership (farm row missing).",
    sql: `SELECT o."id" FROM "FarmProductOffer" o
          LEFT JOIN "Farm" f ON f."id" = o."farmId"
          WHERE f."id" IS NULL`,
  },
  {
    key: "product_missing_farm",
    description: "Products with a dangling farm ownership (farm row missing).",
    sql: `SELECT p."id" FROM "Product" p
          LEFT JOIN "Farm" f ON f."id" = p."farmId"
          WHERE f."id" IS NULL`,
  },
  {
    key: "duplicate_lot_reference",
    description:
      "Lot references used by more than one lot (duplicate references).",
    sql: `SELECT "reference" AS id FROM "Lot"
          GROUP BY "reference" HAVING COUNT(*) > 1`,
  },
  {
    key: "invalid_date_sequence",
    description:
      "Lots violating slaughter <= cutting <= packing < expiry (invalid date sequence).",
    sql: `SELECT l."id" FROM "Lot" l
          WHERE NOT (l."slaughterDate" <= l."cuttingDate"
            AND l."cuttingDate" <= l."packingDate"
            AND l."packingDate" < l."expiryDate")`,
  },
  {
    key: "negative_units",
    description: "Lots with negative units.",
    sql: `SELECT l."id" FROM "Lot" l WHERE l."units" < 0`,
  },
  {
    key: "public_offer_not_publishable",
    description:
      "Offers served publicly (isActive) but not approved (publication-rule violation).",
    sql: `SELECT o."id" FROM "FarmProductOffer" o
          WHERE o."isActive" = true AND o."isApproved" = false`,
  },
  {
    key: "public_offer_unresolved_content_flag",
    description:
      "Active offers served while a content flag is unresolved (flagged/needs_evidence).",
    sql: `SELECT o."id" FROM "FarmProductOffer" o
          WHERE o."isActive" = true
            AND o."contentReviewState" IN ('flagged','needs_evidence')`,
  },
  {
    key: "public_farm_not_publishable",
    description:
      "Farms shown publicly (isActive) but not approved (publication-rule violation).",
    sql: `SELECT f."id" FROM "Farm" f
          WHERE f."isActive" = true AND f."isApproved" = false`,
  },
];

/** Counts of core tables (aggregate only — no row data). */
const COUNT_TABLES = [
  "Farm",
  "Product",
  "FarmProductOffer",
  "Lot",
  "Order",
  "ReservationCycle",
];

/** isTest rows that could contaminate production metrics (count only). */
const IS_TEST_COUNTS = [
  { table: "Order", label: "test orders" },
  { table: "Lot", label: "test lots" },
  { table: "Farm", label: "test farms" },
];

async function main() {
  const url = process.env[CONNECTION_ENV]?.trim();

  if (!url) {
    // The documented offline case: no credential, no connection, exit 0.
    // Never print the env var's value (there is none) and never attempt a
    // connection.
    console.log("Not run (no read-only credential)");
    console.log(
      `  Set ${CONNECTION_ENV} to a READ-ONLY Neon connection string (a Kiro ` +
        `secret) to run the SELECT-only production scan. The value is read ` +
        `from the environment only and is never printed, logged, or committed.`,
    );
    console.log(
      "  The queries this scan WOULD run are documented in " +
        "docs/data-quality-audit.md (Read-only production scan).",
    );
    process.exit(0);
    return;
  }

  // A credential is present: run SELECT-only queries. We bind the generated
  // Prisma client to the read-only URL via datasourceUrl. The connection string
  // is NEVER echoed.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient({
    datasourceUrl: url,
    log: ["error"],
  });

  const report: Record<string, unknown> = {
    scan: "neon-readonly-scan",
    mode: "SELECT-only (no write/DDL, counts + technical IDs only, no PII)",
    startedAt: new Date().toISOString(),
    counts: {} as Record<string, number>,
    isTestInProduction: {} as Record<string, number>,
    findings: {} as Record<
      string,
      { description: string; count: number; ids: string[] }
    >,
  };

  try {
    for (const table of COUNT_TABLES) {
      const rows = (await prisma.$queryRawUnsafe(
        `SELECT COUNT(*)::int AS count FROM "${table}"`,
      )) as Array<{ count: number }>;
      (report.counts as Record<string, number>)[table] = rows[0]?.count ?? 0;
    }

    for (const { table, label } of IS_TEST_COUNTS) {
      const rows = (await prisma.$queryRawUnsafe(
        `SELECT COUNT(*)::int AS count FROM "${table}" WHERE "isTest" = true`,
      )) as Array<{ count: number }>;
      (report.isTestInProduction as Record<string, number>)[label] =
        rows[0]?.count ?? 0;
    }

    for (const f of FINDINGS) {
      const rows = (await prisma.$queryRawUnsafe(f.sql)) as Array<{
        id: string;
      }>;
      const ids = rows.map((r) => String(r.id)).slice(0, 500); // cap, IDs only
      (report.findings as Record<string, unknown>)[f.key] = {
        description: f.description,
        count: rows.length,
        ids,
      };
    }

    report.finishedAt = new Date().toISOString();
    // Print ONLY counts + technical IDs. No PII, no connection string.
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  // Never print the connection string even on error. Surface only the message.
  console.error(
    "neon-readonly-scan failed:",
    err instanceof Error ? err.message : String(err),
  );
  process.exit(1);
});
