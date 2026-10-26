// Run with: pnpm.cmd --filter @bayana/web test:unit. How services read, and the service form's live line for daily pricing.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dailyPreview, priceUnit, serviceLength } from "./service-label.ts";

describe("service labels", () => {
  it("hourly services show their length; daily ones the days allowed, priced per day", () => {
    assert.equal(serviceLength({ booking_mode: "hourly", duration_minutes: 90, min_days: null, max_days: null }), "90 min");
    assert.equal(serviceLength({ booking_mode: "daily", duration_minutes: null, min_days: 1, max_days: 1 }), "1 day");
    assert.equal(serviceLength({ booking_mode: "daily", duration_minutes: null, min_days: 2, max_days: 2 }), "2 days");
    assert.equal(serviceLength({ booking_mode: "daily", duration_minutes: null, min_days: 1, max_days: 3 }), "1 to 3 days");
    assert.equal(priceUnit({ booking_mode: "daily" }), "per day");
    assert.equal(priceUnit({ booking_mode: "hourly" }), null);
  });
  it("the live preview reads price per day, a sample total and the advance, all from integer paise", () => {
    assert.equal(dailyPreview(1_200_000, 1, 3, "PERCENT", 25), "Customer pays ₹12,000.00 per day. 2 days = ₹24,000.00. Advance ₹6,000.00.");
    assert.equal(dailyPreview(1_200_000, 1, 1, "FIXED", 300_000), "Customer pays ₹12,000.00 per day. 1 day = ₹12,000.00. Advance ₹3,000.00.");
    assert.equal(dailyPreview(1_200_000, 3, 5, "NONE", 0), "Customer pays ₹12,000.00 per day. 3 days = ₹36,000.00. Advance ₹0.00.");
  });
  it("shows nothing until the days make sense, and leaves out an advance that breaks its rule", () => {
    assert.equal(dailyPreview(1_200_000, 4, 2, "PERCENT", 25), null);
    assert.equal(dailyPreview(1_200_000, 1, 31, "PERCENT", 25), null);
    assert.equal(dailyPreview(0, 1, 2, "PERCENT", 25), null);
    assert.equal(dailyPreview(1_200_000, 1, 2, "PERCENT", 150), "Customer pays ₹12,000.00 per day. 2 days = ₹24,000.00.");
  });
});
