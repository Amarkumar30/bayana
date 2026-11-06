// Run with: pnpm.cmd --filter @bayana/web test:unit. The production build must refuse placeholder business details.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { assertBusinessDetailsReady, businessDetails, businessDetailsPlaceholders, filledDetail } from "./business-details.ts";

const filled = {
  ...businessDetails, legalName: "Example Bookings Private Limited", entityType: "private limited company", address: "1 Example Road, New Delhi, Delhi 110001",
  phone: "+91 11 0000 0000", supportHours: "Monday to Saturday, 10:00 to 18:00 IST", responseTime: "within 2 working days",
  grievanceOfficer: { name: "A. Officer", email: "grievance@bayana.in" }, effectiveDate: "1 December 2026",
  pricing: { proMonthlyInr: "599", freePlatformFeePercent: "2", proPlatformFeePercent: "1" }
};

describe("business details placeholders", () => {
  it("lists every placeholder field by path, including nested ones", () => {
    const missing = businessDetailsPlaceholders(businessDetails);
    for (const path of ["legalName", "address", "grievanceOfficer.name", "effectiveDate", "pricing.proMonthlyInr"]) assert.ok(missing.includes(path), path);
    assert.ok(!missing.includes("tradingName") && !missing.includes("supportEmail") && !missing.includes("gstin"));
    assert.deepEqual(businessDetailsPlaceholders(filled), []);
  });
  it("fails a production build (NODE_ENV=production, APP_ENV=production) while placeholders remain, naming fields only", () => {
    assert.throws(() => assertBusinessDetailsReady({ nodeEnv: "production", appEnv: "production" }), error => /Production build refused/.test(error.message) && /legalName/.test(error.message) && !/\[LEGAL BUSINESS NAME\]/.test(error.message));
  });
  it("lets staging, local and development builds show placeholders", () => {
    for (const appEnv of ["staging", "local", undefined]) assert.doesNotThrow(() => assertBusinessDetailsReady({ nodeEnv: "production", appEnv }));
    assert.doesNotThrow(() => assertBusinessDetailsReady({ nodeEnv: "development", appEnv: "production" }));
  });
  it("the footer helper hides placeholders and keeps filled values", () => {
    assert.equal(filledDetail(businessDetails.legalName), null);
    assert.equal(filledDetail("[REGISTERED ADDRESS, CITY, STATE, PIN CODE]"), null);
    assert.equal(filledDetail(""), null); assert.equal(filledDetail(null), null);
    assert.equal(filledDetail(filled.legalName), "Example Bookings Private Limited");
    assert.equal(filledDetail(businessDetails.supportEmail), "hello@bayana.in");
  });
  it("the footer prints placeholder-prone details only through filledDetail", async () => {
    const footer = await readFile(new URL("../components/layout/site-footer.tsx", import.meta.url), "utf8");
    for (const raw of ["{business.legalName}", "{business.address}", "{business.grievanceOfficer.name}"]) assert.ok(!footer.includes(raw), raw);
    assert.match(footer, /filledDetail\(business\.legalName\)/);
  });
  it("passes a production build once every field is filled", () => {
    assert.doesNotThrow(() => assertBusinessDetailsReady({ nodeEnv: "production", appEnv: "production" }, filled));
  });
  it("next.config.ts runs the check with APP_ENV", async () => {
    const text = await readFile(new URL("../next.config.ts", import.meta.url), "utf8");
    assert.match(text, /assertBusinessDetailsReady\(\{ nodeEnv: process\.env\.NODE_ENV, appEnv: loadServerEnv\(\)\.APP_ENV \}\)/);
  });
});
