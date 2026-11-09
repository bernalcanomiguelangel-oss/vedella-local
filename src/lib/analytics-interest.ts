/**
 * Notify-me / interested-contact capture (FEAT-005, decision 5).
 *
 * Pure DB-side logic so integration tests can exercise it directly. Inserts an
 * InterestedContact and emits next_cycle_interest_submitted. No marketing
 * automation; this is capture-only. The email is the only PII and is captured
 * strictly on opt-in.
 */
import type { PrismaClient } from "@prisma/client";
import { recordEvent } from "@/lib/analytics";

export interface InterestInput {
  email: string;
  locale?: string | null;
  anonSessionId?: string | null;
  farmId?: string | null;
  isTest?: boolean;
}

export async function submitInterest(
  db: PrismaClient,
  input: InterestInput,
): Promise<{ id: string }> {
  const contact = await db.interestedContact.create({
    data: {
      email: input.email,
      locale: input.locale ?? null,
      anonSessionId: input.anonSessionId ?? null,
      farmId: input.farmId ?? null,
      isTest: input.isTest ?? false,
    },
  });
  // Emit the documented event keyed to the session (no PII on the event row;
  // the email lives only on InterestedContact).
  await recordEvent(db, {
    type: "next_cycle_interest_submitted",
    anonSessionId: input.anonSessionId ?? "unknown",
    farmId: input.farmId ?? null,
    language: input.locale ?? null,
    isTest: input.isTest ?? false,
  });
  return { id: contact.id };
}
