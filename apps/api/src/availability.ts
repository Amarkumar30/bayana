import { addLocalDays, localDateTimeToUtc, startOfLocalDay, zonedParts } from "@bayana/shared";

export { localDateTimeToUtc } from "@bayana/shared";
export type LocalInterval = { startTime: string; endTime: string };
export type AvailabilityOverride = { localDate: string; kind: "block" | "open"; startTime: string | null; endTime: string | null };
export type BusyPeriod = { startsAt: string; endsAt: string };
export type SlotEngineInput = {
  timezone: string; serviceDurationMinutes: number; bufferBeforeMinutes: number; bufferAfterMinutes: number; bookingMode: "hourly" | "daily"; slotStepMinutes: number;
  /** Daily services only: the range of days a booking may cover and the free days kept around it. */
  daily?: { minDays: number; maxDays: number; bufferDays: number } | null;
  minimumNoticeMinutes: number; maximumDaysAhead: number; weeklyRules: Map<number, LocalInterval[]>; overrides: AvailabilityOverride[]; blockedPeriods: BusyPeriod[]; activeBookings: BusyPeriod[]; now: Date;
};
export type Slot = { startsAt: string; endsAt: string; occupiedStartsAt: string; occupiedEndsAt: string };

const localKey = (date: Date, timezone: string) => { const p = zonedParts(date, timezone); return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`; };
const minuteOf = (time: string) => { const [hours, minutes] = time.slice(0, 5).split(":").map(Number); return hours * 60 + minutes; };
const dateAtMinute = (date: string, minute: number) => `${date}T${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}:00`;
const overlaps = (start: Date, end: Date, period: BusyPeriod) => start < new Date(period.endsAt) && end > new Date(period.startsAt);
const localWeekday = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();

type Span = [number, number];
const merge = (spans: Span[]) => spans.sort((a, b) => a[0] - b[0]).reduce<Span[]>((out, span) => { const last = out[out.length - 1]; if (last && span[0] <= last[1]) last[1] = Math.max(last[1], span[1]); else out.push([...span]); return out; }, []);
const subtract = (spans: Span[], cut: Span) => spans.flatMap(([start, end]): Span[] => cut[1] <= start || cut[0] >= end ? [[start, end]] : [...(cut[0] > start ? [[start, cut[0]] as Span] : []), ...(cut[1] < end ? [[cut[1], end] as Span] : [])]);

/**
 * Open minutes of a local date: weekly windows, unless a whole-day block clears them; then open overrides are added
 * and partial blocks are cut out. Returned as merged, sorted [startMinute, endMinute) spans.
 */
export function openSpansFor(date: string, input: Pick<SlotEngineInput, "weeklyRules" | "overrides">): Span[] {
  const overrides = input.overrides.filter(item => item.localDate === date);
  const wholeDayBlock = overrides.some(item => item.kind === "block" && !item.startTime);
  let spans: Span[] = wholeDayBlock ? [] : (input.weeklyRules.get(localWeekday(date)) ?? []).map(rule => [minuteOf(rule.startTime), minuteOf(rule.endTime)]);
  spans = merge([...spans, ...overrides.filter(item => item.kind === "open" && item.startTime && item.endTime).map((item): Span => [minuteOf(item.startTime!), minuteOf(item.endTime!)])]);
  for (const block of overrides.filter(item => item.kind === "block" && item.startTime && item.endTime)) spans = subtract(spans, [minuteOf(block.startTime!), minuteOf(block.endTime!)]);
  return spans;
}

/** Pure: every bookable slot on a local date, sorted, unique, inside open spans, outside busy periods, honouring notice and window. */
export function slotsForDate(date: string, input: SlotEngineInput): Slot[] {
  const today = localKey(input.now, input.timezone); const lastDate = new Date(`${today}T12:00:00Z`); lastDate.setUTCDate(lastDate.getUTCDate() + input.maximumDaysAhead);
  if (date < today || date > lastDate.toISOString().slice(0, 10)) return [];
  const busy = [...input.blockedPeriods, ...input.activeBookings];
  const noticeAfter = new Date(input.now.getTime() + input.minimumNoticeMinutes * 60_000);
  const spans = openSpansFor(date, input);
  // Daily services have no time slots: they are booked by whole local days (dayStatus, dailyRange).
  if (input.bookingMode === "daily") return [];
  const slots: Slot[] = [];
  for (const [start, end] of spans) {
    for (let minute = start; minute + input.serviceDurationMinutes <= end; minute += input.slotStepMinutes) {
      const startsAt = localDateTimeToUtc(dateAtMinute(date, minute), input.timezone); if (!startsAt) continue;
      const endsAt = new Date(startsAt.getTime() + input.serviceDurationMinutes * 60_000);
      const occupiedStartsAt = new Date(startsAt.getTime() - input.bufferBeforeMinutes * 60_000); const occupiedEndsAt = new Date(endsAt.getTime() + input.bufferAfterMinutes * 60_000);
      if (startsAt < noticeAfter || busy.some(period => overlaps(occupiedStartsAt, occupiedEndsAt, period))) continue;
      slots.push({ startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), occupiedStartsAt: occupiedStartsAt.toISOString(), occupiedEndsAt: occupiedEndsAt.toISOString() });
    }
  }
  // Spans are merged and ascending, but a DST fall-back can map two local minutes to one instant: keep output sorted and unique.
  return slots.filter((slot, index) => slots.findIndex(other => other.startsAt === slot.startsAt) === index).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}
export function monthSummary(month: string, input: SlotEngineInput) {
  const first = `${month}-01`, result: { date: string; available: boolean }[] = [];
  for (let date = first; date.startsWith(month); date = addLocalDays(date, 1)) result.push({ date, available: input.bookingMode === "daily" ? maxDaysFrom(date, input) >= (input.daily?.minDays ?? 1) : slotsForDate(date, input).length > 0 });
  return result;
}

// ---- Daily services (SPEC 8.1, 8.2) ----------------------------------------------------------------------------------
// A local date is "open" when the vendor has any opening hours on it (weekly windows plus overrides; a whole-day blocked
// date has none) and no time off touches it: time off closes the whole day. It is "booked" when any active booking or
// unexpired hold (of any service, with its buffers) touches it. Dates before today, or starting inside the minimum notice,
// are "past"; dates beyond the booking window are "closed".
export type DayStatus = "available" | "booked" | "closed" | "past";
const busyIn = (start: Date, end: Date, periods: BusyPeriod[]) => periods.some(period => overlaps(start, end, period));

export function dayStatus(date: string, input: SlotEngineInput): DayStatus {
  const today = localKey(input.now, input.timezone);
  if (date < today) return "past";
  const start = startOfLocalDay(date, input.timezone), end = startOfLocalDay(addLocalDays(date, 1), input.timezone);
  if (start < new Date(input.now.getTime() + input.minimumNoticeMinutes * 60_000)) return "past";
  if (date > addLocalDays(today, input.maximumDaysAhead)) return "closed";
  if (!openSpansFor(date, input).length || busyIn(start, end, input.blockedPeriods)) return "closed";
  return busyIn(start, end, input.activeBookings) ? "booked" : "available";
}

/** Where a daily booking of `days` days from `date` would sit, buffer days included; null unless every day is available and the buffers are free of bookings. */
export function dailyRange(date: string, days: number, input: SlotEngineInput) {
  const rules = input.daily;
  if (!rules || days < rules.minDays || days > rules.maxDays) return null;
  for (let index = 0; index < days; index++) if (dayStatus(addLocalDays(date, index), input) !== "available") return null;
  const startsAt = startOfLocalDay(date, input.timezone), endsAt = startOfLocalDay(addLocalDays(date, days), input.timezone);
  const blockStart = startOfLocalDay(addLocalDays(date, -rules.bufferDays), input.timezone), blockEnd = startOfLocalDay(addLocalDays(date, days + rules.bufferDays), input.timezone);
  // Buffer days need not be open days, but no other booking may sit in them.
  if (busyIn(blockStart, startsAt, input.activeBookings) || busyIn(endsAt, blockEnd, input.activeBookings)) return null;
  return { startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), occupiedStartsAt: blockStart.toISOString(), occupiedEndsAt: blockEnd.toISOString() };
}

/** The longest booking (up to the service's maximum) that can start on `date`; 0 when it cannot start there at all. */
export function maxDaysFrom(date: string, input: SlotEngineInput) {
  const rules = input.daily; if (!rules) return 0;
  for (let days = rules.maxDays; days >= rules.minDays; days--) if (dailyRange(date, days, input)) return days;
  return 0;
}

/** Per-date status and the longest booking that can start there, for `from`..`to` inclusive (at most 62 days). */
export function dayCalendar(from: string, to: string, input: SlotEngineInput) {
  const result: { date: string; status: DayStatus; max_days: number }[] = [];
  for (let date = from; date <= to && result.length < 62; date = addLocalDays(date, 1)) {
    const status = dayStatus(date, input);
    result.push({ date, status, max_days: status === "available" ? maxDaysFrom(date, input) : 0 });
  }
  return result;
}
