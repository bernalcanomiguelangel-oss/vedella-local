/**
 * Pure unit tests for the single source of truth of the content-review workflow
 * states (src/lib/content-review.ts): the validated constant set, the Zod enum,
 * the publication-eligibility helpers, and the transition matrix.
 */
import { describe, expect, it } from "vitest";
import {
  CONTENT_REVIEW_STATES,
  contentReviewStateSchema,
  isUnresolvedForPublication,
  requiresReview,
  isContentReviewState,
  canTransitionContentReview,
} from "../src/lib/content-review";

describe("CONTENT_REVIEW_STATES — validated set", () => {
  it("is exactly the user's four values in order", () => {
    expect(CONTENT_REVIEW_STATES).toEqual([
      "clear",
      "needs_review",
      "approved",
      "rejected",
    ]);
  });

  it("the Zod enum accepts the four states and rejects legacy/old values", () => {
    for (const s of CONTENT_REVIEW_STATES) {
      expect(contentReviewStateSchema.safeParse(s).success).toBe(true);
    }
    for (const bad of ["flagged", "needs_evidence", "resolved", "", "CLEAR"]) {
      expect(contentReviewStateSchema.safeParse(bad).success).toBe(false);
    }
  });

  it("isContentReviewState type-guards the four values only", () => {
    expect(isContentReviewState("clear")).toBe(true);
    expect(isContentReviewState("rejected")).toBe(true);
    expect(isContentReviewState("flagged")).toBe(false);
    expect(isContentReviewState(null)).toBe(false);
    expect(isContentReviewState(undefined)).toBe(false);
  });
});

describe("isUnresolvedForPublication — publication eligibility", () => {
  it("blocks needs_review and rejected", () => {
    expect(isUnresolvedForPublication("needs_review")).toBe(true);
    expect(isUnresolvedForPublication("rejected")).toBe(true);
  });

  it("does NOT block clear, approved, or NULL (legacy preserved)", () => {
    expect(isUnresolvedForPublication("clear")).toBe(false);
    expect(isUnresolvedForPublication("approved")).toBe(false);
    expect(isUnresolvedForPublication(null)).toBe(false);
    expect(isUnresolvedForPublication(undefined)).toBe(false);
  });

  it("requiresReview is true only for needs_review", () => {
    expect(requiresReview("needs_review")).toBe(true);
    expect(requiresReview("clear")).toBe(false);
    expect(requiresReview("rejected")).toBe(false);
    expect(requiresReview(null)).toBe(false);
  });
});

describe("canTransitionContentReview — transition matrix", () => {
  it("allows the user's permitted transitions", () => {
    expect(canTransitionContentReview(null, "clear")).toBe(true);
    expect(canTransitionContentReview(null, "needs_review")).toBe(true);
    expect(canTransitionContentReview("clear", "needs_review")).toBe(true);
    expect(canTransitionContentReview("needs_review", "approved")).toBe(true);
    expect(canTransitionContentReview("needs_review", "rejected")).toBe(true);
    expect(canTransitionContentReview("rejected", "needs_review")).toBe(true);
    expect(canTransitionContentReview("approved", "needs_review")).toBe(true);
  });

  it("allows idempotent self-transitions", () => {
    expect(canTransitionContentReview("clear", "clear")).toBe(true);
    expect(canTransitionContentReview("needs_review", "needs_review")).toBe(true);
    expect(canTransitionContentReview("approved", "approved")).toBe(true);
    expect(canTransitionContentReview("rejected", "rejected")).toBe(true);
  });

  it("disallows illegal transitions", () => {
    // Cannot jump straight to approved/rejected without going through review.
    expect(canTransitionContentReview(null, "approved")).toBe(false);
    expect(canTransitionContentReview(null, "rejected")).toBe(false);
    expect(canTransitionContentReview("clear", "approved")).toBe(false);
    expect(canTransitionContentReview("clear", "rejected")).toBe(false);
    // Cannot flip directly between approved and rejected.
    expect(canTransitionContentReview("approved", "rejected")).toBe(false);
    expect(canTransitionContentReview("rejected", "approved")).toBe(false);
  });
});
