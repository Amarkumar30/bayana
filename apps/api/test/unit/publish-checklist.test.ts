import { describe, expect, it } from "vitest";
import { missingPublishRequirements, onboardingSteps } from "@bayana/shared";

const complete = { slug: "studio-one", hasService: true, hasValidAdvanceRule: true, hasAvailability: true, businessName: "Studio One", description: "Saved description", terms: "Terms", cancellationPolicy: "Cancellation", reschedulingPolicy: "Rescheduling" };
describe("publish checklist", () => {
  it("returns precisely every unmet publication requirement", () => {
    expect(missingPublishRequirements({ ...complete, slug: null, hasService: false, hasValidAdvanceRule: false, hasAvailability: false, businessName: "", description: "", terms: "" })).toEqual(["slug", "active_service", "policies", "valid_advance_rules", "availability", "business_name", "description"]);
  });
  it("accepts a complete business", () => expect(missingPublishRequirements(complete)).toEqual([]));
  it("gives a brand-new vendor exactly three steps, none done", () => {
    expect(onboardingSteps({ ...complete, hasService: false, hasAvailability: false, published: false }).map(step => [step.key, step.done])).toEqual([["service", false], ["availability", false], ["publish", false]]);
  });
});
