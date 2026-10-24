import { describe, expect, it } from "vitest";
import { advancePaise, paiseFromRupees } from "@bayana/shared";

describe("advance and money rules", () => {
  it("uses round-half-up percentage arithmetic and never exceeds total", () => {
    expect(advancePaise(101, "PERCENT", 50)).toBe(51);
    expect(advancePaise(999, "PERCENT", 100)).toBe(999);
    expect(() => advancePaise(100, "FIXED", 101)).toThrow("Invalid advance rule");
  });
  it("parses rupees exactly and rejects excess decimal places", () => {
    expect(paiseFromRupees("12.30")).toBe(1230);
    expect(() => paiseFromRupees("12.301")).toThrow("Invalid rupee amount");
  });
});
