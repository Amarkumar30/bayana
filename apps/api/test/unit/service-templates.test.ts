import { describe, expect, it } from "vitest";
import { advanceRuleProblem, cancellationPresets, cancellationTiersProblem, defaultPreset, missingPublishRequirements, presetForTiers, refundPreview, serviceCreateSchema, serviceTemplates, tiersInWords } from "@bayana/shared";

// A template must save on the first try: it goes through the same schema and rules as anything a vendor types.
describe("service templates", () => {
  it.each(serviceTemplates.filter(template => template.pricePaise !== null))("$key passes the server's rules, and its advance is integer paise", template => {
    const body = { name: template.name, description: template.description, price_paise: template.pricePaise, booking_mode: template.mode, advance_type: "PERCENT", advance_value: template.advancePercent, cancellation_tiers: defaultPreset.tiers, terms_template: "", active: true,
      ...(template.mode === "daily" ? { min_days: template.minDays, max_days: template.maxDays, buffer_days: 0 } : { duration_minutes: template.durationMinutes, buffer_before_minutes: 0, buffer_after_minutes: 0, min_blocks: 1, max_blocks: 1 }) };
    const parsed = serviceCreateSchema.safeParse(body);
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
    expect(advanceRuleProblem(template.pricePaise!, "PERCENT", template.advancePercent)).toBeNull();
  });
  it("offers wedding by the day, pre-wedding in 2-hour sessions, an event by the day, and blank", () => {
    expect(Object.fromEntries(serviceTemplates.map(template => [template.key, [template.mode, template.durationMinutes]]))).toEqual({ wedding: ["daily", 60], "pre-wedding": ["hourly", 120], event: ["daily", 60], blank: ["hourly", 60] });
  });
  it("every template's price is marked as an example", () => {
    for (const template of serviceTemplates.filter(item => item.pricePaise !== null)) expect(template.hint).toContain("Example price");
  });
  // A fixed start date, and "now" a whole number of days before it: never today's date.
  const start = new Date("2030-06-15T04:30:00.000Z");
  const refundAt = (key: string, daysBefore: number) => refundPreview(10_000, cancellationPresets.find(preset => preset.key === key)!.tiers, start, new Date(start.getTime() - daysBefore * 86_400_000)).refund_percent;
  it.each([
    ["flexible", 31, 100], ["flexible", 30, 100], ["flexible", 29, 50], ["flexible", 15, 50], ["flexible", 14, 0], ["flexible", 0, 0],
    ["moderate", 31, 50], ["moderate", 30, 50], ["moderate", 29, 25], ["moderate", 15, 25], ["moderate", 14, 0], ["moderate", 0, 0],
    ["strict", 60, 0], ["strict", 30, 0], ["strict", 1, 0]
  ])("%s, %i days before: %i%% of the advance", (key, daysBefore, percent) => { expect(refundAt(key, daysBefore)).toBe(percent); });
  it("templates default to Moderate, and each preset's tiers are valid and found again from the service", () => {
    expect(defaultPreset.key).toBe("moderate");
    for (const preset of cancellationPresets) { expect(cancellationTiersProblem(preset.tiers)).toBeNull(); expect(presetForTiers(preset.tiers)?.key).toBe(preset.key); }
    expect(presetForTiers([{ min_hours_before: 48, refund_percent: 50 }])).toBeUndefined();
  });
  it("each preset's words say what its tiers do, so a prefilled policy cannot contradict the contract", () => {
    expect(tiersInWords(cancellationPresets[0].tiers)).toBe("Cancel at least 30 days before the start: 100% of the advance is refunded. Cancel at least 15 days before the start: 50% of the advance is refunded. Later than 15 days before the start: no refund.");
    expect(tiersInWords(cancellationPresets[1].tiers)).toBe("Cancel at least 30 days before the start: 50% of the advance is refunded. Cancel at least 15 days before the start: 25% of the advance is refunded. Later than 15 days before the start: no refund.");
    expect(tiersInWords(cancellationPresets[2].tiers)).toBe("The advance is not refundable.");
    expect(cancellationPresets[0].policies.cancellation_policy).toBe("Cancel 30 days or more before the first booked day: the advance is refunded in full. Cancel 15 to 29 days before: 50% of the advance is refunded. Cancel less than 15 days before: the advance is not refunded.");
    expect(cancellationPresets[1].policies.cancellation_policy).toBe("Cancel 30 days or more before the first booked day: 50% of the advance is refunded. Cancel 15 to 29 days before: 25% of the advance is refunded. Cancel less than 15 days before: the advance is not refunded.");
    expect(cancellationPresets[2].policies).toMatchObject({ cancellation_policy: "The advance is not refunded if you cancel.", rescheduling_policy: "You can change your date once, if the new date is free." });
  });
  it("shorter notice still reads in hours, so existing services' contracts do not change", () => {
    expect(tiersInWords([{ min_hours_before: 168, refund_percent: 100 }, { min_hours_before: 48, refund_percent: 50 }])).toBe("Cancel at least 168 hours before the start: 100% of the advance is refunded. Cancel at least 48 hours before the start: 50% of the advance is refunded. Later than 48 hours before the start: no refund.");
  });
  it("the prefilled policies satisfy the publish check", () => {
    for (const { policies } of cancellationPresets) expect(missingPublishRequirements({ slug: "s", hasService: true, hasValidAdvanceRule: true, hasAvailability: true, businessName: "Studio", description: "Portraits.", terms: policies.terms, cancellationPolicy: policies.cancellation_policy, reschedulingPolicy: policies.rescheduling_policy })).toEqual([]);
  });
});
