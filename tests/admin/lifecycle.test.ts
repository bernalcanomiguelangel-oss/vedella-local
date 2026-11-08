/**
 * Unit tests for the human-only lifecycle state machine. Critically: approval is
 * SEPARATE from active, and a record can never become active without first being
 * approved.
 */
import { describe, expect, it } from "vitest";
import {
  LIFECYCLE_STATES,
  allowedTransitions,
  canTransition,
  flagsForState,
  planTransition,
  LifecycleError,
} from "../../src/lib/admin/lifecycle";

describe("lifecycle transition table", () => {
  it("pending_review can be approved or rejected (human review decisions)", () => {
    expect(canTransition("pending_review", "approved")).toBe(true);
    expect(canTransition("pending_review", "rejected")).toBe(true);
  });

  it("a record cannot jump straight to active from pending_review", () => {
    // Active is only reachable from approved/inactive — approval must happen first.
    expect(canTransition("pending_review", "active")).toBe(false);
  });

  it("approved can be activated, deactivated or archived", () => {
    expect(canTransition("approved", "active")).toBe(true);
    expect(canTransition("approved", "inactive")).toBe(true);
    expect(canTransition("approved", "archived")).toBe(true);
  });

  it("archived is terminal", () => {
    expect(allowedTransitions("archived")).toEqual([]);
  });

  it("rejects unknown states", () => {
    expect(canTransition("approved", "banana")).toBe(false);
    expect(allowedTransitions("banana")).toEqual([]);
  });
});

describe("flagsForState: approval is separate from active", () => {
  it("approved => isApproved true but isActive false", () => {
    const f = flagsForState("approved");
    expect(f.isApproved).toBe(true);
    expect(f.isActive).toBe(false);
  });

  it("active => isApproved true AND isActive true", () => {
    const f = flagsForState("active");
    expect(f.isApproved).toBe(true);
    expect(f.isActive).toBe(true);
  });

  it("inactive => approved but not active", () => {
    const f = flagsForState("inactive");
    expect(f.isApproved).toBe(true);
    expect(f.isActive).toBe(false);
  });

  it("rejected/draft/archived/pending => neither approved nor active", () => {
    for (const s of ["rejected", "draft", "archived", "pending_review"] as const) {
      const f = flagsForState(s);
      expect(f.isApproved).toBe(false);
      expect(f.isActive).toBe(false);
    }
  });
});

describe("planTransition", () => {
  it("returns derived flags for a legal transition", () => {
    expect(planTransition("pending_review", "approved")).toEqual({
      lifecycle: "approved",
      isApproved: true,
      isActive: false,
    });
  });

  it("throws ILLEGAL_TRANSITION for a disallowed jump", () => {
    expect(() => planTransition("pending_review", "active")).toThrowError(
      LifecycleError,
    );
    try {
      planTransition("pending_review", "active");
    } catch (e) {
      expect((e as LifecycleError).code).toBe("ILLEGAL_TRANSITION");
    }
  });

  it("throws UNKNOWN_STATE for an invalid target", () => {
    try {
      planTransition("approved", "nope");
    } catch (e) {
      expect((e as LifecycleError).code).toBe("UNKNOWN_STATE");
    }
  });

  it("all defined states are covered by the table", () => {
    for (const s of LIFECYCLE_STATES) {
      expect(Array.isArray(allowedTransitions(s))).toBe(true);
    }
  });
});
