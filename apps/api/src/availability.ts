import { localDateTimeToUtc, zonedParts } from "@bayana/shared";

export { localDateTimeToUtc } from "@bayana/shared";
export type LocalInterval = { startTime: string; endTime: string };
export type AvailabilityOverride = { localDate: string; kind: "block" | "open"; startTime: string | null; endTime: string | null };
export type BusyPeriod = { startsAt: string; endsAt: string };
export type SlotEngineInput = {
  timezone: string; serviceDurationMinutes: number; bufferBeforeMinutes: number; bufferAfterMinutes: number; bookingMode: "TIMED" | "FULL_DAY"; slotStepMinutes: number;
  minimumNoticeMinutes: number; maximumDaysAhead: number; weeklyRules: Map<number, LocalInterval[]>; overrides: AvailabilityOverride[]; blockedPeriods: BusyPeriod[]; activeBookings: BusyPeriod[]; now: Date;
};
export type Slot = { startsAt: string; endsAt: string; occupiedStartsAt: string; occupiedEndsAt: string };

const localKey = (date: Date, timezone: string) => { const p = zonedParts(date, timezone); return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`; };
const minuteOf = (time: string) => { const [hours, minutes] = time.slice(0, 5).split(":").map(Number); return hours * 60 + minutes; };
const dateAtMinute = (date: string, minute: number) => `${date}T${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}:00`;
const overlaps = (start: Date, end: Date, period: BusyPeriod) => start < new Date(period.endsAt) && end > new Date(period.startsAt);
const localWeekday = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();
const nextDate = (date: string) => { const value = new Date(`${date}T12:00:00Z`); value.setUTCDate(value.getUTCDate() + 1); return value.toISOString().slice(0, 10); };

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
  if (input.bookingMode === "FULL_DAY") {
    const startsAt = localDateTimeToUtc(`${date}T00:00:00`, input.timezone); const endsAt = localDateTimeToUtc(`${nextDate(date)}T00:00:00`, input.timezone);
    if (!spans.length || !startsAt || !endsAt || startsAt < noticeAfter || busy.some(period => overlaps(startsAt, endsAt, period))) return [];
    return [{ startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), occupiedStartsAt: startsAt.toISOString(), occupiedEndsAt: endsAt.toISOString() }];
  }
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
export function monthSummary(month: string, input: SlotEngineInput) { const first = `${month}-01`, cursor = new Date(`${first}T12:00:00Z`), result: { date: string; available: boolean }[] = []; while (cursor.toISOString().slice(0, 7) === month) { const date = cursor.toISOString().slice(0, 10); result.push({ date, available: slotsForDate(date, input).length > 0 }); cursor.setUTCDate(cursor.getUTCDate() + 1); } return result; }
