// Pure helpers for choosing dates for a daily service (no imports, so `node --test` loads them directly: days.test.mjs).

/** One date from GET /v1/vendors/:slug/availability/days. max_days: the longest booking that can start on it (0 = none). */
export type DayInfo = { date: string; status: "available" | "booked" | "closed" | "past"; max_days: number };

/** Why a date cannot be a start date (shown to the customer and used as the button's description), or null when it can. */
export function dayReason(day: DayInfo | undefined, minDays: number): string | null {
  if (!day) return "Not open for booking";
  if (day.status === "booked") return "Already booked";
  if (day.status === "closed") return "Closed";
  if (day.status === "past") return "No longer bookable";
  if (day.max_days < minDays) return minDays === 1 ? "Not free" : `Fewer than ${minDays} free days in a row from here`;
  return null;
}

/** The numbers of days a customer may choose from a start date: from the service's minimum to what is actually free. */
export function dayChoices(day: DayInfo | undefined, minDays: number): number[] {
  if (!day || dayReason(day, minDays)) return [];
  return Array.from({ length: day.max_days - minDays + 1 }, (_, index) => minDays + index);
}

/** The legend under the calendar, in the order the reasons appear. */
export const dayLegend = [
  { status: "booked", label: "Booked" },
  { status: "closed", label: "Closed" },
  { status: "past", label: "Past or too soon" }
] as const;
