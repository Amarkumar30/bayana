// Timezone helpers on top of Intl (IANA names), shared by the API slot engine and the dashboard.
export const isIanaTimezone = (value: string) => { try { Intl.DateTimeFormat("en-US", { timeZone: value }); return value.length > 0; } catch { return false; } };

// Building an Intl.DateTimeFormat is far more expensive than using one; the slot engine converts thousands of times per month view.
const formatters = new Map<string, Intl.DateTimeFormat>();
const formatterFor = (timezone: string) => {
  let formatter = formatters.get(timezone);
  if (!formatter) { formatter = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }); formatters.set(timezone, formatter); }
  return formatter;
};
export const zonedParts = (date: Date, timezone: string) => Object.fromEntries(formatterFor(timezone).formatToParts(date).filter(part => part.type !== "literal").map(part => [part.type, Number(part.value)])) as Record<"year" | "month" | "day" | "hour" | "minute" | "second", number>;

/**
 * Wall-clock time in a timezone -> the UTC instant, or null when that local time does not exist (spring-forward gap).
 * In a fall-back overlap the earlier instant wins.
 */
export function localDateTimeToUtc(local: string, timezone: string): Date | null {
  const [date, time = "00:00:00"] = local.split("T"); const [year, month, day] = date.split("-").map(Number); const [hour, minute, second = 0] = time.split(":").map(Number);
  const target = Date.UTC(year, month - 1, day, hour, minute, second);
  let candidate = new Date(target);
  for (let index = 0; index < 4; index++) {
    const actual = zonedParts(candidate, timezone);
    const delta = target - Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second);
    if (delta === 0) { const earlier = new Date(candidate.getTime() - 3_600_000); const p = zonedParts(earlier, timezone); return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) === target ? earlier : candidate; }
    candidate = new Date(candidate.getTime() + delta);
  }
  return null;
}
