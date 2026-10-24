"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { formatINR } from "@bayana/shared";
import { PageHeader } from "@/components/layout/brand";
import { Button } from "@/components/ui/button";
import { Badge, Notice, StatusBadge } from "@/components/ui/display";
import { Field, Select } from "@/components/ui/field";
import { api, humanMessage } from "@/lib/api";
import { AdminTable, SearchForm, Show, useAdmin, when, type Column } from "./admin-data";

type Bk = { id: string; status: string; client_name: string; client_email: string; vendor_slug: string; starts_at: string; hold_expires_at: string | null; created_at: string };
type Pay = { id: string; booking_id: string; status: string; amount_paise: number; kind: string; provider: string; method: string | null; provider_order_id: string | null; provider_payment_id: string | null; client_email: string; vendor_slug: string; created_at: string };
type Hook = { event_id: string; type: string; needs_review: boolean; processed_at: string | null; error: string | null; order_id: string | null; received_at: string };
type Email = { id: string; template: string; subject: string; recipient: string; status: string; attempts: number; last_error: string | null; booking_id: string | null; created_at: string };
type Run = { id: string; job: string; trigger: string; status: string; started_at: string; finished_at: string | null; error: string | null; details: unknown };
type User = { id: string; email: string; role: string; is_admin: boolean; has_2fa: boolean; deleted_at: string | null; vendor_id: string | null; vendor_slug: string | null; created_at: string; last_seen: string | null };
type Vendor = { id: string; display_name: string; slug: string; city: string; owner_email: string | null; published: boolean; bookings: number; open_bookings: number; created_at: string };
type Audit = { id: string; created_at: string; actor_email: string | null; action: string; resource_type: string; resource_id: string; metadata: unknown };
/** The list's search terms live in the URL, so a list can be bookmarked and the back button works. */
function useQuery(initial: { q?: string; status?: string }) {
  const router = useRouter(), pathname = usePathname(); const [query, setQuery] = useState(initial);
  const update = (next: { q?: string; status?: string }) => { const merged = { ...query, ...next }; setQuery(merged); const params = new URLSearchParams(Object.entries(merged).filter(([, value]) => value) as [string, string][]).toString(); router.replace(`${pathname}${params ? `?${params}` : ""}`, { scroll: false }); };
  const qs = new URLSearchParams(Object.entries(query).filter(([, value]) => value) as [string, string][]).toString();
  return { query, update, qs: qs ? `?${qs}` : "" };
}
const bookingLink = (id: string, label?: string) => <Link href={`/admin/bookings/${id}`} className="font-mono text-xs">{label ?? id.slice(0, 8)}</Link>;
const tone = (status: string) => ["ok", "sent", "captured", "processed"].includes(status) ? "success" as const : ["failed", "needs_review"].includes(status) ? "danger" as const : "warning" as const;
function StatusFilter({ value, options, onChange }: { value: string; options: [string, string][]; onChange: (value: string) => void }) {
  return <Field label="Status">{p => <Select {...p} value={value} onChange={event => onChange(event.target.value)}><option value="">All</option>{options.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Select>}</Field>;
}
const ActionResult = ({ text }: { text?: { tone: "success" | "danger"; text: string } }) => text ? <Notice tone={text.tone} className="mb-4">{text.text}</Notice> : null;
function useAction(reload: () => Promise<unknown>) {
  const [busy, setBusy] = useState(""); const [result, setResult] = useState<{ tone: "success" | "danger"; text: string }>();
  const run = async (id: string, path: string, done: string) => { setBusy(id); setResult(undefined); try { await api(path, { body: {} }); setResult({ tone: "success", text: done }); await reload(); } catch (failure) { setResult({ tone: "danger", text: humanMessage(failure) }); } finally { setBusy(""); } };
  return { busy, result, run };
}

export function AdminBookings({ initial }: { initial: { q?: string; status?: string } }) {
  const { query, update, qs } = useQuery(initial);
  const [state, reload] = useAdmin<{ bookings: Bk[] }>(`/v1/admin/bookings${qs}`);
  const columns: Column<Bk>[] = [
    { label: "Booking", render: row => bookingLink(row.id) }, { label: "Status", render: row => <StatusBadge status={row.status} /> },
    { label: "Customer", render: row => <><span className="font-medium">{row.client_name}</span><span className="block text-xs text-muted">{row.client_email}</span></> },
    { label: "Vendor", render: row => row.vendor_slug }, { label: "Starts", render: row => when(row.starts_at) }, { label: "Hold until", render: row => when(row.hold_expires_at) }, { label: "Created", render: row => when(row.created_at) }
  ];
  return <>
    <PageHeader eyebrow="Admin" title="Bookings" description="Search by customer email or name, vendor slug, or a booking id (or its first characters)." />
    <SearchForm value={query.q ?? ""} placeholder="Email, name, slug or booking id" onSearch={q => update({ q })}><StatusFilter value={query.status ?? ""} options={["HELD", "PENDING", "CONFIRMED", "COMPLETED", "CANCELLED", "EXPIRED", "EXPIRED_PAID"].map(status => [status, status.toLowerCase().replace("_", " ")])} onChange={status => update({ status })} /></SearchForm>
    <Show state={state} retry={() => void reload()}>{data => <AdminTable rows={data.bookings} columns={columns} rowKey={row => row.id} caption="Bookings" empty="No bookings match." />}</Show>
  </>;
}

export function AdminPayments({ initial }: { initial: { q?: string; status?: string } }) {
  const { query, update, qs } = useQuery(initial);
  const [state, reload] = useAdmin<{ payments: Pay[] }>(`/v1/admin/payments${qs}`);
  const { busy, result, run } = useAction(reload);
  const columns: Column<Pay>[] = [
    { label: "Booking", render: row => bookingLink(row.booking_id) }, { label: "Status", render: row => <Badge tone={tone(row.status)}>{row.status}</Badge> },
    { label: "Amount", render: row => `${formatINR(row.amount_paise)} · ${row.kind}` }, { label: "Provider", render: row => <>{row.provider}{row.method ? ` · ${row.method}` : ""}<span className="block break-all font-mono text-xs text-muted">{row.provider_order_id ?? ""} {row.provider_payment_id ?? ""}</span></> },
    { label: "Customer", render: row => <>{row.client_email}<span className="block text-xs text-muted">{row.vendor_slug}</span></> }, { label: "Created", render: row => when(row.created_at) },
    { label: "Action", render: row => row.provider === "razorpay" ? <Button size="sm" variant="secondary" loading={busy === row.id} onClick={() => void run(row.id, `/v1/admin/payments/${row.id}/reverify`, "Re-verified with Razorpay. Open the booking to see the result.")}>Re-verify</Button> : <span className="text-muted">—</span> }
  ];
  return <>
    <PageHeader eyebrow="Admin" title="Payments" description="Search by Razorpay order or payment id, booking id, or customer email." />
    <SearchForm value={query.q ?? ""} placeholder="order_…, pay_…, booking id or email" onSearch={q => update({ q })}><StatusFilter value={query.status ?? ""} options={[["created", "created"], ["authorized", "authorized"], ["captured", "captured"], ["failed", "failed"], ["refunded", "refunded"], ["partially_refunded", "partly refunded"]]} onChange={status => update({ status })} /></SearchForm>
    <ActionResult text={result} />
    <Show state={state} retry={() => void reload()}>{data => <AdminTable rows={data.payments} columns={columns} rowKey={row => row.id} caption="Payments" empty="No payments match." />}</Show>
  </>;
}

export function AdminWebhooks({ initial }: { initial: { status?: string } }) {
  const { query, update, qs } = useQuery({ status: initial.status ?? "review" });
  const [state, reload] = useAdmin<{ webhooks: Hook[] }>(`/v1/admin/webhooks${qs}`);
  const { busy, result, run } = useAction(reload);
  const columns: Column<Hook>[] = [
    { label: "Event", render: row => <><Link href={`/admin/webhooks/${encodeURIComponent(row.event_id)}`} className="break-all font-mono text-xs">{row.event_id}</Link><span className="block text-xs text-muted">{row.type}</span></> },
    { label: "State", render: row => <Badge tone={row.needs_review ? "danger" : row.processed_at ? "success" : "warning"}>{row.needs_review ? "needs review" : row.processed_at ? "applied" : "waiting"}</Badge> },
    { label: "Error", render: row => row.error ?? "—" }, { label: "Order", render: row => <span className="break-all font-mono text-xs">{row.order_id ?? "—"}</span> }, { label: "Received", render: row => when(row.received_at) },
    { label: "Action", render: row => !row.processed_at || row.needs_review ? <Button size="sm" variant="secondary" loading={busy === row.event_id} onClick={() => void run(row.event_id, `/v1/admin/webhooks/${encodeURIComponent(row.event_id)}/reprocess`, "Processed again.")}>Process again</Button> : <span className="text-muted">—</span> }
  ];
  return <>
    <PageHeader eyebrow="Admin" title="Webhooks" description="Razorpay events. Those needing review were not applied automatically." />
    <div className="mb-4 max-w-xs"><StatusFilter value={query.status ?? ""} options={[["review", "Needs review"], ["waiting", "Waiting"]]} onChange={status => update({ status })} /></div>
    <ActionResult text={result} />
    <Show state={state} retry={() => void reload()}>{data => <AdminTable rows={data.webhooks} columns={columns} rowKey={row => row.event_id} caption="Webhooks" empty="No webhook events here." />}</Show>
  </>;
}

export function AdminOutbox({ initial }: { initial: { q?: string; status?: string } }) {
  const { query, update, qs } = useQuery({ q: initial.q, status: initial.status ?? "failed" });
  const [state, reload] = useAdmin<{ emails: Email[] }>(`/v1/admin/outbox${qs}`);
  const { busy, result, run } = useAction(reload);
  const columns: Column<Email>[] = [
    { label: "Email", render: row => <><span className="font-medium">{row.template}</span><span className="block text-xs text-muted">{row.subject}</span></> }, { label: "To", render: row => <span className="break-all">{row.recipient}</span> },
    { label: "Status", render: row => <Badge tone={tone(row.status)}>{row.status}</Badge> }, { label: "Attempts", render: row => <>{row.attempts}{row.last_error && <span className="block text-xs text-danger">{row.last_error}</span>}</> },
    { label: "Booking", render: row => row.booking_id ? bookingLink(row.booking_id) : "—" }, { label: "Created", render: row => when(row.created_at) },
    { label: "Action", render: row => row.status === "failed" ? <Button size="sm" variant="secondary" loading={busy === row.id} onClick={() => void run(row.id, `/v1/admin/outbox/${row.id}/retry`, "Queued again and sent if the mail server answered.")}>Retry</Button> : <span className="text-muted">—</span> }
  ];
  return <>
    <PageHeader eyebrow="Admin" title="Emails" description="The outbox. Bodies are not shown here; login codes are removed after sending." />
    <SearchForm value={query.q ?? ""} placeholder="Recipient email" onSearch={q => update({ q })}><StatusFilter value={query.status ?? ""} options={[["failed", "Failed"], ["queued", "Queued"], ["sent", "Sent"]]} onChange={status => update({ status })} /></SearchForm>
    <ActionResult text={result} />
    <Show state={state} retry={() => void reload()}>{data => <AdminTable rows={data.emails} columns={columns} rowKey={row => row.id} caption="Emails" empty="No emails match." />}</Show>
  </>;
}

export function AdminJobs({ initial }: { initial: { status?: string } }) {
  const { query, update, qs } = useQuery(initial);
  const [state, reload] = useAdmin<{ runs: Run[] }>(`/v1/admin/job-runs${qs}`);
  const columns: Column<Run>[] = [
    { label: "Job", render: row => <><span className="font-medium">{row.job}</span><span className="block text-xs text-muted">{row.trigger}</span></> }, { label: "Status", render: row => <Badge tone={tone(row.status)}>{row.status}</Badge> },
    { label: "Started", render: row => when(row.started_at) }, { label: "Took", render: row => row.finished_at ? `${Math.max(0, new Date(row.finished_at).getTime() - new Date(row.started_at).getTime())} ms` : "running" },
    { label: "Details", render: row => <span className="break-all font-mono text-xs">{row.error ?? JSON.stringify(row.details)}</span> }
  ];
  return <>
    <PageHeader eyebrow="Admin" title="Job runs" description="Every tick and nightly job, newest first. Run them from the Health page." />
    <div className="mb-4 max-w-xs"><StatusFilter value={query.status ?? ""} options={[["failed", "Failed"], ["ok", "OK"], ["running", "Running"]]} onChange={status => update({ status })} /></div>
    <Show state={state} retry={() => void reload()}>{data => <AdminTable rows={data.runs} columns={columns} rowKey={row => row.id} caption="Job runs" empty="No job runs yet. Run the tick from the Health page." />}</Show>
  </>;
}

export function AdminUsers({ initial }: { initial: { q?: string } }) {
  const { query, update, qs } = useQuery(initial);
  const [state, reload] = useAdmin<{ users: User[] }>(`/v1/admin/users${qs}`);
  const columns: Column<User>[] = [
    { label: "Email", render: row => <Link href={`/admin/users/${row.id}`} className="break-all">{row.email}</Link> }, { label: "Role", render: row => <>{row.role}{row.is_admin && <Badge tone="primary" className="ml-2">admin{row.has_2fa ? "" : ", no 2FA"}</Badge>}{row.deleted_at && <Badge tone="danger" className="ml-2">deleted</Badge>}</> },
    { label: "Vendor", render: row => row.vendor_id ? <Link href={`/admin/vendors/${row.vendor_id}`}>{row.vendor_slug}</Link> : "—" }, { label: "Joined", render: row => when(row.created_at) }, { label: "Last seen", render: row => when(row.last_seen) }
  ];
  return <>
    <PageHeader eyebrow="Admin" title="Users" description="Search by email or user id." />
    <SearchForm value={query.q ?? ""} placeholder="Email or user id" onSearch={q => update({ q })} />
    <Show state={state} retry={() => void reload()}>{data => <AdminTable rows={data.users} columns={columns} rowKey={row => row.id} caption="Users" empty="No users match." />}</Show>
  </>;
}

export function AdminVendors({ initial }: { initial: { q?: string } }) {
  const { query, update, qs } = useQuery(initial);
  const [state, reload] = useAdmin<{ vendors: Vendor[] }>(`/v1/admin/vendors${qs}`);
  const columns: Column<Vendor>[] = [
    { label: "Vendor", render: row => <><Link href={`/admin/vendors/${row.id}`} className="font-medium">{row.display_name}</Link><span className="block text-xs text-muted">/{row.slug} · {row.city}</span></> }, { label: "Owner", render: row => <span className="break-all">{row.owner_email ?? "—"}</span> },
    { label: "Published", render: row => <Badge tone={row.published ? "success" : "neutral"}>{row.published ? "yes" : "no"}</Badge> }, { label: "Bookings", render: row => `${row.bookings} (${row.open_bookings} open)` }, { label: "Joined", render: row => when(row.created_at) }
  ];
  return <>
    <PageHeader eyebrow="Admin" title="Vendors" description="Search by slug, business name or owner email." />
    <SearchForm value={query.q ?? ""} placeholder="Slug, name or owner email" onSearch={q => update({ q })} />
    <Show state={state} retry={() => void reload()}>{data => <AdminTable rows={data.vendors} columns={columns} rowKey={row => row.id} caption="Vendors" empty="No vendors match." />}</Show>
  </>;
}

export function AdminAudit({ initial }: { initial: { q?: string } }) {
  const { query, update, qs } = useQuery(initial);
  const [state, reload] = useAdmin<{ entries: Audit[] }>(`/v1/admin/audit${qs}`);
  const columns: Column<Audit>[] = [
    { label: "When", render: row => when(row.created_at) }, { label: "Who", render: row => <span className="break-all">{row.actor_email ?? "system"}</span> }, { label: "Action", render: row => <span className="font-mono text-xs">{row.action}</span> },
    { label: "On", render: row => row.resource_type === "booking" ? bookingLink(row.resource_id, `booking ${row.resource_id.slice(0, 8)}`) : <span className="break-all text-xs">{row.resource_type} {row.resource_id}</span> },
    { label: "Details", render: row => <span className="break-all font-mono text-xs">{JSON.stringify(row.metadata)}</span> }
  ];
  return <>
    <PageHeader eyebrow="Admin" title="Audit log" description="Admin views and actions, offline payments, refunds and other sensitive changes. Append-only." />
    <SearchForm value={query.q ?? ""} placeholder="Resource id, action or admin email" onSearch={q => update({ q })} />
    <Show state={state} retry={() => void reload()}>{data => <AdminTable rows={data.entries} columns={columns} rowKey={row => row.id} caption="Audit log" empty="No entries match." />}</Show>
  </>;
}
