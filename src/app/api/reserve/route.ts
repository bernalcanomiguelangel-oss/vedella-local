/**
 * Reservation API. Validates the body with Zod (client input is untrusted), then
 * delegates to the server-side reserve() logic which binds to the active cycle,
 * never oversells, recomputes prices from the DB, and creates immutable order
 * snapshots. Payment runs through the pay-on-delivery PaymentGateway seam.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { reserve } from "@/lib/reserve";

const BodySchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.number().int().min(1).max(99),
      }),
    )
    .min(1),
  customerName: z.string().max(120).optional(),
  customerEmail: z.string().email().max(200).optional(),
});

const ERROR_STATUS: Record<string, number> = {
  EMPTY_BASKET: 400,
  BAD_QUANTITY: 400,
  NO_ACTIVE_CYCLE: 409,
  CYCLE_FULL: 409,
  PRODUCT_UNAVAILABLE: 409,
};

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

  const outcome = await reserve(prisma, parsed.data);
  if (!outcome.ok) {
    return NextResponse.json(outcome, {
      status: ERROR_STATUS[outcome.code] ?? 400,
    });
  }
  return NextResponse.json(outcome, { status: 201 });
}
