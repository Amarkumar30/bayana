import { describe, expect, it } from "vitest";
import { missingPublishRequirements } from "@bayana/shared";

describe("publish checklist", () => {
  const complete = { slug: "studio-one", hasService: true, hasValidAdvanceRule: true, hasAvailability: false, hasFullDay: true, businessName: "Studio One", description: "Saved description", terms: "Terms", cancellationPolicy: "Cancellation", reschedulingPolicy: "Rescheduling" };
  it("returns precisely every unmet publication requirement", () => {
    expect(missingPublishRequirements({ ...complete, slug: null, hasService: false, hasValidAdvanceRule: false, hasFullDay: false, businessName: "", description: "", terms: "" })).toEqual(["slug", "active_service", "policies", "valid_advance_rules", "availability", "business_name", "description"]);
  });
  it("accepts a complete full-day service business", () => expect(missingPublishRequirements(complete)).toEqual([]));
});
