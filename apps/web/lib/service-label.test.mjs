// Run with: pnpm.cmd --filter @bayana/web test:unit. How services read, and the service form's live line for daily pricing.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dailyPreview, priceUnit, serviceLength, sessionPreview } from "./service-label.ts";

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
  it("hourly services that allow several sessions read per session, never per hour, with how many can be booked", () => {
    const studio = { booking_mode: "hourly", duration_minutes: 60, min_days: null, max_days: null, min_blocks: 1, max_blocks: 4 };
    assert.equal(serviceLength(studio), "1 to 4 sessions, up to 4 hours");
    assert.equal(priceUnit(studio), "per 1 hour session");
    assert.equal(priceUnit({ ...studio, duration_minutes: 90 }), "per 1 hour 30 min session");
    assert.equal(serviceLength({ ...studio, min_blocks: 2, max_blocks: 2, duration_minutes: 90 }), "2 sessions (3 hours)");
    // One session: exactly what it showed before.
    assert.equal(serviceLength({ ...studio, max_blocks: 1, duration_minutes: 90 }), "90 min");
    assert.equal(priceUnit({ ...studio, max_blocks: 1 }), null);
    for (const value of [serviceLength(studio), priceUnit(studio)]) assert.doesNotMatch(value, /per hour/i);
  });
  it("the form preview for sessions shows the range allowed, a sample of 3 and the advance", () => {
    assert.equal(sessionPreview(150_000, 60, 1, 4, "PERCENT", 30), "Customer can book 1 to 4 sessions of 1 hour. 3 sessions = 3 hours = ₹4,500.00. Advance ₹1,350.00.");
    assert.equal(sessionPreview(150_000, 90, 2, 2, "NONE", 0), "Customer can book exactly 2 sessions of 1 hour 30 min. 2 sessions = 3 hours = ₹3,000.00. Advance ₹0.00.");
    assert.equal(sessionPreview(150_000, 60, 1, 2, "FIXED", 50_000), "Customer can book 1 to 2 sessions of 1 hour. 2 sessions = 2 hours = ₹3,000.00. Advance ₹500.00.");
  });
  it("the session preview shows nothing until the limits make sense", () => {
    assert.equal(sessionPreview(150_000, 60, 3, 2, "PERCENT", 30), null);
    assert.equal(sessionPreview(150_000, 60, 1, 13, "PERCENT", 30), null);
    assert.equal(sessionPreview(150_000, 180, 1, 9, "PERCENT", 30), null);
    assert.equal(sessionPreview(0, 60, 1, 4, "PERCENT", 30), null);
    assert.equal(sessionPreview(150_000, 60, 1, 4, "PERCENT", 150), "Customer can book 1 to 4 sessions of 1 hour. 3 sessions = 3 hours = ₹4,500.00.");
  });
});
