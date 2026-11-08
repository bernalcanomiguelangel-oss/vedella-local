/**
 * Guardrail filter + evidence enforcement (R30). The filter must strip any
 * price/approval/role field at any depth, flag WTP-proxy wording, and force
 * `needs-evidence` on unsourced claims.
 */
import { describe, expect, it } from "vitest";
import {
  applyGuardrails,
  enforceEvidence,
  scanMetricsForWtpProxy,
} from "../../src/lib/ai/guardrails";

describe("applyGuardrails field stripping", () => {
  it("drops price/approval/active/role fields at any depth", () => {
    const hostile = {
      text: "Ribeye steak",
      priceCents: 9999, // must be stripped
      basePriceCents: 100, // must be stripped
      isApproved: true, // must be stripped
      isActive: true, // must be stripped
      lifecycle: "active", // must be stripped
      role: "platform_admin", // must be stripped
      nested: {
        discount: 50, // must be stripped
        name: "keep me",
        deeper: { approveNow: true }, // approve* stripped
      },
      items: [{ text: "ok", amount: 5 }], // amount stripped inside array
    };
    const { value, report } = applyGuardrails(hostile);
    const json = JSON.stringify(value);

    expect(json).not.toContain("priceCents");
    expect(json).not.toContain("basePriceCents");
    expect(json).not.toContain("isApproved");
    expect(json).not.toContain("isActive");
    expect(json).not.toContain("lifecycle");
    expect(json).not.toContain("role");
    expect(json).not.toContain("discount");
    expect(json).not.toContain("approveNow");
    expect(json).not.toContain("amount");

    // Non-sensitive data is preserved.
    expect(json).toContain("Ribeye steak");
    expect(json).toContain("keep me");

    expect(report.strippedFields.length).toBeGreaterThan(0);
  });

  it("detects a willingness-to-pay proxy signal in text", () => {
    const { report } = applyGuardrails({
      headline: "Charge them more because they can afford it in this postcode.",
    });
    expect(report.wtpProxyDetected).toBe(true);
  });

  it("does not false-positive on neutral market language", () => {
    const { report } = applyGuardrails({
      headline: "Average price for Entrecot this week across two farms.",
    });
    expect(report.wtpProxyDetected).toBe(false);
  });
});

describe("scanMetricsForWtpProxy", () => {
  it("flags WTP wording in summary text", () => {
    expect(
      scanMetricsForWtpProxy(["segment by inferred income bracket"]),
    ).toBe(true);
    expect(scanMetricsForWtpProxy(["Entrecot averaged 14,38 €"])).toBe(false);
  });
});

describe("enforceEvidence", () => {
  it("forces needs-evidence when no source backs a value", () => {
    expect(enforceEvidence({ sourceRef: null, needsEvidence: false })).toEqual({
      sourceRef: null,
      needsEvidence: true,
    });
    expect(enforceEvidence({ sourceRef: "   ", needsEvidence: false })).toEqual({
      sourceRef: null,
      needsEvidence: true,
    });
  });
  it("keeps a real source reference", () => {
    expect(
      enforceEvidence({ sourceRef: "document:r.pdf", needsEvidence: false }),
    ).toEqual({ sourceRef: "document:r.pdf", needsEvidence: false });
  });
});
