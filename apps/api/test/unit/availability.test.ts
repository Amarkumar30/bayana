import { describe, expect, it } from "vitest";
import { localDateTimeToUtc, slotsForDate, type SlotEngineInput } from "../../src/availability.js";

const input = (timezone = "Asia/Kolkata"): SlotEngineInput => ({
  timezone, serviceDurationMinutes: 60, bufferBeforeMinutes: 15, bufferAfterMinutes: 15, bookingMode: "TIMED", slotStepMinutes: 30, minimumNoticeHours: 0, maximumDaysAhead: 30,
  weeklyRules: new Map(Array.from({ length: 7 }, (_, weekday) => [weekday, [{ startTime: "09:00", endTime: "12:00" }]])), exceptions: [], blockedPeriods: [], activeBookings: [], now: new Date("2026-03-01T00:00:00Z")
});
describe("slot engine", () => {
  it("respects buffers and blocked periods", () => { const value = input(); value.activeBookings = [{ startsAt: "2026-03-02T04:30:00Z", endsAt: "2026-03-02T05:30:00Z" }]; expect(slotsForDate("2026-03-02", value).map(slot => slot.startsAt)).not.toContain("2026-03-02T04:00:00.000Z"); });
  it("skips spring-forward missing local time and resolves fall-back", () => { expect(localDateTimeToUtc("2026-03-08T02:30:00", "America/New_York")).toBeNull(); expect(localDateTimeToUtc("2026-11-01T01:30:00", "America/New_York")?.toISOString()).toContain("2026-11-01T"); });
  it("enforces minimum notice", () => { const value = input(); value.now = new Date("2026-03-02T03:45:00Z"); value.minimumNoticeHours = 2; expect(slotsForDate("2026-03-02", value)).toEqual([]); });
  it("makes DST-safe full-day intervals and requires local availability", () => { const value = input("America/New_York"); value.bookingMode = "FULL_DAY"; value.now = new Date("2026-03-01T00:00:00Z"); const spring = slotsForDate("2026-03-08", value)[0]; const fall = slotsForDate("2026-11-01", { ...value, maximumDaysAhead: 300 })[0]; expect(new Date(spring.endsAt).getTime() - new Date(spring.startsAt).getTime()).toBe(23 * 60 * 60 * 1000); expect(new Date(fall.endsAt).getTime() - new Date(fall.startsAt).getTime()).toBe(25 * 60 * 60 * 1000); value.weeklyRules.clear(); expect(slotsForDate("2026-03-08", value)).toEqual([]); });
  it("rejects slots whose buffers overlap a booking even when service times do not", () => { const value = input(); value.activeBookings = [{ startsAt: "2026-03-02T04:45:00Z", endsAt: "2026-03-02T05:45:00Z" }]; expect(slotsForDate("2026-03-02", value).map(slot => slot.startsAt)).not.toContain("2026-03-02T04:00:00.000Z"); });
});
