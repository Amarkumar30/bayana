import { describe, expect, it } from "vitest";
import { paiseFromRupees, percentageOf } from "@bayana/shared";
describe("money primitives", () => { it("parses rupees without floats",()=>expect(paiseFromRupees("1234.50")).toBe(123450)); it("rounds halves up",()=>expect(percentageOf(101,50)).toBe(51)); it("never exceeds total at 100 percent",()=>expect(percentageOf(999999,100)).toBe(999999)); });
