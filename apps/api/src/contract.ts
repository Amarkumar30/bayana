import { createHash } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { cancellationTiersSchema, formatINR, renderTerms, tiersInWords, type CancellationTier } from "@bayana/shared";

// The click-wrap contract (SPEC 11.5, CT-02): rendered from the booking's snapshot, shown with its hash, and frozen on acceptance.

type Snapshot = { vendor: { terms: string; cancellation_policy: string; rescheduling_policy: string }; terms_template: string; cancellation_tiers: CancellationTier[] };
type ContractRow = { id: string; client_name: string; client_email: string; service_name: string; starts_at: Date; total_paise: string; advance_paise: string; terms_snapshot: string | null; display_name: string; timezone: string };

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
  const date = new Intl.DateTimeFormat("en-IN", { timeZone: row.timezone, weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(row.starts_at);
  const time = new Intl.DateTimeFormat("en-IN", { timeZone: row.timezone, hour: "numeric", minute: "2-digit", hour12: true }).format(row.starts_at);
  const cancellation = tiersInWords(snapshot.cancellation_tiers);
  const values = { business_name: row.display_name, service_name: row.service_name, price: formatINR(total), advance: formatINR(advance), balance: formatINR(total - advance), date, time, customer_name: row.client_name, cancellation_policy: cancellation };
  const sections: [string, string][] = [
    ["Booking", [`Business: ${row.display_name}`, `Service: ${row.service_name}`, `Date and time: ${date}, ${time} (${row.timezone})`, `Customer: ${row.client_name} <${row.client_email}>`, `Total price: ${values.price}`, `Advance to confirm: ${values.advance}`, `Balance due later: ${values.balance}`].join("\n")],
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
  const row = (await db.query<ContractRow>("SELECT b.id,b.client_name,b.client_email::text AS client_email,COALESCE(b.service_name,'') AS service_name,b.starts_at,b.total_paise,b.advance_paise,b.terms_snapshot,v.display_name,v.timezone FROM bookings b JOIN vendors v ON v.id=b.vendor_id WHERE b.id=$1", [bookingId])).rows[0];
  return row ? renderContract(row) : null;
}
