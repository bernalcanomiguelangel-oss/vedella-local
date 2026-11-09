"use server";

/**
 * Public server actions for anonymous analytics (FEAT-005, decisions 4/5).
 *
 * These run server-side so untrusted input (an email) is Zod-validated before
 * touching the database. Nothing here performs marketing automation; the
 * notify-me action only captures an opt-in email into the interested list and
 * emits the documented event.
 */
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getOrCreateAnonSession } from "@/lib/analytics-session";
import { recordEvent } from "@/lib/analytics";
import { submitInterest } from "@/lib/analytics-interest";

const NotifySchema = z.object({
  email: z.string().email().max(200),
  locale: z.string().max(5).optional(),
  farmId: z.string().max(64).optional(),
});

export interface NotifyResult {
  ok: boolean;
  error?: "invalid_email" | "server_error";
}

/**
 * Capture a notify-me email. Validates the email (untrusted input), inserts an
 * InterestedContact linked to the anonymous session, and emits
 * next_cycle_interest_submitted. Returns a small result object (no PII echoed).
 */
export async function notifyMeAction(formData: FormData): Promise<NotifyResult> {
  const parsed = NotifySchema.safeParse({
    email: formData.get("email"),
    locale: formData.get("locale") ?? undefined,
    farmId: formData.get("farmId") ?? undefined,
  });
  if (!parsed.success) return { ok: false, error: "invalid_email" };

  const session = getOrCreateAnonSession();
  try {
    await submitInterest(prisma, {
      email: parsed.data.email,
      locale: parsed.data.locale ?? null,
      anonSessionId: session.id,
      farmId: parsed.data.farmId ?? null,
    });
    return { ok: true };
  } catch (err) {
    console.warn(
      "[analytics] notify-me capture failed:",
      err instanceof Error ? err.message : "unknown error",
    );
    return { ok: false, error: "server_error" };
  }
}

/**
 * Lightweight event-only server action used by client components to mark a
 * selection/upsell (pack_selected / offer_selected) as it happens in the
 * basket. Invalid types are ignored by recordEvent.
 */
export async function trackSelectionAction(input: {
  type: string;
  offerId?: string;
  packId?: string;
  farmId?: string;
}): Promise<void> {
  const session = getOrCreateAnonSession();
  await recordEvent(prisma, {
    // recordEvent rejects any type outside the closed set.
    type: input.type as never,
    anonSessionId: session.id,
    offerId: input.offerId ?? null,
    packId: input.packId ?? null,
    farmId: input.farmId ?? null,
  });
}
