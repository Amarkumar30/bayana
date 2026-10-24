import { describe, expect, it } from "vitest";
import { advancePaise, advanceRuleProblem, cancellationTiersSchema, overrideSchema, renderTerms, serviceCreateSchema, termsTemplateProblems, weeklyScheduleSchema } from "@bayana/shared";

const service = { name: "Portrait session", price_paise: 800_000, duration_minutes: 90, advance_type: "PERCENT" as const, advance_value: 25 };

describe("advance rule (SV-02)", () => {
  it("rounds percentages half up in integer paise", () => {
    expect(advancePaise(101, "PERCENT", 50)).toBe(51); // 50.5 -> 51
    expect(advancePaise(99, "PERCENT", 50)).toBe(50); // 49.5 -> 50
    expect(advancePaise(333, "PERCENT", 33)).toBe(110); // 109.89 -> 110
    expect(advancePaise(800_000, "PERCENT", 25)).toBe(200_000);
  });
  it("never exceeds the price and rejects 120 percent", () => {
    expect(advancePaise(999, "PERCENT", 100)).toBe(999);
    expect(serviceCreateSchema.safeParse({ ...service, advance_value: 120 }).success).toBe(false);
    expect(serviceCreateSchema.safeParse({ ...service, advance_type: "FIXED", advance_value: 800_001 }).success).toBe(false);
    expect(advanceRuleProblem(800_000, "FIXED", 800_001)).toBe("A fixed advance cannot be more than the price.");
    expect(serviceCreateSchema.safeParse({ ...service, advance_type: "FIXED", advance_value: 800_000 }).success).toBe(true);
  });
});

describe("service schema (SV-01)", () => {
  it("rejects zero or negative price and duration, and non-integer paise", () => {
    for (const bad of [{ price_paise: 0 }, { price_paise: -1 }, { price_paise: 10.5 }, { duration_minutes: 0 }, { duration_minutes: -30 }]) expect(serviceCreateSchema.safeParse({ ...service, ...bad }).success).toBe(false);
  });
  it("rejects unknown fields so a client cannot slip in extra values", () => expect(serviceCreateSchema.safeParse({ ...service, vendor_id: "x" }).success).toBe(false));
});

describe("cancellation tiers (SV-03)", () => {
  it("accepts ordered, non-overlapping tiers", () => expect(cancellationTiersSchema.safeParse([{ min_hours_before: 168, refund_percent: 100 }, { min_hours_before: 48, refund_percent: 50 }, { min_hours_before: 0, refund_percent: 0 }]).success).toBe(true));
  it("rejects unordered, duplicate or refund-increasing tiers", () => {
    for (const tiers of [
      [{ min_hours_before: 48, refund_percent: 50 }, { min_hours_before: 168, refund_percent: 100 }],
      [{ min_hours_before: 48, refund_percent: 50 }, { min_hours_before: 48, refund_percent: 20 }],
      [{ min_hours_before: 168, refund_percent: 50 }, { min_hours_before: 48, refund_percent: 80 }],
      [{ min_hours_before: 10, refund_percent: 101 }]
    ]) expect(cancellationTiersSchema.safeParse(tiers).success).toBe(false);
  });
});

describe("terms template (CT-01)", () => {
  it("rejects unknown variables and stray braces", () => {
    expect(termsTemplateProblems("Pay {{advance}} now; balance {{balance}}.")).toEqual([]);
    expect(termsTemplateProblems("Total {{prise}}")[0]).toMatch(/Unknown variable \{\{prise\}\}/);
    expect(termsTemplateProblems("Broken {{advance")).toEqual(["Unmatched {{ or }} found."]);
  });
  it("renders only the allowed variables as plain text", () => {
    const values = { business_name: "Studio", service_name: "Portrait", price: "₹8,000.00", advance: "₹2,000.00", balance: "₹6,000.00", date: "2 Nov 2026", time: "10:00", customer_name: "<b>Ana</b>", cancellation_policy: "Full refund 7 days before" };
    expect(renderTerms("{{customer_name}} pays {{ advance }} to {{business_name}}.", values)).toBe("<b>Ana</b> pays ₹2,000.00 to Studio.");
    expect(() => renderTerms("{{evil}}", values)).toThrow();
  });
});

describe("availability schemas (AV-01, AV-02)", () => {
  it("rejects overlapping or inverted weekly windows", () => {
    expect(weeklyScheduleSchema.safeParse({ windows: [{ weekday: 1, start_time: "09:00", end_time: "12:00" }, { weekday: 1, start_time: "11:00", end_time: "14:00" }] }).success).toBe(false);
    expect(weeklyScheduleSchema.safeParse({ windows: [{ weekday: 1, start_time: "12:00", end_time: "09:00" }] }).success).toBe(false);
    expect(weeklyScheduleSchema.safeParse({ windows: [{ weekday: 1, start_time: "09:00", end_time: "12:00" }, { weekday: 1, start_time: "13:00", end_time: "17:00" }, { weekday: 2, start_time: "09:00", end_time: "12:00" }] }).success).toBe(true);
  });
  it("needs hours for an open override and both ends for a partial block", () => {
    expect(overrideSchema.safeParse({ local_date: "2026-11-02", kind: "open" }).success).toBe(false);
    expect(overrideSchema.safeParse({ local_date: "2026-11-02", kind: "block", start_time: "10:00" }).success).toBe(false);
    expect(overrideSchema.safeParse({ local_date: "2026-11-02", kind: "block" }).success).toBe(true);
  });
});
