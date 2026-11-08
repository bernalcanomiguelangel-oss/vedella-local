/**
 * Request-scoped analytics session helpers (FEAT-005).
 *
 * These depend on `next/headers` (cookies) and so only resolve inside a Next.js
 * request. They layer the anonymous-session cookie + channel attribution on top
 * of the pure emission helpers in src/lib/analytics.ts. Keeping the two files
 * separate lets integration tests exercise the DB-side logic directly without a
 * request context.
 */
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import {
  ANON_SESSION_COOKIE,
  newAnonSessionId,
  recordEvent,
  captureAttribution,
  resolveChannel,
  type AnalyticsEventInput,
  type AnalyticsEventType,
} from "@/lib/analytics";

/**
 * Resolve the anonymous session id from the cookie, minting a new one when
 * absent. Returns the id plus whether it was freshly created (so the caller can
 * emit `session_started` + capture attribution exactly once).
 *
 * NOTE: a Server Component cannot set cookies (only route handlers / server
 * actions can). We therefore set the cookie best-effort and swallow the error
 * when it is not writable — the id still works for the current request via the
 * value we return, and middleware/actions persist it on the next write.
 */
export function getOrCreateAnonSession(): { id: string; isNew: boolean } {
  let jar: ReturnType<typeof cookies> | null = null;
  try {
    jar = cookies();
  } catch {
    // Called outside a request scope (e.g. a direct unit-test invocation of a
    // route handler). Fall back to an ephemeral anonymous id so analytics never
    // breaks the caller; nothing is persisted to a cookie.
    return { id: newAnonSessionId(), isNew: true };
  }
  const existing = jar.get(ANON_SESSION_COOKIE)?.value;
  if (existing) return { id: existing, isNew: false };
  const id = newAnonSessionId();
  try {
    jar.set(ANON_SESSION_COOKIE, id, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  } catch {
    // Server Components cannot mutate cookies; the value is still usable now.
  }
  return { id, isNew: true };
}

/** Read UTM / referral params from a URLSearchParams-like object. */
export function readChannelParams(
  sp: Record<string, string | string[] | undefined> | undefined,
) {
  const one = (k: string): string | null => {
    const v = sp?.[k];
    return typeof v === "string" ? v : Array.isArray(v) ? v[0] ?? null : null;
  };
  const utmSource = one("utm_source");
  const utmMedium = one("utm_medium");
  const utmCampaign = one("utm_campaign");
  const referralCode = one("ref") ?? one("farm_ref");
  const channelParam = one("channel");
  return {
    utmSource,
    utmMedium,
    utmCampaign,
    referralCode,
    channel: resolveChannel({
      utmSource,
      utmMedium,
      referralCode,
      channel: channelParam,
    }),
  };
}

/**
 * Emit one event for the current request using the resolved anonymous session.
 * Best-effort: never throws into a page render.
 */
export async function emit(
  type: AnalyticsEventType,
  extra: Partial<Omit<AnalyticsEventInput, "type" | "anonSessionId">> = {},
  session?: { id: string },
): Promise<void> {
  const anon = session ?? getOrCreateAnonSession();
  await recordEvent(prisma, { type, anonSessionId: anon.id, ...extra });
}

/**
 * Convenience for a public page load: resolves the session, and on a NEW
 * session emits `session_started` + captures channel attribution from the URL.
 * Returns the session so the caller can emit the page's own view event.
 */
export async function startPageSession(
  searchParams?: Record<string, string | string[] | undefined>,
  language?: string,
): Promise<{ id: string; isNew: boolean }> {
  const session = getOrCreateAnonSession();
  const ch = readChannelParams(searchParams);
  if (session.isNew) {
    await recordEvent(prisma, {
      type: "session_started",
      anonSessionId: session.id,
      channel: ch.channel,
      campaign: ch.utmCampaign,
      language,
    });
    await captureAttribution(prisma, {
      anonSessionId: session.id,
      channel: ch.channel,
      utmSource: ch.utmSource,
      utmMedium: ch.utmMedium,
      utmCampaign: ch.utmCampaign,
      farmReferralCode: ch.referralCode,
    });
  }
  return session;
}
