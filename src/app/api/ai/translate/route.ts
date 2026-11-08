/**
 * Translation API (R24). Generates ca/es/en machine translations for a farm/
 * product/pack field and stores them as `Translation` rows with status
 * `machine`. It NEVER publishes: a human approves rows in the admin queue.
 *
 * Server-side only. Works with no API key via the MockAiProvider.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { LOCALES } from "@/lib/i18n";
import { translateField } from "@/lib/ai/translate";

// Request body is UNTRUSTED client input -> validated with Zod.
const BodySchema = z.object({
  entityType: z.enum(["farm", "product", "pack"]),
  entityId: z.string().min(1).max(60),
  field: z.string().min(1).max(40),
  sourceText: z.string().min(1).max(5000),
  targetLocales: z.array(z.enum(LOCALES)).min(1).optional(),
});

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ ok: false, code: "BAD_JSON" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, code: "INVALID_BODY", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const result = await translateField(parsed.data);
  // Always 200: even an invalid model response is a safe, audited no-op.
  return NextResponse.json({
    ok: result.ok,
    outcome: result.outcome,
    stored: result.stored,
    note: "Stored as machine translations for human review. Never auto-published.",
  });
}
