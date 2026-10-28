import { createHash } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { cancellationTiersSchema, dayRangeLabel, durationLabel, formatINR, localDateOf, renderTerms, sessionCount, tiersInWords, type CancellationTier } from "@bayana/shared";

// The click-wrap contract (SPEC 11.5, CT-02): rendered from the booking's snapshot, shown with its hash, and frozen on acceptance.

type Snapshot = { vendor: { terms: string; cancellation_policy: string; rescheduling_policy: string }; terms_template: string; cancellation_tiers: CancellationTier[] };
type ContractRow = { id: string; client_name: string; client_email: string; service_name: string; starts_at: Date; total_paise: string; advance_paise: string; terms_snapshot: string | null; display_name: string; timezone: string; booking_mode?: "hourly" | "daily"; days_count?: number | null; vendor_timezone?: string | null; service_price_paise?: string | null; ends_at?: Date; blocks_count?: number | null; block_minutes?: number | null };

/** Phase 5 snapshots are {vendor, terms_template, cancellation_tiers}; older rows stored the vendor policies directly. */
export function parseSnapshot(raw: string | null): Snapshot {
  const value = raw ? JSON.parse(raw) as Record<string, unknown> : {};
  const vendor = (value.vendor ?? value) as Partial<Snapshot["vendor"]>;
  const tiers = cancellationTiersSchema.safeParse(value.cancellation_tiers ?? []);
  return { vendor: { terms: vendor.terms ?? "", cancellation_policy: vendor.cancellation_policy ?? "", rescheduling_policy: vendor.rescheduling_policy ?? "" }, terms_template: typeof value.terms_template === "string" ? value.terms_template : "", cancellation_tiers: tiers.success ? tiers.data : [] };
}

export function renderContract(row: ContractRow) {
  const snapshot = parseSnapshot(row.terms_snapshot);
  const total = Number(row.total_paise), advance = Number(row.advance_paise);
  // A daily booking is whole local days: its dates (in the timezone they were computed in), never a time. The hourly text is
  // unchanged byte for byte, so contracts already shown keep their hash.
  const days = row.booking_mode === "daily" && row.days_count ? row.days_count : null, zone = days ? row.vendor_timezone ?? row.timezone : row.timezone;
  const date = days ? dayRangeLabel(localDateOf(row.starts_at, zone), days) : new Intl.DateTimeFormat("en-IN", { timeZone: row.timezone, weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(row.starts_at);
  // Several sessions in a row read as their full range ("2:00 pm to 5:00 pm"); one session keeps the old text (same hash).
  const blocks = !days && row.blocks_count && row.blocks_count > 1 && row.ends_at ? row.blocks_count : null;
  const clock = (instant: Date) => new Intl.DateTimeFormat("en-IN", { timeZone: row.timezone, hour: "numeric", minute: "2-digit", hour12: true }).format(instant);
  const time = days ? "all day" : blocks ? `${clock(row.starts_at)} to ${clock(row.ends_at!)}` : clock(row.starts_at);
  const length = blocks ? durationLabel(Math.round((row.ends_at!.getTime() - row.starts_at.getTime()) / 60_000)) : "";
  const cancellation = tiersInWords(snapshot.cancellation_tiers);
  const values = { business_name: row.display_name, service_name: row.service_name, price: formatINR(total), advance: formatINR(advance), balance: formatINR(total - advance), date, time, customer_name: row.client_name, cancellation_policy: cancellation };
  const sections: [string, string][] = [
    ["Booking", [`Business: ${row.display_name}`, `Service: ${row.service_name}`, days ? `Dates: ${date}, whole days (${zone})` : blocks ? `Date and time: ${date}, ${time}, ${length} (${row.timezone})` : `Date and time: ${date}, ${time} (${row.timezone})`, `Customer: ${row.client_name} <${row.client_email}>`, ...(days ? [`Price per day: ${formatINR(Number(row.service_price_paise ?? 0))} x ${days} ${days === 1 ? "day" : "days"}`] : []), ...(blocks ? [`Price per session: ${formatINR(Number(row.service_price_paise ?? 0))} x ${sessionCount(blocks)}${row.block_minutes ? ` of ${durationLabel(row.block_minutes)}` : ""}`] : []), `Total price: ${values.price}`, `Advance to confirm: ${values.advance}`, `Balance due later: ${values.balance}`].join("\n")],
    ["Refunds if you cancel", cancellation],
    ["Booking terms", snapshot.vendor.terms],
    ["Cancellation policy", snapshot.vendor.cancellation_policy],
    ["Rescheduling policy", snapshot.vendor.rescheduling_policy],
    ["Terms for this service", snapshot.terms_template ? renderTerms(snapshot.terms_template, values) : ""]
  ];
  const text = sections.filter(([, body]) => body.trim()).map(([title, body]) => `${title}\n${body.trim()}`).join("\n\n");
  return { text, sha256: createHash("sha256").update(text, "utf8").digest("hex"), cancellation_tiers: snapshot.cancellation_tiers };
}

export async function loadContract(db: Pool | PoolClient, bookingId: string) {
  const row = (await db.query<ContractRow>("SELECT b.id,b.client_name,b.client_email::text AS client_email,COALESCE(b.service_name,'') AS service_name,b.starts_at,b.total_paise,b.advance_paise,b.terms_snapshot,v.display_name,v.timezone,b.booking_mode,b.days_count,b.blocks_count,b.ends_at,b.block_minutes,b.vendor_timezone,b.service_price_paise FROM bookings b JOIN vendors v ON v.id=b.vendor_id WHERE b.id=$1", [bookingId])).rows[0];
  return row ? renderContract(row) : null;
}
