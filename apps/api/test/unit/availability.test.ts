import { describe, expect, it } from "vitest";
import { localDateTimeToUtc, openSpansFor, slotsForDate, type SlotEngineInput } from "../../src/availability.js";

const input = (timezone = "Asia/Kolkata"): SlotEngineInput => ({
  timezone, serviceDurationMinutes: 60, bufferBeforeMinutes: 15, bufferAfterMinutes: 15, bookingMode: "TIMED", slotStepMinutes: 30, minimumNoticeMinutes: 0, maximumDaysAhead: 30,
  weeklyRules: new Map(Array.from({ length: 7 }, (_, weekday) => [weekday, [{ startTime: "09:00", endTime: "12:00" }]])), overrides: [], blockedPeriods: [], activeBookings: [], now: new Date("2026-03-01T00:00:00Z")
});
const starts = (date: string, value: SlotEngineInput) => slotsForDate(date, value).map(slot => slot.startsAt);

describe("slot engine", () => {
  it("respects buffers and busy periods", () => { const value = input(); value.activeBookings = [{ startsAt: "2026-03-02T04:30:00Z", endsAt: "2026-03-02T05:30:00Z" }]; expect(starts("2026-03-02", value)).not.toContain("2026-03-02T04:00:00.000Z"); });
  it("rejects slots whose buffers overlap a booking even when service times do not", () => { const value = input(); value.activeBookings = [{ startsAt: "2026-03-02T04:45:00Z", endsAt: "2026-03-02T05:45:00Z" }]; expect(starts("2026-03-02", value)).not.toContain("2026-03-02T04:00:00.000Z"); });
  it("skips spring-forward missing local time and resolves fall-back to the earlier instant", () => {
    expect(localDateTimeToUtc("2026-03-08T02:30:00", "America/New_York")).toBeNull();
    expect(localDateTimeToUtc("2026-11-01T01:30:00", "America/New_York")?.toISOString()).toBe("2026-11-01T05:30:00.000Z");
  });
  it("enforces minimum notice in minutes", () => {
    const value = input(); value.now = new Date("2026-03-02T03:00:00Z"); // 08:30 IST
    value.minimumNoticeMinutes = 90; // nothing before 10:00 IST
    expect(starts("2026-03-02", value)[0]).toBe("2026-03-02T04:30:00.000Z");
  });
  it("enforces the maximum booking window", () => { const value = input(); value.maximumDaysAhead = 5; expect(starts("2026-03-06", value).length).toBeGreaterThan(0); expect(starts("2026-03-07", value)).toEqual([]); });
  it("makes DST-safe full-day intervals and requires local availability", () => {
    const value = input("America/New_York"); value.bookingMode = "FULL_DAY";
    const spring = slotsForDate("2026-03-08", value)[0]; const fall = slotsForDate("2026-11-01", { ...value, maximumDaysAhead: 300 })[0];
    expect(new Date(spring.endsAt).getTime() - new Date(spring.startsAt).getTime()).toBe(23 * 3_600_000);
    expect(new Date(fall.endsAt).getTime() - new Date(fall.startsAt).getTime()).toBe(25 * 3_600_000);
    value.weeklyRules.clear(); expect(slotsForDate("2026-03-08", value)).toEqual([]);
  });
});

describe("date overrides beat weekly rules", () => {
  it("a whole-day block closes the day", () => { const value = input(); value.overrides = [{ localDate: "2026-03-02", kind: "block", startTime: null, endTime: null }]; expect(starts("2026-03-02", value)).toEqual([]); expect(starts("2026-03-03", value).length).toBeGreaterThan(0); });
  it("an open override adds hours to the weekly windows", () => { const value = input(); value.overrides = [{ localDate: "2026-03-02", kind: "open", startTime: "14:00", endTime: "16:00" }]; expect(openSpansFor("2026-03-02", value)).toEqual([[540, 720], [840, 960]]); });
  it("block + open replaces the day's hours", () => { const value = input(); value.overrides = [{ localDate: "2026-03-02", kind: "block", startTime: null, endTime: null }, { localDate: "2026-03-02", kind: "open", startTime: "18:00", endTime: "20:00" }]; expect(openSpansFor("2026-03-02", value)).toEqual([[1080, 1200]]); });
  it("a partial block cuts a hole in the day", () => { const value = input(); value.overrides = [{ localDate: "2026-03-02", kind: "block", startTime: "10:00", endTime: "11:00" }]; expect(openSpansFor("2026-03-02", value)).toEqual([[540, 600], [660, 720]]); });
});

