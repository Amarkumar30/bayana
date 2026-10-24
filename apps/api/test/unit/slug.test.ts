import { describe, expect, it } from "vitest";
import { RESERVED_SLUGS, isValidSlug, slugProblem, suggestSlug } from "@bayana/shared";

describe("vendor slugs (VN-02)", () => {
  it("accepts lowercase 3-to-40 character addresses with single hyphens", () => {
    for (const value of ["abc", "a".repeat(40), "best-service-2", "studio-sunday-mumbai"]) expect(isValidSlug(value)).toBe(true);
  });
  it("rejects malformed, uppercase, double-hyphen and reserved slugs", () => {
    for (const value of ["ab", "a".repeat(41), "-vendor", "vendor-", "Vendor", "vendor_name", "my--studio", "studio sunday", ...RESERVED_SLUGS]) expect(isValidSlug(value)).toBe(false);
  });
  it("reserves every route the web app owns", () => {
    for (const route of ["admin", "api", "login", "signup", "forgot", "onboarding", "dashboard", "booking", "b", "design", "waking", "pricing", "about", "privacy", "terms", "refunds", "my-bookings"]) expect(RESERVED_SLUGS.has(route)).toBe(true);
  });
  it("explains the problem in words", () => {
    expect(slugProblem("ab")).toBe("Use 3 to 40 characters.");
    expect(slugProblem("Studio")).toBe("Use lowercase letters only.");
    expect(slugProblem("login")).toBe("That address is reserved. Try another.");
  });
  it("suggests an address from a business name", () => expect(suggestSlug("Studio Sunday! Mumbai")).toBe("studio-sunday-mumbai"));
});
