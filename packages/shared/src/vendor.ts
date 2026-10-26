import { z } from "zod";
import { advanceRuleProblem } from "./money.js";
import { slugProblem } from "./slug.js";
import { termsTemplateProblems } from "./terms.js";
import { isIanaTimezone } from "./time.js";
import { MAX_BOOKING_DAYS, MAX_BUFFER_DAYS } from "./days.js";

// Request schemas shared by the API (validation) and the web forms (inline errors). Unknown fields are rejected.
const text = (max: number) => z.string().trim().max(max);
export const slugSchema = z.string().superRefine((value, ctx) => { const problem = slugProblem(value); if (problem) ctx.addIssue({ code: "custom", message: problem }); });
export const timezoneSchema = z.string().trim().refine(isIanaTimezone, "Choose a valid timezone, for example Asia/Kolkata.");
export const categorySlugsSchema = z.array(z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)).min(1, "Choose at least one category.").max(8);
export const localDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-11-02.");
export const localTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, "Use a time like 09:30.").transform(value => value.slice(0, 5));

export const vendorCreateSchema = z.object({
  business_name: text(100).min(2, "Use at least 2 characters."), slug: slugSchema, city: text(100).min(2, "Use at least 2 characters."),
  description: text(2000).default(""), categories: categorySlugsSchema.default(["other"]), timezone: timezoneSchema.default("Asia/Kolkata")
}).strict();
export const vendorProfileSchema = z.object({
  business_name: text(100).min(2), description: text(2000), slug: slugSchema, city: text(100).min(2), service_area: text(160).nullable(), timezone: timezoneSchema,
  categories: categorySlugsSchema, terms: text(5000), cancellation_policy: text(5000), rescheduling_policy: text(5000),
  phone_required: z.boolean(), public_contact_email: z.boolean(), public_contact_phone: z.boolean()
}).partial().strict();
export const bookingWindowSchema = z.object({
  min_notice_minutes: z.number().int().min(0, "Notice cannot be negative.").max(43_200, "Notice can be at most 30 days."),
  max_advance_days: z.number().int().min(1, "Allow booking at least 1 day ahead.").max(365, "Bookings can open at most 365 days ahead.")
}).partial().strict();

/** Tiers are sorted by hours before the start, strictly decreasing (no overlaps), and refunds never grow as the start nears. */
export const cancellationTierSchema = z.object({ min_hours_before: z.number().int().min(0).max(8760), refund_percent: z.number().int().min(0).max(100) }).strict();
export type CancellationTier = z.infer<typeof cancellationTierSchema>;
export function cancellationTiersProblem(tiers: CancellationTier[]): string | null {
  for (let index = 1; index < tiers.length; index++) {
    if (tiers[index].min_hours_before >= tiers[index - 1].min_hours_before) return "List tiers from the earliest cancellation to the latest, each with fewer hours than the one before.";
    if (tiers[index].refund_percent > tiers[index - 1].refund_percent) return "A later cancellation cannot refund more than an earlier one.";
  }
  return null;
}
export const cancellationTiersSchema = z.array(cancellationTierSchema).max(6, "Use at most 6 tiers.").superRefine((tiers, ctx) => { const problem = cancellationTiersProblem(tiers); if (problem) ctx.addIssue({ code: "custom", message: problem }); });
export const termsTemplateSchema = z.string().max(10_000).superRefine((template, ctx) => { for (const problem of termsTemplateProblems(template)) ctx.addIssue({ code: "custom", message: problem }); });

