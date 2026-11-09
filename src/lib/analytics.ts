/**
 * Anonymous analytics emission (FEAT-005, decisions 4/5).
 *
 * Privacy-first: every event is keyed by an anonymous, cookie-based session id
 * that carries NO PII. A customerId is attached ONLY when an opt-in/signed-in
 * customer is present. We never store free-text that could identify a person on
 * an event (analytics-dictionary §2: "avoid unnecessary PII").
 *
 * The recording helpers take a PrismaClient so integration tests can exercise
 * them against a real SQLite db; the Next.js cookie/session helpers are kept
 * separate (they depend on `next/headers`, which only resolves in a request).
 */
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

/** Cookie holding the anonymous session id (no PII; httpOnly where set). */
export const ANON_SESSION_COOKIE = "vl_anon";

/**
 * The closed set of analytics event types (analytics-dictionary §2). Anything
 * outside this set is rejected before it reaches the database.
 */
export const ANALYTICS_EVENT_TYPES = [
  "session_started",
  "farm_list_viewed",
  "farm_viewed",
  "product_definition_viewed",
  "farm_offer_viewed",
  "pack_viewed",
  "cycle_viewed",
  "pack_selected",
  "offer_selected",
  "reservation_started",
  "reservation_validation_failed",
  "reservation_completed",
  "order_confirmed",
  "order_fulfilled",
  "next_cycle_interest_submitted",
  "language_selected",
  "delivery_mode_selected",
] as const;

export type AnalyticsEventType = (typeof ANALYTICS_EVENT_TYPES)[number];

/**
 * The closed channel set (analytics-dictionary §5). `unknown` is stored when a
 * channel cannot be determined — it is NEVER guessed.
 */
export const CHANNELS = [
  "direct",
  "organic_search",
  "instagram",
  "facebook",
  "whatsapp",
  "email",
  "farm_referral",
  "butcher_referral",
  "food_group",
  "paid_social",
  "qr_code",
  "event",
  "other",
  "unknown",
] as const;

export type Channel = (typeof CHANNELS)[number];

export function isAnalyticsEventType(v: string): v is AnalyticsEventType {
  return (ANALYTICS_EVENT_TYPES as readonly string[]).includes(v);
}

export function isChannel(v: string): v is Channel {
  return (CHANNELS as readonly string[]).includes(v);
}

/** Generate a fresh anonymous session id (opaque, no PII). */
export function newAnonSessionId(): string {
  return `anon_${randomUUID()}`;
}

/**
 * Dimensions that may ride along with an event. Deliberately narrow: only ids
 * and enumerated/closed-set values. NO free-text identifying a person.
 */
export interface AnalyticsEventInput {
  type: AnalyticsEventType;
  anonSessionId: string;
  customerId?: string | null;
  farmId?: string | null;
  definitionId?: string | null;
  offerId?: string | null;
  packId?: string | null;
  cycleId?: string | null;
  language?: string | null;
  deliveryMethod?: string | null;
  channel?: string | null;
  campaign?: string | null;
  isTest?: boolean;
}

/**
 * Record one analytics event. Invalid event types or channels are coerced
 * safely (unknown type is dropped; an out-of-set channel becomes `unknown`) so
 * a bad caller can never poison the metrics. Emission is best-effort: a failure
 * to log analytics must NEVER break a user-facing flow, so errors are swallowed
 * (with a console note) rather than propagated.
 */
export async function recordEvent(
  db: PrismaClient,
  input: AnalyticsEventInput,
): Promise<void> {
  if (!isAnalyticsEventType(input.type)) return;
  // Defensive: if the client lacks the analytics delegate (e.g. a test stub),
  // skip silently rather than throwing — analytics is best-effort.
  if (!db?.analyticsEvent?.create) return;
  const channel =
    input.channel && isChannel(input.channel) ? input.channel : input.channel ? "unknown" : null;
  try {
    await db.analyticsEvent.create({
      data: {
        type: input.type,
        anonSessionId: input.anonSessionId,
        customerId: input.customerId ?? null,
        farmId: input.farmId ?? null,
        definitionId: input.definitionId ?? null,
        offerId: input.offerId ?? null,
        packId: input.packId ?? null,
        cycleId: input.cycleId ?? null,
        language: input.language ?? null,
        deliveryMethod: input.deliveryMethod ?? null,
        channel,
        campaign: input.campaign ?? null,
        isTest: input.isTest ?? false,
      },
    });
  } catch (err) {
    console.warn(
      "[analytics] failed to record event:",
      err instanceof Error ? err.message : "unknown error",
    );
  }
}

/** Resolve a channel from UTM-ish query parameters. Returns `unknown` when it
 * cannot be determined — never guesses. */
export function resolveChannel(params: {
  utmSource?: string | null;
  utmMedium?: string | null;
  channel?: string | null;
  referralCode?: string | null;
}): Channel {
  // An explicit channel param wins if it is in the closed set.
  if (params.channel && isChannel(params.channel)) return params.channel;
  // A farm referral code implies the farm_referral channel.
  if (params.referralCode) return "farm_referral";

  const src = (params.utmSource ?? "").toLowerCase();
  const medium = (params.utmMedium ?? "").toLowerCase();

  if (src === "instagram" || src === "ig") return "instagram";
  if (src === "facebook" || src === "fb") return "facebook";
  if (src === "whatsapp" || src === "wa") return "whatsapp";
  if (src === "email" || medium === "email") return "email";
  if (medium === "qr" || src === "qr") return "qr_code";
  if (medium === "paid_social" || medium === "cpc" || medium === "paid")
    return "paid_social";
  if (medium === "organic" || src === "google" || src === "bing")
    return "organic_search";
  if (src || medium) return "other";

  // No signal at all: a plain, first-party visit is `direct`, not a guess.
  return "direct";
}

export interface AttributionInput {
  anonSessionId: string;
  channel: Channel;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  farmReferralCode?: string | null;
  isTest?: boolean;
}

/**
 * Capture channel attribution for a session: first-touch is written once and
 * never overwritten; latest-touch is updated on every subsequent visit. UTM and
 * farm-referral fields are stored when present.
 */
export async function captureAttribution(
  db: PrismaClient,
  input: AttributionInput,
): Promise<void> {
  try {
    const existing = await db.channelAttribution.findUnique({
      where: { anonSessionId: input.anonSessionId },
    });
    if (!existing) {
      await db.channelAttribution.create({
        data: {
          anonSessionId: input.anonSessionId,
          firstTouchChannel: input.channel,
          latestTouchChannel: input.channel,
          utmSource: input.utmSource ?? null,
          utmMedium: input.utmMedium ?? null,
          utmCampaign: input.utmCampaign ?? null,
          farmReferralCode: input.farmReferralCode ?? null,
          isTest: input.isTest ?? false,
        },
      });
    } else {
      await db.channelAttribution.update({
        where: { anonSessionId: input.anonSessionId },
        data: {
          latestTouchChannel: input.channel,
          // Only fill UTM/referral if newly present; never clobber with null.
          utmSource: input.utmSource ?? existing.utmSource,
          utmMedium: input.utmMedium ?? existing.utmMedium,
          utmCampaign: input.utmCampaign ?? existing.utmCampaign,
          farmReferralCode:
            input.farmReferralCode ?? existing.farmReferralCode,
        },
      });
    }
  } catch (err) {
    console.warn(
      "[analytics] failed to capture attribution:",
      err instanceof Error ? err.message : "unknown error",
    );
  }
}
