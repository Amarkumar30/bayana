// Run with: pnpm.cmd --filter @bayana/web test:unit. Display rules shared by the booking pages and the dashboard: when a visitor's
// own time is shown, how rupees read on screen, and the one set of booking status words. Fixed instants only (no "today").
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BOOKING_STATUS_LABEL, bookingEventLabel, bookingStatusLabel, formatAmount, formatINR, isSystemReason, sameClockAt, utcOffsetAt } from "@bayana/shared";

const winter = "2026-01-15T06:00:00.000Z", summer = "2026-07-15T06:00:00.000Z";

describe("the visitor's own time", () => {
  it("treats Asia/Calcutta and Asia/Kolkata as one zone, so Indian visitors never see a second, identical time", () => {
    assert.equal(utcOffsetAt("Asia/Calcutta", winter), "GMT+05:30");
    assert.equal(utcOffsetAt("Asia/Kolkata", winter), "GMT+05:30");
    assert.equal(sameClockAt("Asia/Calcutta", "Asia/Kolkata", winter), true);
    assert.equal(sameClockAt("Asia/Calcutta", "Asia/Kolkata", summer), true);
  });
  it("matches other IANA aliases too, by offset rather than by name", () => {
    assert.equal(sameClockAt("US/Eastern", "America/New_York", summer), true);
    assert.equal(sameClockAt("Asia/Katmandu", "Asia/Kathmandu", winter), true);
  });
  it("shows the visitor's time when the clocks really differ, judged at the slot's own instant", () => {
    assert.equal(sameClockAt("Europe/London", "Asia/Kolkata", winter), false);
    // London is on UTC in January and an hour ahead in July.
    assert.equal(sameClockAt("Europe/London", "UTC", winter), true);
    assert.equal(sameClockAt("Europe/London", "UTC", summer), false);
  });
});

describe("rupees on screen", () => {
  it("drops empty paise and keeps Indian grouping", () => {
    assert.equal(formatAmount(800_000), "₹8,000");
    assert.equal(formatAmount(15_000_000), "₹1,50,000");
    assert.equal(formatAmount(0), "₹0");
  });
  it("shows paise when there are some, so an amount is never rounded", () => {
    assert.equal(formatAmount(800_050), "₹8,000.50");
    assert.equal(formatAmount(1), "₹0.01");
  });
  it("leaves formatINR (receipts, contracts, emails) at two decimals", () => {
    assert.equal(formatINR(800_000), "₹8,000.00");
  });
});

describe("booking status words", () => {
  it("names every state the same way everywhere, in any case", () => {
    assert.deepEqual(Object.keys(BOOKING_STATUS_LABEL), ["HELD", "PENDING", "CONFIRMED", "COMPLETED", "CANCELLED", "EXPIRED", "EXPIRED_PAID"]);
    assert.equal(bookingStatusLabel("PENDING"), "Awaiting advance");
    assert.equal(bookingStatusLabel("pending"), "Awaiting advance");
    assert.equal(bookingStatusLabel("EXPIRED_PAID"), "Paid after expiry");
  });
  it("shows an unknown status as it is, including names that exist on every object", () => {
    assert.equal(bookingStatusLabel("ON_HOLD_SOMEHOW"), "ON_HOLD_SOMEHOW");
    assert.equal(bookingStatusLabel("constructor"), "constructor");
  });
  it("turns the system's event reasons into sentences and keeps reasons people typed", () => {
    assert.equal(bookingEventLabel({ to_status: "CONFIRMED", reason: "offline advance recorded" }), "Confirmed, advance recorded");
    assert.equal(bookingEventLabel({ to_status: "PENDING", reason: "terms accepted, advance to be arranged offline" }), "Terms agreed, advance to be arranged with the business");
    assert.equal(bookingEventLabel({ to_status: "HELD", reason: "slot held" }), "Time held");
    assert.equal(isSystemReason("terms accepted"), true);
    assert.equal(bookingEventLabel({ to_status: "CANCELLED", reason: "Client asked to move to March" }), "Cancelled");
    assert.equal(isSystemReason("Client asked to move to March"), false);
    assert.equal(isSystemReason("offline advance recorded"), true);
    assert.equal(isSystemReason("toString"), false);
    assert.equal(bookingEventLabel({ to_status: "EXPIRED" }), "Hold expired, time released");
  });
});
