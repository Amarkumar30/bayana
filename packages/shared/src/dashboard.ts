import { z } from "zod";
import { MAX_BOOKING_DAYS } from "./days.js";
import { localDateSchema, localTimeSchema } from "./vendor.js";

// Vendor dashboard actions (SPEC 4.4 BK-09..13, 5.3). Times are local to the vendor's timezone; the server converts them.
const text = (max: number) => z.string().trim().max(max);

export const vendorCancelSchema = z.object({ reason: text(500).min(3, "Tell the customer why, in a few words.") }).strict();
// Hourly bookings move to a date and time; daily bookings move to a new first date and keep their number of days.
export const rescheduleSchema = z.object({ date: localDateSchema, time: localTimeSchema.optional() }).strict();
export const manualBookingSchema = z.object({
  // time for an hourly service, days for a daily one; the server checks which applies from the service itself.
  service_id: z.string().uuid("Choose a service."), date: localDateSchema, time: localTimeSchema.optional(), days: z.number().int().min(1, "At least 1 day.").max(MAX_BOOKING_DAYS, `At most ${MAX_BOOKING_DAYS} days.`).optional(),
  name: text(120).min(2, "Use at least 2 characters."), email: z.string().trim().email("Enter a valid email address.").max(254),
  phone: text(20).refine(value => value === "" || value.length >= 8, "Use at least 8 digits, or leave it empty.").default(""), notes: text(2000).default("")
}).strict();
export const notifyPrefsSchema = z.object({ booking_confirmed: z.boolean(), booking_cancelled: z.boolean(), reminder_24h: z.boolean() }).strict();
export type NotifyPrefs = z.infer<typeof notifyPrefsSchema>;

export const BOOKING_STATUSES = ["HELD", "PENDING", "CONFIRMED", "COMPLETED", "CANCELLED", "EXPIRED", "EXPIRED_PAID"] as const;
export const bookingListQuerySchema = z.object({
  status: z.enum(BOOKING_STATUSES).optional(), q: text(120).optional(), from: localDateSchema.optional(), to: localDateSchema.optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1)
}).strict();
export const calendarQuerySchema = z.object({ from: localDateSchema, to: localDateSchema }).strict().refine(value => value.to >= value.from, { message: "The end date must be after the start date.", path: ["to"] });
