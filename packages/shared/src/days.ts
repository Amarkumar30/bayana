import { localDateTimeToUtc, zonedParts } from "./time.js";

// Per-day bookings (SPEC 8.1 "Service modes"). A daily booking for N days starting on local date D occupies the half-open range
// [start of D, start of D+N) in the vendor's IANA timezone, stored as UTC instants. Back-to-back bookings therefore touch
// without overlapping. Local dates are plain YYYY-MM-DD strings; they never pass through the server's own timezone.

export const MAX_BOOKING_DAYS = 30;
export const MAX_BUFFER_DAYS = 7;

const localDatePattern = /^\d{4}-\d{2}-\d{2}$/;
/** A real calendar date in YYYY-MM-DD form (2026-02-30 is not). */
export const isLocalDate = (value: string) => localDatePattern.test(value) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;

/** Calendar arithmetic on local dates (noon UTC keeps every step on the same calendar day, whatever the offset). */
export function addLocalDays(date: string, days: number) {
  const at = new Date(`${date}T12:00:00Z`); at.setUTCDate(at.getUTCDate() + days); return at.toISOString().slice(0, 10);
}
/** Whole days from `from` to `to` (local dates). */
export const localDaysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);

/** The local calendar date of an instant in a timezone. */
export function localDateOf(instant: Date, timezone: string) {
  const p = zonedParts(instant, timezone); return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/**
 * The first instant of a local calendar date: local midnight, or, where a daylight-saving change skips midnight (some zones
 * spring forward at 00:00), the first local minute that exists that day.
 */
export function startOfLocalDay(date: string, timezone: string): Date {
  for (let minute = 0; minute < 24 * 60; minute += 1) {
    const at = localDateTimeToUtc(`${date}T${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}:00`, timezone);
    if (at) return at;
  }
  throw new Error(`No local time exists on ${date} in ${timezone}`);
}

/** [start of D, start of D+days) as UTC instants: what a daily booking occupies. */
export function localDayRange(date: string, days: number, timezone: string) {
  return { startsAt: startOfLocalDay(date, timezone), endsAt: startOfLocalDay(addLocalDays(date, days), timezone) };
}

/** Integer paise, never a float: price per day x days. */
export function dailyTotalPaise(pricePerDayPaise: number, days: number) {
  if (!Number.isSafeInteger(pricePerDayPaise) || pricePerDayPaise <= 0 || !Number.isInteger(days) || days < 1 || days > MAX_BOOKING_DAYS) throw new Error("Invalid daily price");
  const total = pricePerDayPaise * days;
  if (!Number.isSafeInteger(total)) throw new Error("Invalid daily price");
  return total;
}

const dayFormat = (date: string, withYear: boolean) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}), timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
/** "12 Nov 2026 (1 day)", "12 Nov to 13 Nov 2026 (2 days)", "30 Dec 2026 to 2 Jan 2027 (4 days)". */
export function dayRangeLabel(firstDate: string, days: number) {
  const count = `${days} ${days === 1 ? "day" : "days"}`;
  if (days === 1) return `${dayFormat(firstDate, true)} (${count})`;
  const lastDate = addLocalDays(firstDate, days - 1), sameYear = firstDate.slice(0, 4) === lastDate.slice(0, 4);
  return `${dayFormat(firstDate, !sameYear)} to ${dayFormat(lastDate, true)} (${count})`;
}

/** The date-range wording for a daily booking from its snapshot, or null for an hourly one (callers show a time instead). */
export function dailyBookingLabel(booking: { booking_mode?: string | null; days_count?: number | null; starts_at: Date | string }, timezone: string) {
  if (booking.booking_mode !== "daily" || !booking.days_count) return null;
  return dayRangeLabel(localDateOf(new Date(booking.starts_at), timezone), booking.days_count);
}
