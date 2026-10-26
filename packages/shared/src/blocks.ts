import { localDateOf } from "./days.js";

// Multi-session bookings for hourly services (SPEC 4.3 "Sessions"). An hourly service's duration_minutes is the length of
// one session (a "block") and its price_paise the price of one session. A booking is one continuous range of `blocks`
// consecutive sessions on one local day: [start, start + blocks x duration). Buffers apply once, around the whole range.

export const MAX_BLOCKS = 12;

/** Integer paise, never a float: price per session x sessions. */
export function sessionTotalPaise(pricePerSessionPaise: number, blocks: number) {
  if (!Number.isSafeInteger(pricePerSessionPaise) || pricePerSessionPaise <= 0 || !Number.isInteger(blocks) || blocks < 1 || blocks > MAX_BLOCKS) throw new Error("Invalid session price");
  const total = pricePerSessionPaise * blocks;
  if (!Number.isSafeInteger(total)) throw new Error("Invalid session price");
  return total;
}

/** "45 min", "1 hour", "3 hours", "2 hours 15 min". */
export function durationLabel(minutes: number) {
  const hours = Math.floor(minutes / 60), rest = minutes % 60;
  if (!hours) return `${rest} min`;
  const whole = `${hours} ${hours === 1 ? "hour" : "hours"}`;
  return rest ? `${whole} ${rest} min` : whole;
}

/** "1 session", "3 sessions". */
export const sessionCount = (blocks: number) => `${blocks} ${blocks === 1 ? "session" : "sessions"}`;

/** "2 sessions, 3 hours": what a "How long?" choice reads as. */
export const blocksChoiceLabel = (blocks: number, blockMinutes: number) => `${sessionCount(blocks)}, ${durationLabel(blocks * blockMinutes)}`;

const timeFormat = (instant: Date, timezone: string) => new Intl.DateTimeFormat("en-IN", { timeZone: timezone, hour: "numeric", minute: "2-digit", hour12: true }).format(instant);
const dateFormat = (instant: Date, timezone: string) => new Intl.DateTimeFormat("en-IN", { timeZone: timezone, weekday: "short", day: "numeric", month: "short" }).format(instant);

/** "Fri, 12 Nov, 2:00 pm to 5:00 pm (3 hours)": a multi-session booking's full range in the vendor's timezone. */
export function sessionRangeLabel(startsAt: Date | string, endsAt: Date | string, timezone: string) {
  const start = new Date(startsAt), end = new Date(endsAt);
  return `${dateFormat(start, timezone)}, ${timeFormat(start, timezone)} to ${timeFormat(end, timezone)} (${durationLabel(Math.round((end.getTime() - start.getTime()) / 60_000))})`;
}

/** True when an hourly booking covers more than one session, so it must be shown as a range rather than a start time. */
export const isMultiSession = (booking: { booking_mode?: string | null; blocks_count?: number | null }) => booking.booking_mode !== "daily" && (booking.blocks_count ?? 1) > 1;

/** Whether [startsAt, endsAt) stays on one local calendar date (it may end exactly at the next local midnight). */
export function withinOneLocalDay(startsAt: Date, endsAt: Date, timezone: string) {
  return localDateOf(startsAt, timezone) === localDateOf(new Date(endsAt.getTime() - 1), timezone);
}
