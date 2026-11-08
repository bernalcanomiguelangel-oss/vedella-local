/**
 * FEAT-005 chart series builder: returns an empty-state marker when there is no
 * data, and a small-sample caveat when the total is below the threshold.
 */
import { describe, expect, it } from "vitest";
import {
  buildSeries,
  buildFunnelSeries,
} from "../../src/lib/admin/chart-series";

describe("buildSeries", () => {
  it("marks isEmpty when there are no points", () => {
    const s = buildSeries([]);
    expect(s.isEmpty).toBe(true);
    expect(s.points).toHaveLength(0);
  });

  it("marks isEmpty when all values are zero", () => {
    const s = buildSeries([
      { label: "a", value: 0 },
      { label: "b", value: 0 },
    ]);
    expect(s.isEmpty).toBe(true);
  });

  it("flags a small sample under the threshold", () => {
    const s = buildSeries([{ label: "a", value: 5 }]);
    expect(s.isEmpty).toBe(false);
    expect(s.sampleTooSmall).toBe(true);
    expect(s.max).toBe(5);
    expect(s.total).toBe(5);
  });

  it("does not flag a healthy sample", () => {
    const s = buildSeries([{ label: "a", value: 30 }]);
    expect(s.sampleTooSmall).toBe(false);
  });
});

describe("buildFunnelSeries", () => {
  it("returns an empty-state marker on no visits", () => {
    const s = buildFunnelSeries({ visits: 0, started: 0, completed: 0 });
    expect(s.isEmpty).toBe(true);
  });

  it("orders the funnel visits → started → completed", () => {
    const s = buildFunnelSeries({ visits: 100, started: 40, completed: 20 });
    expect(s.points.map((p) => p.label)).toEqual([
      "visits",
      "reservation_started",
      "reservation_completed",
    ]);
    expect(s.max).toBe(100);
  });
});
