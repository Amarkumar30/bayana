import { MAX_BLOCKS, MAX_BOOKING_DAYS, advancePaise, advanceRuleProblem, dailyTotalPaise, durationLabel, formatINR, sessionCount, sessionTotalPaise, type AdvanceType } from "@bayana/shared";

// How a service's length and price unit read. Hourly prices are per booked session (of duration_minutes), so they read as
// "90 min" or "per 90 min session", never "per hour"; daily prices are per day.

type ServiceShape = { booking_mode: "hourly" | "daily"; duration_minutes: number | null; min_days: number | null; max_days: number | null; min_blocks?: number | null; max_blocks?: number | null };
/** True when customers can (or must) book more than one session in a row. */
const multiSession = (service: ServiceShape) => service.booking_mode !== "daily" && (service.max_blocks ?? 1) > 1;

const dayCount = (days: number) => `${days} ${days === 1 ? "day" : "days"}`;
/**
 * "90 min" (one session); "1 to 4 sessions, up to 4 hours" or "2 sessions (3 hours)" when several in a row can be booked; or
 * for a daily service "1 day", "2 days", "1 to 3 days".
 */
export function serviceLength(service: ServiceShape) {
  if (service.booking_mode !== "daily") {
    const minutes = service.duration_minutes ?? 0, min = service.min_blocks ?? 1, max = service.max_blocks ?? 1;
    if (!multiSession(service)) return `${minutes} min`;
    return min === max ? `${sessionCount(min)} (${durationLabel(min * minutes)})` : `${min} to ${max} sessions, up to ${durationLabel(max * minutes)}`;
  }
  const min = service.min_days ?? 1, max = service.max_days ?? min;
  return min === max ? dayCount(min) : `${min} to ${max} days`;
}
/**
 * The words after a price: "per day" for daily services; "per 90 min session" when several sessions can be booked; nothing
 * for a single-session service (the price is for the session).
 */
export const priceUnit = (service: Pick<ServiceShape, "booking_mode"> & Partial<ServiceShape>) =>
  service.booking_mode === "daily" ? "per day" : (service.max_blocks ?? 1) > 1 ? `per ${durationLabel(service.duration_minutes ?? 0)} session` : null;

/**
 * The service form's live line for an hourly service of several sessions: "Customer can book 1 to 4 sessions of 1 hour.
 * 3 sessions = 3 hours = ₹4,500. Advance ₹1,350.", for a sample of 3 sessions (or the nearest allowed). Null until valid.
 */
export function sessionPreview(pricePerSession: number, minutes: number, minBlocks: number, maxBlocks: number, advanceType: AdvanceType, advanceValue: number) {
  if (!(pricePerSession > 0) || !Number.isInteger(pricePerSession) || !Number.isInteger(minutes) || minutes < 5 || !Number.isInteger(minBlocks) || !Number.isInteger(maxBlocks) || minBlocks < 1 || maxBlocks < minBlocks || maxBlocks > MAX_BLOCKS || minutes * maxBlocks > 1440) return null;
  const blocks = Math.min(Math.max(3, minBlocks), maxBlocks), total = sessionTotalPaise(pricePerSession, blocks);
  const range = minBlocks === maxBlocks ? `exactly ${sessionCount(minBlocks)}` : `${minBlocks} to ${maxBlocks} sessions`;
  const base = `Customer can book ${range} of ${durationLabel(minutes)}. ${sessionCount(blocks)} = ${durationLabel(blocks * minutes)} = ${formatINR(total)}.`;
  return Number.isNaN(advanceValue) || advanceRuleProblem(pricePerSession, advanceType, advanceValue) ? base : `${base} Advance ${formatINR(advancePaise(total, advanceType, advanceValue))}.`;
}

/**
 * The service form's live line for a daily service: "Customer pays ₹12,000 per day. 2 days = ₹24,000. Advance ₹6,000.", for a
 * sample booking of 2 days (or the nearest allowed). advanceValue is a percent, or paise for a fixed advance. Null until valid.
 */
export function dailyPreview(pricePerDay: number, minDays: number, maxDays: number, advanceType: AdvanceType, advanceValue: number) {
  if (!(pricePerDay > 0) || !Number.isInteger(pricePerDay) || !Number.isInteger(minDays) || !Number.isInteger(maxDays) || minDays < 1 || maxDays < minDays || maxDays > MAX_BOOKING_DAYS) return null;
  const days = Math.min(Math.max(2, minDays), maxDays), total = dailyTotalPaise(pricePerDay, days);
  const base = `Customer pays ${formatINR(pricePerDay)} per day. ${days} ${days === 1 ? "day" : "days"} = ${formatINR(total)}.`;
  return Number.isNaN(advanceValue) || advanceRuleProblem(pricePerDay, advanceType, advanceValue) ? base : `${base} Advance ${formatINR(advancePaise(total, advanceType, advanceValue))}.`;
}
