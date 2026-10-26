import { MAX_BOOKING_DAYS, advancePaise, advanceRuleProblem, dailyTotalPaise, formatINR, type AdvanceType } from "@bayana/shared";

// How a service's length and price unit read. Hourly prices are per booked session (of duration_minutes), so they read as
// "90 min", not "per hour"; daily prices are per day.

type ServiceShape = { booking_mode: "hourly" | "daily"; duration_minutes: number | null; min_days: number | null; max_days: number | null };

const dayCount = (days: number) => `${days} ${days === 1 ? "day" : "days"}`;
/** "90 min", or for a daily service "1 day", "2 days", "1 to 3 days". */
export function serviceLength(service: ServiceShape) {
  if (service.booking_mode !== "daily") return `${service.duration_minutes ?? 0} min`;
  const min = service.min_days ?? 1, max = service.max_days ?? min;
  return min === max ? dayCount(min) : `${min} to ${max} days`;
}
/** The words after a price: "per day" for daily services; nothing for hourly ones (the price is for the session). */
export const priceUnit = (service: Pick<ServiceShape, "booking_mode">) => service.booking_mode === "daily" ? "per day" : null;

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