// Property tests: deterministic pseudo-random inputs (seeded) so failures are reproducible.
function rng(seed: number) { return () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; }; }
const timezones = ["Asia/Kolkata", "Europe/London", "America/New_York"];
const dstDates = { "Europe/London": ["2026-03-29", "2026-10-25"], "America/New_York": ["2026-03-08", "2026-11-01"], "Asia/Kolkata": ["2026-03-29", "2026-11-01"] } as Record<string, string[]>;

describe("slot engine properties", () => {
  it("slots are sorted, unique, inside open windows, non-overlapping with busy time, and after notice", () => {
    const random = rng(42);
    for (let run = 0; run < 300; run++) {
      const timezone = timezones[run % timezones.length];
      const value = input(timezone);
      value.serviceDurationMinutes = [15, 30, 45, 60, 90, 120][Math.floor(random() * 6)];
      value.bufferBeforeMinutes = Math.floor(random() * 4) * 10; value.bufferAfterMinutes = Math.floor(random() * 4) * 10;
      value.slotStepMinutes = [15, 30, 60][Math.floor(random() * 3)];
      value.minimumNoticeMinutes = Math.floor(random() * 600);
      value.maximumDaysAhead = 300;
      const windows = Array.from({ length: 1 + Math.floor(random() * 3) }, () => { const start = Math.floor(random() * 20) * 60; return { startTime: `${String(start / 60).padStart(2, "0")}:00`, endTime: `${String(Math.min(24 * 60 - 60, start + 60 + Math.floor(random() * 6) * 60) / 60).padStart(2, "0")}:00` }; });
      value.weeklyRules = new Map(Array.from({ length: 7 }, (_, weekday) => [weekday, windows]));
      const date = random() < 0.5 ? dstDates[timezone][Math.floor(random() * 2)] : `2026-0${4 + Math.floor(random() * 5)}-1${Math.floor(random() * 9)}`;
      const busyStart = new Date(`${date}T00:00:00Z`).getTime() + Math.floor(random() * 48) * 30 * 60_000;
      value.activeBookings = [{ startsAt: new Date(busyStart).toISOString(), endsAt: new Date(busyStart + (1 + Math.floor(random() * 4)) * 30 * 60_000).toISOString() }];
      const slots = slotsForDate(date, value);
      const startTimes = slots.map(slot => slot.startsAt);
      expect([...startTimes].sort()).toEqual(startTimes);
      expect(new Set(startTimes).size).toBe(startTimes.length);
      const spans = openSpansFor(date, value);
      for (const slot of slots) {
        const startsAt = new Date(slot.startsAt), endsAt = new Date(slot.endsAt);
        expect(endsAt.getTime() - startsAt.getTime()).toBe(value.serviceDurationMinutes * 60_000);
        expect(startsAt.getTime()).toBeGreaterThanOrEqual(value.now.getTime() + value.minimumNoticeMinutes * 60_000);
        expect(new Date(slot.occupiedStartsAt).getTime()).toBe(startsAt.getTime() - value.bufferBeforeMinutes * 60_000);
        for (const busy of value.activeBookings) expect(new Date(slot.occupiedStartsAt) < new Date(busy.endsAt) && new Date(slot.occupiedEndsAt) > new Date(busy.startsAt)).toBe(false);
        // The local start minute must lie inside an open span with the whole service fitting before its end.
        const local = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(startsAt).split(":").map(Number);
        const minute = local[0] * 60 + local[1];
        expect(spans.some(([start, end]) => minute >= start && minute + value.serviceDurationMinutes <= end)).toBe(true);
      }
    }
  }, 30_000);
  it("never offers a slot in a spring-forward gap, in any supported timezone", () => {
    for (const [timezone, date] of [["Europe/London", "2026-03-29"], ["America/New_York", "2026-03-08"]]) {
      const value = input(timezone); value.maximumDaysAhead = 300; value.weeklyRules = new Map(Array.from({ length: 7 }, (_, weekday) => [weekday, [{ startTime: "00:00", endTime: "06:00" }]]));
      value.serviceDurationMinutes = 30; value.bufferBeforeMinutes = 0; value.bufferAfterMinutes = 0;
      const local = slotsForDate(date, value).map(slot => new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(slot.startsAt)));
      expect(local).not.toContain(timezone === "Europe/London" ? "01:30" : "02:30");
      expect(local).not.toContain(timezone === "Europe/London" ? "01:00" : "02:00");
    }
  });
  it("Asia/Kolkata has no DST: every day has the same slot count", () => {
    const value = input("Asia/Kolkata"); value.maximumDaysAhead = 300;
    const counts = ["2026-03-29", "2026-06-15", "2026-10-25", "2026-11-01"].map(date => slotsForDate(date, value).length);
    expect(new Set(counts).size).toBe(1);
  });
});
