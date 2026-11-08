/**
 * Metrics API (R25). Returns the weekly average market price per cut (per ISO
 * week), computed deterministically from the database (test records excluded),
 * plus a neutral summary headline. Consumed by the FEAT-004 dashboard.
 *
 * GET  — read-only: computes averages and the summary for the requested (or
 *        current) ISO week WITHOUT writing snapshots.
 * POST — runs the weekly job: computes, persists MarketPriceSnapshot rows, and
 *        returns the summary. This is what a scheduler would call weekly.
 *
 * Server-side only. Works with no API key via the MockAiProvider.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { computeWeeklyAverages, runWeeklyMetrics } from "@/lib/ai/metrics";
import { isoWeekStartKey } from "@/lib/ai/isoWeek";
import { getApiAdmin } from "@/lib/auth";

const WeekSchema = z.object({
  // Optional ISO date to pick a specific week; defaults to "now".
  week: z.string().max(20).optional(),
});

function parseWeek(value: string | undefined | null): Date {
  if (!value) return new Date();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

export async function GET(request: Request) {
  // Metrics are an internal admin surface (R21); gate the HTTP edge.
  const admin = await getApiAdmin();
  if (!admin) {
    return NextResponse.json({ ok: false, code: "UNAUTHORIZED" }, { status: 401 });
  }

  const url = new URL(request.url);
  const parsed = WeekSchema.safeParse({
    week: url.searchParams.get("week") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ ok: false, code: "INVALID_QUERY" }, { status: 400 });
  }
  const ref = parseWeek(parsed.data.week);
  const { weekStart, perCut } = await computeWeeklyAverages(ref);
  return NextResponse.json({
    ok: true,
    weekStart: isoWeekStartKey(weekStart),
    perCut,
  });
}

export async function POST(request: Request) {
  // Running the weekly job writes snapshots; admin only (R21).
  const admin = await getApiAdmin();
  if (!admin) {
    return NextResponse.json({ ok: false, code: "UNAUTHORIZED" }, { status: 401 });
  }

  let json: unknown = {};
  try {
    json = await request.json();
  } catch {
    // body optional for this job trigger
  }
  const parsed = WeekSchema.safeParse(json ?? {});
  const ref = parseWeek(parsed.success ? parsed.data.week : undefined);
  const result = await runWeeklyMetrics(ref);
  return NextResponse.json({
    ok: result.outcome === "ok",
    outcome: result.outcome,
    weekStart: result.weekStart,
    perCut: result.perCut,
    summary: result.summary,
  });
}