// A service is charged per hour ("hourly": duration and buffers in minutes) or per day ("daily": price per day, a range of
// days, buffer days). Each mode carries exactly its own fields; the other mode's must be absent or null (the database
// enforces the same rule with services_mode_fields).
export const BOOKING_MODES = ["hourly", "daily"] as const;
export type BookingMode = typeof BOOKING_MODES[number];
const serviceBase = {
  name: text(120).min(2, "Use at least 2 characters."), description: text(2000).default(""),
  price_paise: z.number({ error: "Enter a price." }).int("Price must be in whole paise.").positive("Price must be more than zero.").max(1_000_000_000, "That price is too high."),
  advance_type: z.enum(["NONE", "PERCENT", "FIXED"]), advance_value: z.number().int().min(0),
  cancellation_tiers: cancellationTiersSchema.default([]), terms_template: termsTemplateSchema.default(""),
  customer_details_prompt: text(1000).default(""), active: z.boolean().default(true)
};
const hourlyFields = {
  duration_minutes: z.number({ error: "Enter how long the service takes, in minutes." }).int("Use whole minutes.").min(5, "At least 5 minutes.").max(1440, "At most 24 hours."),
  buffer_before_minutes: z.number().int().min(0).max(1440, "At most 24 hours.").default(0), buffer_after_minutes: z.number().int().min(0).max(1440, "At most 24 hours.").default(0)
};
const dailyFields = {
  min_days: z.number({ error: "Enter the minimum number of days." }).int("Use whole days.").min(1, "At least 1 day.").max(MAX_BOOKING_DAYS, `At most ${MAX_BOOKING_DAYS} days.`).default(1),
  max_days: z.number({ error: "Enter the maximum number of days." }).int("Use whole days.").min(1, "At least 1 day.").max(MAX_BOOKING_DAYS, `At most ${MAX_BOOKING_DAYS} days.`).default(1),
  buffer_days: z.number().int("Use whole days.").min(0, "Use 0 or more days.").max(MAX_BUFFER_DAYS, `At most ${MAX_BUFFER_DAYS} days.`).default(0)
};
const notUsed = (message: string) => z.null({ error: message }).optional();
const notForHourly = "Per-hour services do not use days. Remove it, or charge per day instead.";
const notForDaily = "Per-day services do not use minutes. Remove it, or charge per hour instead.";
const hourlyService = z.object({ ...serviceBase, booking_mode: z.literal("hourly"), ...hourlyFields, min_days: notUsed(notForHourly), max_days: notUsed(notForHourly), buffer_days: notUsed(notForHourly) }).strict();
const dailyService = z.object({ ...serviceBase, booking_mode: z.literal("daily"), ...dailyFields, duration_minutes: notUsed(notForDaily), buffer_before_minutes: notUsed(notForDaily), buffer_after_minutes: notUsed(notForDaily) }).strict();
// A body without booking_mode is an hourly service, as every service was before per-day pricing existed.
const withMode = (value: unknown) => value && typeof value === "object" && !("booking_mode" in value) ? { ...value, booking_mode: "hourly" } : value;
export const serviceCreateSchema = z.preprocess(withMode, z.discriminatedUnion("booking_mode", [hourlyService, dailyService], { error: "Choose how you charge: per hour or per day." })).superRefine((value, ctx) => {
  const problem = advanceRuleProblem(value.price_paise, value.advance_type, value.advance_value);
  if (problem) ctx.addIssue({ code: "custom", path: ["advance_value"], message: problem });
  if (value.booking_mode === "daily" && value.max_days < value.min_days) ctx.addIssue({ code: "custom", path: ["max_days"], message: "The maximum must be at least the minimum number of days." });
});
/** PATCH bodies: any subset of fields. The API merges with the stored row and re-validates with serviceCreateSchema. */
export const serviceUpdateSchema = z.object({
  ...Object.fromEntries(Object.entries(serviceBase).map(([key, schema]) => [key, schema.optional()])) as { [K in keyof typeof serviceBase]: z.ZodOptional<typeof serviceBase[K]> },
  booking_mode: z.enum(BOOKING_MODES, { error: "Choose how you charge: per hour or per day." }).optional(),
  duration_minutes: hourlyFields.duration_minutes.nullable().optional(), buffer_before_minutes: z.number().int().min(0).max(1440).nullable().optional(), buffer_after_minutes: z.number().int().min(0).max(1440).nullable().optional(),
  min_days: z.number().int().min(1).max(MAX_BOOKING_DAYS).nullable().optional(), max_days: z.number().int().min(1).max(MAX_BOOKING_DAYS).nullable().optional(), buffer_days: z.number().int().min(0).max(MAX_BUFFER_DAYS).nullable().optional()
}).strict();
export const serviceReorderSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(200) }).strict();
export type ServiceInput = z.infer<typeof serviceCreateSchema>;

const windowFields = { start_time: localTimeSchema, end_time: localTimeSchema };
export const weeklyWindowSchema = z.object({ weekday: z.number().int().min(0).max(6), ...windowFields }).strict().refine(value => value.end_time > value.start_time, { message: "End time must be after the start time.", path: ["end_time"] });
/** A full weekly schedule; windows on the same day may not overlap or touch. */
export const weeklyScheduleSchema = z.object({ windows: z.array(weeklyWindowSchema).max(70) }).strict().superRefine((value, ctx) => {
  const sorted = [...value.windows].sort((a, b) => a.weekday - b.weekday || a.start_time.localeCompare(b.start_time));
  for (let index = 1; index < sorted.length; index++) if (sorted[index].weekday === sorted[index - 1].weekday && sorted[index].start_time < sorted[index - 1].end_time) ctx.addIssue({ code: "custom", message: `Two windows overlap on ${["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][sorted[index].weekday]}.`, path: ["windows"] });
});
export const overrideSchema = z.object({ local_date: localDateSchema, kind: z.enum(["block", "open"]), start_time: localTimeSchema.nullable().default(null), end_time: localTimeSchema.nullable().default(null), note: text(500).default("") }).strict().superRefine((value, ctx) => {
  if ((value.start_time === null) !== (value.end_time === null)) ctx.addIssue({ code: "custom", message: "Give both a start and an end time, or neither.", path: ["end_time"] });
  else if (value.start_time && value.end_time && value.end_time <= value.start_time) ctx.addIssue({ code: "custom", message: "End time must be after the start time.", path: ["end_time"] });
  if (value.kind === "open" && value.start_time === null) ctx.addIssue({ code: "custom", message: "Extra opening hours need a start and end time.", path: ["start_time"] });
});
export const blockedPeriodSchema = z.object({ starts_at: z.string().datetime({ offset: true }), ends_at: z.string().datetime({ offset: true }), reason: text(500).default("") }).strict().refine(value => new Date(value.ends_at) > new Date(value.starts_at), { message: "End must be after the start.", path: ["ends_at"] });

export type ChecklistInput = { published: boolean; hasService: boolean; hasValidAdvanceRule: boolean; hasAvailability: boolean; businessName: string; description: string; terms: string; cancellationPolicy: string; reschedulingPolicy: string; slug: string | null };
/** Everything publishing requires, as stable keys the UI maps to copy. */
export const missingPublishRequirements = (value: Omit<ChecklistInput, "published">): string[] => [
  !value.slug && "slug",
  !value.hasService && "active_service",
  !(value.terms && value.cancellationPolicy && value.reschedulingPolicy) && "policies",
  !value.hasValidAdvanceRule && "valid_advance_rules",
  !value.hasAvailability && "availability",
  !value.businessName && "business_name",
  !value.description && "description"
].filter((item): item is string => Boolean(item));
/** The three-step checklist a new vendor sees instead of an empty dashboard (SPEC 5.6). */
export const onboardingSteps = (value: ChecklistInput) => [
  { key: "service", label: "Add your first service", done: value.hasService },
  { key: "availability", label: "Set the hours you take bookings", done: value.hasAvailability },
  { key: "publish", label: "Publish your booking page", done: value.published }
];
