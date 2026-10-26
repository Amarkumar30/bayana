import { dayRangeLabel, durationLabel, isMultiSession } from "@bayana/shared";

// Display helpers: every booking time is shown in the vendor's timezone, with the visitor's own time beside it when different (SPEC 5.5).

export const viewerTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
export const formatTime = (iso: string | Date, timezone: string) => new Intl.DateTimeFormat("en-IN", { timeZone: timezone, hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(iso));
export const formatDate = (iso: string | Date, timezone: string, style: "long" | "short" = "long") => new Intl.DateTimeFormat("en-IN", style === "long" ? { timeZone: timezone, weekday: "long", day: "numeric", month: "long" } : { timeZone: timezone, weekday: "short", day: "numeric", month: "short" }).format(new Date(iso));
export const formatDateTime = (iso: string | Date, timezone: string) => `${formatDate(iso, timezone)}, ${formatTime(iso, timezone)}`;
/**
 * What every booking row from the API carries so a daily booking can be shown as dates (first_date is its first local date)
 * and an hourly booking of several sessions as its whole range (blocks_count, ends_at).
 */
export type DailyFields = { booking_mode?: "hourly" | "daily"; days_count?: number | null; first_date?: string | null; blocks_count?: number | null; ends_at?: string | Date | null };
type Timed = DailyFields & { starts_at: string | Date };
const minutesBetween = (from: string | Date, to: string | Date) => Math.round((new Date(to).getTime() - new Date(from).getTime()) / 60_000);
/** "2:00 pm to 5:00 pm" for a booking of several sessions, else null. */
export const formatSessionRange = (booking: Timed, timezone: string) => isMultiSession(booking) && booking.ends_at ? `${formatTime(booking.starts_at, timezone)} to ${formatTime(booking.ends_at, timezone)}` : null;
/**
 * Daily bookings read as their dates ("12 Nov to 13 Nov 2026 (2 days)"), never a time; several sessions as their whole range
 * ("Friday, 12 November, 2:00 pm to 5:00 pm (3 hours)"); one session as its date and time.
 */
export const formatBookingWhen = (booking: Timed, timezone: string) => {
  if (booking.booking_mode === "daily" && booking.days_count && booking.first_date) return dayRangeLabel(booking.first_date, booking.days_count);
  const range = formatSessionRange(booking, timezone);
  return range ? `${formatDate(booking.starts_at, timezone)}, ${range} (${durationLabel(minutesBetween(booking.starts_at, booking.ends_at!))})` : formatDateTime(booking.starts_at, timezone);
};
/** The short form for lists: dates for daily bookings, the range for several sessions, the time for one. */
export const formatBookingTime = (booking: Timed, timezone: string) =>
  booking.booking_mode === "daily" && booking.days_count && booking.first_date ? dayRangeLabel(booking.first_date, booking.days_count) : formatSessionRange(booking, timezone) ?? formatTime(booking.starts_at, timezone);
/** The calendar date (YYYY-MM-DD) of an instant in a timezone. */
export const localDateKey = (instant: Date, timezone: string) => new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(instant);
/** A local calendar date rendered as a label without shifting it through any timezone. */
export const dateLabel = (date: string, part: "weekday" | "day" | "month" | "full") => {
  const at = new Date(`${date}T12:00:00Z`);
  const options: Intl.DateTimeFormatOptions = part === "weekday" ? { weekday: "short" } : part === "day" ? { day: "numeric" } : part === "month" ? { month: "short" } : { weekday: "long", day: "numeric", month: "long" };
  return new Intl.DateTimeFormat("en-IN", { ...options, timeZone: "UTC" }).format(at);
};
