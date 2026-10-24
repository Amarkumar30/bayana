// Display helpers: every booking time is shown in the vendor's timezone, with the visitor's own time beside it when different (SPEC 5.5).

export const viewerTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
export const formatTime = (iso: string | Date, timezone: string) => new Intl.DateTimeFormat("en-IN", { timeZone: timezone, hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(iso));
export const formatDate = (iso: string | Date, timezone: string, style: "long" | "short" = "long") => new Intl.DateTimeFormat("en-IN", style === "long" ? { timeZone: timezone, weekday: "long", day: "numeric", month: "long" } : { timeZone: timezone, weekday: "short", day: "numeric", month: "short" }).format(new Date(iso));
export const formatDateTime = (iso: string | Date, timezone: string) => `${formatDate(iso, timezone)}, ${formatTime(iso, timezone)}`;
/** The calendar date (YYYY-MM-DD) of an instant in a timezone. */
export const localDateKey = (instant: Date, timezone: string) => new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(instant);
/** A local calendar date rendered as a label without shifting it through any timezone. */
export const dateLabel = (date: string, part: "weekday" | "day" | "month" | "full") => {
  const at = new Date(`${date}T12:00:00Z`);
  const options: Intl.DateTimeFormatOptions = part === "weekday" ? { weekday: "short" } : part === "day" ? { day: "numeric" } : part === "month" ? { month: "short" } : { weekday: "long", day: "numeric", month: "long" };
  return new Intl.DateTimeFormat("en-IN", { ...options, timeZone: "UTC" }).format(at);
};
