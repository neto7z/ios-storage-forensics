import { describe, expect, it } from "vitest";
import { assessCompatibility, chipForProductType } from "./compatibility";

describe("compatibility matrix", () => {
  it("identifies an iPhone XR on iOS 18.7 as Dopamine-compatible", () => {
    const result = assessCompatibility({ productType: "iPhone11,8", iosVersion: "18.7" });

    expect(result.chip).toBe("A12");
    expect(result.advancedStatus).toBe("supported");
    expect(result.methods.map((method) => method.id)).toContain("dopamine");
  });

  it("keeps universal diagnostics when no audited jailbreak matches", () => {
    const result = assessCompatibility({ productType: "iPhone16,2", iosVersion: "18.7" });

    expect(result.chip).toBe("A17");
    expect(result.basicStatus).toBe("supported");
    expect(result.advancedStatus).toBe("unavailable");
    expect(result.methods).toHaveLength(0);
  });

  it("offers both audited methods for an A11 device on iOS 16", () => {
    const result = assessCompatibility({ productType: "iPhone10,6", iosVersion: "16.7.12" });

    expect(result.advancedStatus).toBe("supported");
    expect(result.methods.map((method) => method.id)).toEqual(["dopamine", "palera1n"]);
  });

  it("does not guess support for an unknown model", () => {
    const result = assessCompatibility({ productType: "iPhone99,1", iosVersion: "26.0" });

    expect(result.advancedStatus).toBe("unknown");
    expect(result.basicStatus).toBe("supported");
  });

  it("maps the product generation to its chip family", () => {
    expect(chipForProductType("iPhone12,1")).toBe("A13");
    expect(chipForProductType("iPad13,1")).toBeUndefined();
  });
});
