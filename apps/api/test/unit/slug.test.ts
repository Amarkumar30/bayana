import { describe, expect, it } from "vitest";
import { RESERVED_SLUGS, isValidSlug } from "@bayana/shared";

describe("vendor slugs", () => {
  it("accepts the required lowercase 3-to-30 character form", () => {
    expect(isValidSlug("abc")).toBe(true);
    expect(isValidSlug("a".repeat(30))).toBe(true);
    expect(isValidSlug("best-service-2")).toBe(true);
  });
  it("rejects malformed, uppercase, and reserved slugs", () => {
    for (const value of ["ab", "a".repeat(31), "-vendor", "vendor-", "Vendor", "vendor_name", ...RESERVED_SLUGS]) expect(isValidSlug(value)).toBe(false);
  });
});
