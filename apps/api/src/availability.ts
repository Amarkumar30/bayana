import { addLocalDays, localDateTimeToUtc, startOfLocalDay, zonedParts } from "@bayana/shared";

export { localDateTimeToUtc } from "@bayana/shared";
export type LocalInterval = { startTime: string; endTime: string };
export type AvailabilityOverride = { localDate: string; kind: "block" | "open"; startTime: string | null; endTime: string | null };
export type BusyPeriod = { startsAt: string; endsAt: string };
export type SlotEngineInput = {
  timezone: string; serviceDurationMinutes: number; bufferBeforeMinutes: number; bufferAfterMinutes: number; bookingMode: "hourly" | "daily"; slotStepMinutes: number;
  /** Daily services only: the range of days a booking may cover and the free days kept around it. */
  daily?: { minDays: number; maxDays: number; bufferDays: number } | null;
  /** Hourly services: how many consecutive sessions of serviceDurationMinutes one booking may cover (absent: exactly one). */
  blocks?: { minBlocks: number; maxBlocks: number } | null;
  minimumNoticeMinutes: number; maximumDaysAhead: number; weeklyRules: Map<number, LocalInterval[]>; overrides: AvailabilityOverride[]; blockedPeriods: BusyPeriod[]; activeBookings: BusyPeriod[]; now: Date;
};
/** A bookable start. endsAt/occupied* describe the shortest booking from it (min_blocks sessions); maxBlocks is the longest. */
export type Slot = { startsAt: string; endsAt: string; occupiedStartsAt: string; occupiedEndsAt: string; maxBlocks: number };
type Range = Omit<Slot, "maxBlocks">;

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

/** Minutes since local midnight of an instant on `date` (1440 when it is the next local midnight); null on any other date. */
function localMinuteOn(date: string, instant: Date, timezone: string) {
  const p = zonedParts(instant, timezone), key = `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
  if (key === date) return p.hour * 60 + p.minute;
  return key === addLocalDays(date, 1) && p.hour === 0 && p.minute === 0 ? 1440 : null;
}

type Start = { startsAt: Date; minute: number; spanEnd: number };
type DayContext = { date: string; input: SlotEngineInput; busy: BusyPeriod[]; noticeAfter: Date };
/** Grid starts inside the open spans of a local date (null when the date is outside the booking window or the service is daily). */
function dayStarts(date: string, input: SlotEngineInput): { starts: Start[]; context: DayContext } | null {
  const today = localKey(input.now, input.timezone); const lastDate = new Date(`${today}T12:00:00Z`); lastDate.setUTCDate(lastDate.getUTCDate() + input.maximumDaysAhead);
  if (date < today || date > lastDate.toISOString().slice(0, 10)) return null;
  // Daily services have no time slots: they are booked by whole local days (dayStatus, dailyRange).
  if (input.bookingMode === "daily") return null;
  const starts: Start[] = [];
  for (const [start, end] of openSpansFor(date, input)) {
    for (let minute = start; minute + input.serviceDurationMinutes <= end; minute += input.slotStepMinutes) {
      const startsAt = localDateTimeToUtc(dateAtMinute(date, minute), input.timezone); if (startsAt) starts.push({ startsAt, minute, spanEnd: end });
    }
  }
  return { starts, context: { date, input, busy: [...input.blockedPeriods, ...input.activeBookings], noticeAfter: new Date(input.now.getTime() + input.minimumNoticeMinutes * 60_000) } };
}

/**
 * Where `blocks` consecutive sessions from a start would sit, buffers applied once around the whole range; null unless every
 * session is inside the same open span (so no break, blocked hours or closing time inside it), the range stays on the local
 * date (never past local midnight), the start is after the minimum notice, and nothing busy touches the buffered range.
 */
function rangeFrom(start: Start, blocks: number, { date, input, busy, noticeAfter }: DayContext): Range | null {
  const minutes = blocks * input.serviceDurationMinutes;
  if (start.minute + minutes > start.spanEnd || start.startsAt < noticeAfter) return null;
  const endsAt = new Date(start.startsAt.getTime() + minutes * 60_000);
  // Across a clock change the wall-clock end differs from start + minutes: check where the real end falls, too.
  const endMinute = localMinuteOn(date, endsAt, input.timezone);
  if (endMinute === null || endMinute > start.spanEnd) return null;
  const occupiedStartsAt = new Date(start.startsAt.getTime() - input.bufferBeforeMinutes * 60_000), occupiedEndsAt = new Date(endsAt.getTime() + input.bufferAfterMinutes * 60_000);
  if (busy.some(period => overlaps(occupiedStartsAt, occupiedEndsAt, period))) return null;
  return { startsAt: start.startsAt.toISOString(), endsAt: endsAt.toISOString(), occupiedStartsAt: occupiedStartsAt.toISOString(), occupiedEndsAt: occupiedEndsAt.toISOString() };
}

const blockRules = (input: SlotEngineInput) => input.blocks ?? { minBlocks: 1, maxBlocks: 1 };
/** The longest run of consecutive sessions (up to the service's maximum) from a start; 0 when not even one fits. */
function maxBlocksAt(start: Start, context: DayContext) {
  // A longer range contains a shorter one, so the first length that fails ends the search.
  let blocks = 0;
  while (blocks < blockRules(context.input).maxBlocks && rangeFrom(start, blocks + 1, context)) blocks++;
  return blocks;
}

/**
 * Pure: every bookable start on a local date, sorted, unique, inside open spans, outside busy periods, honouring notice and
 * window. A start is bookable when at least min_blocks sessions fit from it; maxBlocks says how many do.
 */
export function slotsForDate(date: string, input: SlotEngineInput): Slot[] {
  const day = dayStarts(date, input); if (!day) return [];
  const { minBlocks } = blockRules(input), slots: Slot[] = [];
  for (const start of day.starts) {
    const maxBlocks = maxBlocksAt(start, day.context);
    const shortest = maxBlocks >= minBlocks ? rangeFrom(start, minBlocks, day.context) : null;
    if (shortest) slots.push({ ...shortest, maxBlocks });
  }
  // Spans are merged and ascending, but a DST fall-back can map two local minutes to one instant: keep output sorted and unique.
  return slots.filter((slot, index) => slots.findIndex(other => other.startsAt === slot.startsAt) === index).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

/** Where a booking of `blocks` sessions from exactly `startsAt` on `date` would sit; null unless it is allowed and entirely free. */
export function hourlyRange(date: string, startsAt: string, blocks: number, input: SlotEngineInput): Range | null {
  const { minBlocks, maxBlocks } = blockRules(input);
  if (!Number.isInteger(blocks) || blocks < minBlocks || blocks > maxBlocks) return null;
  const day = dayStarts(date, input); if (!day) return null;
  const start = day.starts.find(item => item.startsAt.toISOString() === startsAt);
  return start ? rangeFrom(start, blocks, day.context) : null;
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
