// Run with: pnpm.cmd --filter @bayana/web test:unit. The daily day picker's rules: which dates can start a booking, and for how long.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dayChoices, dayLegend, dayReason } from "./days.ts";

const day = (status, max_days = 0) => ({ date: "2026-11-12", status, max_days });

describe("daily day picker", () => {
  it("gives every unavailable date a visible reason", () => {
    assert.equal(dayReason(day("booked"), 1), "Already booked");
    assert.equal(dayReason(day("closed"), 1), "Closed");
    assert.equal(dayReason(day("past"), 1), "No longer bookable");
    assert.equal(dayReason(undefined, 1), "Not open for booking");
    assert.deepEqual(dayLegend.map(item => item.status), ["booked", "closed", "past"]);
  });
  it("a free date with too few free days after it cannot start a booking", () => {
    assert.equal(dayReason(day("available", 1), 2), "Fewer than 2 free days in a row from here");
    assert.equal(dayReason(day("available", 0), 1), "Not free");
    assert.equal(dayReason(day("available", 3), 2), null);
  });
  it("offers only the numbers of days that are actually free, from the service's minimum", () => {
    assert.deepEqual(dayChoices(day("available", 3), 1), [1, 2, 3]);
    assert.deepEqual(dayChoices(day("available", 4), 2), [2, 3, 4]);
    assert.deepEqual(dayChoices(day("available", 1), 2), []);
    assert.deepEqual(dayChoices(day("booked", 0), 1), []);
  });
});
