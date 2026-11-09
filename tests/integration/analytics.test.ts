/**
 * FEAT-005 analytics: anonymous event emission, channel resolution, and the
 * notify-me interested-list capture, against a real SQLite db.
 *
 * Privacy assertions: an event row carries NO free-text identifying a person;
 * only an opt-in customerId may be present. Channel resolves to `unknown` when
 * undetermined (never guessed) and the interested-email capture both stores the
 * contact and emits next_cycle_interest_submitted.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createTestDb, type TestDb } from "../helpers/testDb";
import {
  recordEvent,
  captureAttribution,
  resolveChannel,
  ANALYTICS_EVENT_TYPES,
  newAnonSessionId,
} from "../../src/lib/analytics";
import { submitInterest } from "../../src/lib/analytics-interest";

let testDb: TestDb;
let db: PrismaClient;

beforeAll(async () => {
  testDb = await createTestDb();
  db = testDb.prisma;
});

afterAll(async () => {
  await testDb.cleanup();
});

describe("anonymous event emission", () => {
  it("records the key-flow events keyed by an anonymous session with no PII", async () => {
    const anon = newAnonSessionId();
    expect(anon.startsWith("anon_")).toBe(true);

    for (const type of [
      "session_started",
      "farm_list_viewed",
      "farm_viewed",
      "offer_selected",
      "reservation_started",
      "reservation_completed",
    ] as const) {
      await recordEvent(db, { type, anonSessionId: anon });
    }

    const rows = await db.analyticsEvent.findMany({ where: { anonSessionId: anon } });
    expect(rows).toHaveLength(6);

    // Enter site → view farms → select item → purchase are all observable.
    const types = rows.map((r) => r.type).sort();
    expect(types).toContain("session_started");
    expect(types).toContain("farm_list_viewed");
    expect(types).toContain("offer_selected");
    expect(types).toContain("reservation_completed");

    // No PII: customerId is null (anonymous), and the row has no free-text
    // identity field at all (only ids + enumerated dimensions exist).
    for (const r of rows) {
      expect(r.customerId).toBeNull();
      expect(Object.keys(r)).not.toContain("email");
      expect(Object.keys(r)).not.toContain("name");
    }
  });

  it("stores a customerId ONLY when an opt-in customer is supplied", async () => {
    const anon = newAnonSessionId();
    await recordEvent(db, {
      type: "reservation_completed",
      anonSessionId: anon,
      customerId: "cust_optin_1",
    });
    const row = await db.analyticsEvent.findFirst({ where: { anonSessionId: anon } });
    expect(row?.customerId).toBe("cust_optin_1");
  });

  it("rejects an unknown event type (closed set)", async () => {
    const anon = newAnonSessionId();
    // @ts-expect-error — deliberately invalid type is dropped, not stored.
    await recordEvent(db, { type: "not_a_real_event", anonSessionId: anon });
    const count = await db.analyticsEvent.count({ where: { anonSessionId: anon } });
    expect(count).toBe(0);
  });

  it("keeps the documented event set stable", () => {
    expect(ANALYTICS_EVENT_TYPES).toContain("next_cycle_interest_submitted");
    expect(ANALYTICS_EVENT_TYPES).toContain("language_selected");
    expect(ANALYTICS_EVENT_TYPES).toContain("delivery_mode_selected");
  });
});

describe("channel attribution", () => {
  it("resolves to 'unknown' is never guessed: a clear signal maps, a blank first-party visit is direct", () => {
    expect(resolveChannel({ utmSource: "instagram" })).toBe("instagram");
    expect(resolveChannel({ referralCode: "FARM123" })).toBe("farm_referral");
    expect(resolveChannel({ utmMedium: "email" })).toBe("email");
    // No signal at all → direct (a first-party visit), not a fabricated channel.
    expect(resolveChannel({})).toBe("direct");
  });

  it("stores 'unknown' when an out-of-set channel cannot be determined", async () => {
    const anon = newAnonSessionId();
    await recordEvent(db, {
      type: "session_started",
      anonSessionId: anon,
      channel: "totally-made-up-channel",
    });
    const row = await db.analyticsEvent.findFirst({ where: { anonSessionId: anon } });
    expect(row?.channel).toBe("unknown");
  });

  it("captures first-touch once and updates latest-touch on return", async () => {
    const anon = newAnonSessionId();
    await captureAttribution(db, { anonSessionId: anon, channel: "instagram" });
    await captureAttribution(db, { anonSessionId: anon, channel: "direct" });
    const attr = await db.channelAttribution.findUnique({
      where: { anonSessionId: anon },
    });
    expect(attr?.firstTouchChannel).toBe("instagram");
    expect(attr?.latestTouchChannel).toBe("direct");
  });
});

describe("notify-me interested capture", () => {
  it("stores the contact and emits next_cycle_interest_submitted", async () => {
    const anon = newAnonSessionId();
    const { id } = await submitInterest(db, {
      email: "someone@example.com",
      locale: "ca",
      anonSessionId: anon,
    });
    const contact = await db.interestedContact.findUnique({ where: { id } });
    expect(contact?.email).toBe("someone@example.com");

    const event = await db.analyticsEvent.findFirst({
      where: { anonSessionId: anon, type: "next_cycle_interest_submitted" },
    });
    expect(event).not.toBeNull();
    // The event row never carries the email — PII stays on InterestedContact.
    expect(Object.keys(event ?? {})).not.toContain("email");
  });
});
