import { describe, expect, it } from "vitest";
import { MODERATE_POLICIES, MODERATE_TIERS, advanceRuleProblem, cancellationTiersProblem, missingPublishRequirements, serviceCreateSchema, serviceTemplates, tiersInWords } from "@bayana/shared";

// A template must save on the first try: it goes through the same schema and rules as anything a vendor types.
describe("service templates", () => {
  it.each(serviceTemplates.filter(template => template.pricePaise !== null))("$key passes the server's rules, and its advance is integer paise", template => {
    const body = { name: template.name, description: template.description, price_paise: template.pricePaise, booking_mode: template.mode, advance_type: "PERCENT", advance_value: template.advancePercent, cancellation_tiers: MODERATE_TIERS, terms_template: "", active: true,
      ...(template.mode === "daily" ? { min_days: template.minDays, max_days: template.maxDays, buffer_days: 0 } : { duration_minutes: template.durationMinutes, buffer_before_minutes: 0, buffer_after_minutes: 0, min_blocks: 1, max_blocks: 1 }) };
    const parsed = serviceCreateSchema.safeParse(body);
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
    expect(advanceRuleProblem(template.pricePaise!, "PERCENT", template.advancePercent)).toBeNull();
  });
  it("offers wedding by the day, pre-wedding in 2-hour sessions, an event by the day, and blank", () => {
    expect(Object.fromEntries(serviceTemplates.map(template => [template.key, [template.mode, template.durationMinutes]]))).toEqual({ wedding: ["daily", 60], "pre-wedding": ["hourly", 120], event: ["daily", 60], blank: ["hourly", 60] });
  });
  it("the Moderate rule's words say what its refund tiers do, so a prefilled policy cannot contradict the contract", () => {
    expect(cancellationTiersProblem(MODERATE_TIERS)).toBeNull();
    expect(tiersInWords(MODERATE_TIERS)).toContain("Cancel at least 168 hours before the start: 100% of the advance is refunded.");
    expect(tiersInWords(MODERATE_TIERS)).toContain("Cancel at least 48 hours before the start: 50% of the advance is refunded.");
    expect(MODERATE_POLICIES.cancellation_policy).toContain("Cancel 7 days or more before the start: the advance is refunded in full.");
    expect(MODERATE_POLICIES.cancellation_policy).toContain("Cancel 2 to 7 days before: 50% of the advance is refunded.");
  });
  it("the prefilled policies satisfy the publish check", () => {
    const missing = missingPublishRequirements({ slug: "s", hasService: true, hasValidAdvanceRule: true, hasAvailability: true, businessName: "Studio", description: "Portraits.", terms: MODERATE_POLICIES.terms, cancellationPolicy: MODERATE_POLICIES.cancellation_policy, reschedulingPolicy: MODERATE_POLICIES.rescheduling_policy });
    expect(missing).toEqual([]);
  });
});
