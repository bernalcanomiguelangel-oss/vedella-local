/**
 * Pure unit tests for the deterministic medical-claim content guard
 * (src/lib/content-guard.ts, condition 2). Covers the three buckets and
 * accent/spelling variants. No database — classifyContent is pure.
 */
import { describe, expect, it } from "vitest";
import {
  classifyContent,
  contentReviewStateFor,
  requiresContentReview,
  isContentReviewUnresolved,
} from "../src/lib/content-guard";

describe("classifyContent — three buckets", () => {
  it("flags a treatment/prevention claim as PROHIBITED", () => {
    const r = classifyContent(
      "This beef cures iron deficiency and prevents anaemia.",
    );
    expect(r.kind).toBe("prohibited");
    expect(r.matches.length).toBeGreaterThan(0);
    expect(r.reason).not.toBe("");
    // Both detection kinds collapse to the single workflow state needs_review.
    expect(contentReviewStateFor(r)).toBe("needs_review");
    expect(requiresContentReview(r)).toBe(true);
  });

  it("marks a nutrition claim as NEEDS_EVIDENCE", () => {
    const r = classifyContent("Source of iron.");
    expect(r.kind).toBe("needs_evidence");
    expect(contentReviewStateFor(r)).toBe("needs_review");
    expect(requiresContentReview(r)).toBe(true);
  });

  it("treats ordinary descriptive text as ORDINARY -> clear", () => {
    const r = classifyContent("Vacuum-packed entrecote, 280-320 g per steak.");
    expect(r.kind).toBe("ordinary");
    expect(r.matches).toEqual([]);
    // 'clear' means "evaluated, nothing found" — distinct from null.
    expect(contentReviewStateFor(r)).toBe("clear");
    expect(requiresContentReview(r)).toBe(false);
  });
});

describe("classifyContent — accent and spelling tolerance", () => {
  it("catches 'anemia' without the a-e digraph", () => {
    expect(classifyContent("Helps with anemia.").kind).toBe("prohibited");
  });

  it("catches accented Catalan/Spanish wording", () => {
    expect(classifyContent("Cura la deficiència de ferro.").kind).toBe(
      "prohibited",
    );
    expect(classifyContent("Tractament terapèutic natural.").kind).toBe(
      "prohibited",
    );
  });

  it("is case-insensitive", () => {
    expect(classifyContent("TREATS high blood pressure.").kind).toBe(
      "prohibited",
    );
    expect(classifyContent("RICH IN protein.").kind).toBe("needs_evidence");
  });

  it("prohibited wins over needs-evidence when both appear", () => {
    const r = classifyContent("Rich in iron and cures anaemia.");
    expect(r.kind).toBe("prohibited");
  });
});

describe("isContentReviewUnresolved", () => {
  it("blocks on needs_review/rejected and clears on clear/approved/null", () => {
    expect(isContentReviewUnresolved("needs_review")).toBe(true);
    expect(isContentReviewUnresolved("rejected")).toBe(true);
    expect(isContentReviewUnresolved("approved")).toBe(false);
    expect(isContentReviewUnresolved("clear")).toBe(false);
    expect(isContentReviewUnresolved(null)).toBe(false);
    expect(isContentReviewUnresolved(undefined)).toBe(false);
  });
});
