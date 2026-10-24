"use client";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { AlertOctagon, AlertTriangle, ArrowLeft, CheckCircle2, Info } from "lucide-react";
import { formatINR } from "@bayana/shared";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardHeader, Notice, StatusBadge } from "@/components/ui/display";
import { api, humanMessage } from "@/lib/api";
import { cn } from "@/lib/utils";
import { AdminTable, Show, useAdmin, when } from "./admin-data";

type Finding = { level: "ok" | "info" | "warning" | "problem"; text: string; action?: { kind: "reverify_payment" | "reprocess_webhook" | "retry_email" | "run_tick"; id?: string; label: string } };
type Diagnosis = {
  booking: { id: string; status: string; vendor_slug: string; vendor_name: string; vendor_email: string | null; timezone: string; client_name: string; client_email: string; client_phone: string; service_name: string | null; starts_at: string; ends_at: string; hold_expires_at: string | null; total_paise: string; advance_paise: string; created_at: string; terms_accepted_at: string | null };
  events: { from_status: string | null; to_status: string; actor: string; reason: string | null; meta: unknown; created_at: string }[];
  payments: { id: string; provider: string; kind: string; status: string; amount_paise: number; provider_order_id: string | null; provider_payment_id: string | null; method: string | null; failure_reason: string | null; created_at: string; verified_at: string | null }[];
  refunds: { id: string; amount_paise: number; status: string; provider_refund_id: string | null; reason: string; error: string | null; created_at: string; processed_at: string | null }[];
  outbox: { id: string; template: string; recipient: string; status: string; attempts: number; last_error: string | null; sent_at: string | null; created_at: string }[];
  webhooks: { event_id: string; type: string; received_at: string; processed_at: string | null; error: string | null; needs_review: boolean }[];
  contract: { sha256: string; accepted_at: string; accepted_email: string } | null;
  audit: { action: string; metadata: unknown; created_at: string }[];
  diagnosis: Finding[]; payments_enabled: boolean;
};
const levelStyle = { ok: { icon: CheckCircle2, className: "bg-success-soft", label: "OK" }, info: { icon: Info, className: "bg-primary-soft", label: "Info" }, warning: { icon: AlertTriangle, className: "bg-warning-soft", label: "Check" }, problem: { icon: AlertOctagon, className: "bg-danger-soft", label: "Problem" } };
const actionPath = (action: NonNullable<Finding["action"]>) => action.kind === "reverify_payment" ? `/v1/admin/payments/${action.id}/reverify` : action.kind === "reprocess_webhook" ? `/v1/admin/webhooks/${encodeURIComponent(action.id ?? "")}/reprocess` : action.kind === "retry_email" ? `/v1/admin/outbox/${action.id}/retry` : "/v1/admin/jobs/tick";
const Back = ({ href, label }: { href: string; label: string }) => <Link href={href} className="inline-flex min-h-11 w-fit items-center gap-2 text-sm font-medium"><ArrowLeft className="size-4" aria-hidden />{label}</Link>;
const Facts = ({ rows }: { rows: [string, ReactNode][] }) => <dl className="grid gap-2 text-sm sm:grid-cols-2">{rows.map(([label, value]) => <div key={label} className="grid"><dt className="text-muted">{label}</dt><dd className="break-words">{value}</dd></div>)}</dl>;
const Json = ({ value }: { value: unknown }) => <span className="break-all font-mono text-xs">{JSON.stringify(value)}</span>;

/** The phase gate: one page that says what a booking is waiting for and offers the action that moves it on, without SQL. */
export function AdminBookingDetail({ id }: { id: string }) {
  const [state, reload] = useAdmin<Diagnosis>(`/v1/admin/bookings/${id}`);
  const [busy, setBusy] = useState(""); const [result, setResult] = useState<{ tone: "success" | "danger"; text: string }>();
  const act = async (action: NonNullable<Finding["action"]>) => {
    setBusy(action.kind + (action.id ?? "")); setResult(undefined);
    try { const reply = await api<Record<string, unknown>>(actionPath(action), { body: {} }); setResult({ tone: "success", text: `Done${typeof reply.outcome === "string" ? `: ${reply.outcome.replace(/_/g, " ")}` : ""}.` }); await reload(); }
    catch (failure) { setResult({ tone: "danger", text: humanMessage(failure) }); } finally { setBusy(""); }
  };
  return (
    <div className="grid gap-6">
      <Back href="/admin/bookings" label="Bookings" />
      <Show state={state} retry={() => void reload()} rows={6}>{data => { const b = data.booking; return (
        <>
          <div className="grid gap-2"><StatusBadge status={b.status} className="w-fit" /><h1 className="text-2xl sm:text-4xl">{b.client_name} · {b.vendor_name}</h1><p className="break-all font-mono text-xs text-muted">{b.id}</p></div>
          <section aria-labelledby="diagnosis" className="grid gap-3"><h2 id="diagnosis" className="text-lg">What's going on</h2>
            {result && <Notice tone={result.tone}>{result.text}</Notice>}
            <ul className="grid gap-2">{data.diagnosis.map((finding, index) => { const style = levelStyle[finding.level]; const Icon = style.icon; return (
              <li key={index} className={cn("grid gap-3 rounded-card px-4 py-3 text-sm sm:flex sm:items-start sm:justify-between", style.className)}>
                <span className="flex min-w-0 flex-1 items-start gap-2 break-words"><Icon className="mt-0.5 size-4 shrink-0" aria-hidden /><span><span className="sr-only">{style.label}: </span>{finding.text}</span></span>
                {finding.action && <Button size="sm" variant="secondary" className="w-fit shrink-0" loading={busy === finding.action.kind + (finding.action.id ?? "")} onClick={() => void act(finding.action!)}>{finding.action.label}</Button>}
              </li>
            ); })}</ul>
          </section>
          <Card><CardHeader title="Booking" />
            <Facts rows={[["Vendor", <Link key="v" href={`/admin/bookings?q=${encodeURIComponent(b.vendor_slug)}`}>{b.vendor_name} (/{b.vendor_slug})</Link>], ["Vendor email", b.vendor_email ?? "—"], ["Customer", `${b.client_name} · ${b.client_email}${b.client_phone ? ` · ${b.client_phone}` : ""}`], ["Service", b.service_name ?? "—"],
              ["Starts", `${when(b.starts_at)} (vendor timezone ${b.timezone})`], ["Hold until", when(b.hold_expires_at)], ["Total / advance", `${formatINR(Number(b.total_paise))} / ${formatINR(Number(b.advance_paise))}`], ["Terms", data.contract ? `Agreed ${when(data.contract.accepted_at)} by ${data.contract.accepted_email}` : b.terms_accepted_at ? `Accepted ${when(b.terms_accepted_at)}` : "Not agreed"], ["Online payments", data.payments_enabled ? "On" : "Off"], ["Created", when(b.created_at)]]} />
          </Card>
          <section className="grid gap-3"><h2 className="text-lg">Events</h2><AdminTable rows={data.events} rowKey={row => row.created_at + row.to_status} caption="Events" empty="No events (a consistency problem)." columns={[{ label: "When", render: row => when(row.created_at) }, { label: "Change", render: row => `${row.from_status ?? "new"} → ${row.to_status}` }, { label: "By", render: row => row.actor }, { label: "Reason", render: row => row.reason ?? "—" }, { label: "Meta", render: row => <Json value={row.meta} /> }]} /></section>
          <section className="grid gap-3"><h2 className="text-lg">Payments</h2><AdminTable rows={data.payments} rowKey={row => row.id} caption="Payments" empty="No payment rows." columns={[{ label: "Status", render: row => <Badge tone={row.verified_at ? "success" : row.status === "failed" ? "danger" : "warning"}>{row.status}</Badge> }, { label: "Amount", render: row => `${formatINR(row.amount_paise)} · ${row.kind}` }, { label: "Provider", render: row => <>{row.provider}{row.method ? ` · ${row.method}` : ""}<span className="block break-all font-mono text-xs text-muted">{row.provider_order_id ?? ""} {row.provider_payment_id ?? ""}</span></> }, { label: "Failure", render: row => row.failure_reason ?? "—" }, { label: "Verified", render: row => when(row.verified_at) }]} /></section>
          {data.refunds.length > 0 && <section className="grid gap-3"><h2 className="text-lg">Refunds</h2><AdminTable rows={data.refunds} rowKey={row => row.id} caption="Refunds" empty="" columns={[{ label: "Status", render: row => <Badge tone={row.status === "processed" ? "success" : row.status === "failed" ? "danger" : "warning"}>{row.status}</Badge> }, { label: "Amount", render: row => formatINR(row.amount_paise) }, { label: "Razorpay id", render: row => <span className="font-mono text-xs">{row.provider_refund_id ?? "—"}</span> }, { label: "Reason", render: row => row.error ? `${row.reason} (error: ${row.error})` : row.reason }, { label: "Created", render: row => when(row.created_at) }]} /></section>}
          <section className="grid gap-3"><h2 className="text-lg">Webhooks for this booking</h2><AdminTable rows={data.webhooks} rowKey={row => row.event_id} caption="Webhooks" empty="No Razorpay events matched this booking's orders." columns={[{ label: "Event", render: row => <Link href={`/admin/webhooks/${encodeURIComponent(row.event_id)}`} className="break-all font-mono text-xs">{row.type} · {row.event_id}</Link> }, { label: "State", render: row => row.needs_review ? "needs review" : row.processed_at ? "applied" : "waiting" }, { label: "Error", render: row => row.error ?? "—" }, { label: "Received", render: row => when(row.received_at) }]} /></section>
          <section className="grid gap-3"><h2 className="text-lg">Emails</h2><AdminTable rows={data.outbox} rowKey={row => row.id} caption="Emails" empty="No emails for this booking." columns={[{ label: "Email", render: row => row.template }, { label: "To", render: row => <span className="break-all">{row.recipient}</span> }, { label: "Status", render: row => <Badge tone={row.status === "sent" ? "success" : row.status === "failed" ? "danger" : "warning"}>{row.status}</Badge> }, { label: "Attempts", render: row => `${row.attempts}${row.last_error ? ` · ${row.last_error}` : ""}` }, { label: "Sent", render: row => when(row.sent_at) }]} /></section>
          <section className="grid gap-3"><h2 className="text-lg">Audit</h2><AdminTable rows={data.audit} rowKey={row => row.created_at + row.action} caption="Audit" empty="No audited changes (admin views are not listed here)." columns={[{ label: "When", render: row => when(row.created_at) }, { label: "Action", render: row => <span className="font-mono text-xs">{row.action}</span> }, { label: "Details", render: row => <Json value={row.metadata} /> }]} /></section>
        </>
      ); }}</Show>
    </div>
  );
}

type UserDetail = { user: { id: string; email: string; role: string; is_admin: boolean; totp_enabled_at: string | null; created_at: string; email_verified_at: string | null; has_password: boolean; deleted_at: string | null; vendor_id: string | null; vendor_slug: string | null }; sessions: { id: string; created_at: string; last_used_at: string; revoked_at: string | null; ip: string | null; user_agent: string | null; second_factor_at: string | null }[]; auth_events: { type: string; created_at: string; ip: string | null }[]; bookings: { id: string; status: string; starts_at: string; service_name: string | null; vendor_slug: string }[] };
export function AdminUserDetail({ id }: { id: string }) {
  const [state, reload] = useAdmin<UserDetail>(`/v1/admin/users/${id}`);
  return <div className="grid gap-6"><Back href="/admin/users" label="Users" /><Show state={state} retry={() => void reload()}>{data => (
    <>
      <h1 className="break-all text-2xl sm:text-4xl">{data.user.email}</h1>
      <Card><Facts rows={[["Role", `${data.user.role}${data.user.is_admin ? " · admin" : ""}`], ["Second factor", data.user.totp_enabled_at ? `Set up ${when(data.user.totp_enabled_at)}` : "Not set up"], ["Password", data.user.has_password ? "Set" : "Not set"], ["Email verified", when(data.user.email_verified_at)], ["Joined", when(data.user.created_at)], ["Vendor", data.user.vendor_id ? <Link key="v" href={`/admin/vendors/${data.user.vendor_id}`}>{data.user.vendor_slug}</Link> : "—"], ["Deleted", when(data.user.deleted_at)]]} /></Card>
      <section className="grid gap-3"><h2 className="text-lg">Sessions</h2><AdminTable rows={data.sessions} rowKey={row => row.id} caption="Sessions" empty="No sessions." columns={[{ label: "Started", render: row => when(row.created_at) }, { label: "Last used", render: row => when(row.last_used_at) }, { label: "State", render: row => row.revoked_at ? "revoked" : "active" }, { label: "Device", render: row => <span className="text-xs">{row.ip ?? ""} {row.user_agent ?? ""}</span> }]} /></section>
      <section className="grid gap-3"><h2 className="text-lg">Sign-in events</h2><AdminTable rows={data.auth_events} rowKey={row => row.created_at + row.type} caption="Sign-in events" empty="None." columns={[{ label: "When", render: row => when(row.created_at) }, { label: "Event", render: row => row.type }, { label: "IP", render: row => row.ip ?? "—" }]} /></section>
      <section className="grid gap-3"><h2 className="text-lg">Bookings as a customer</h2><AdminTable rows={data.bookings} rowKey={row => row.id} caption="Bookings" empty="None." columns={[{ label: "Booking", render: row => <Link href={`/admin/bookings/${row.id}`}>{row.service_name ?? "Booking"} · /{row.vendor_slug}</Link> }, { label: "Status", render: row => <StatusBadge status={row.status} /> }, { label: "Starts", render: row => when(row.starts_at) }]} /></section>
    </>
  )}</Show></div>;
}

type VendorDetail = { vendor: { id: string; slug: string; display_name: string; city: string; timezone: string; published: boolean; bookings_enabled: boolean; created_at: string; min_notice_minutes: number; max_advance_days: number; owner_user_id: string | null; owner_email: string | null }; services: { id: string; name: string; price_paise: number; duration_minutes: number; advance_type: string; advance_value: number; active: boolean }[]; bookings: { id: string; status: string; starts_at: string; client_name: string; service_name: string | null }[] };
export function AdminVendorDetail({ id }: { id: string }) {
  const [state, reload] = useAdmin<VendorDetail>(`/v1/admin/vendors/${id}`);
  return <div className="grid gap-6"><Back href="/admin/vendors" label="Vendors" /><Show state={state} retry={() => void reload()}>{data => (
    <>
      <h1 className="text-2xl sm:text-4xl">{data.vendor.display_name}</h1>
      <Card><Facts rows={[["Page", <a key="p" href={`/${data.vendor.slug}`} target="_blank" rel="noreferrer">/{data.vendor.slug}</a>], ["Owner", data.vendor.owner_user_id ? <Link key="o" href={`/admin/users/${data.vendor.owner_user_id}`}>{data.vendor.owner_email}</Link> : "—"], ["Published", data.vendor.published ? "Yes" : "No"], ["Taking bookings", data.vendor.bookings_enabled ? "Yes" : "No"], ["Timezone", data.vendor.timezone], ["Notice / window", `${data.vendor.min_notice_minutes} min / ${data.vendor.max_advance_days} days`], ["Joined", when(data.vendor.created_at)]]} /></Card>
      <section className="grid gap-3"><h2 className="text-lg">Services</h2><AdminTable rows={data.services} rowKey={row => row.id} caption="Services" empty="No services." columns={[{ label: "Service", render: row => row.name }, { label: "Price", render: row => formatINR(row.price_paise) }, { label: "Length", render: row => `${row.duration_minutes} min` }, { label: "Advance", render: row => `${row.advance_type} ${row.advance_value}` }, { label: "Active", render: row => row.active ? "yes" : "no" }]} /></section>
      <section className="grid gap-3"><h2 className="text-lg">Recent bookings</h2><AdminTable rows={data.bookings} rowKey={row => row.id} caption="Bookings" empty="No bookings." columns={[{ label: "Booking", render: row => <Link href={`/admin/bookings/${row.id}`}>{row.client_name}</Link> }, { label: "Status", render: row => <StatusBadge status={row.status} /> }, { label: "Service", render: row => row.service_name ?? "—" }, { label: "Starts", render: row => when(row.starts_at) }]} /></section>
    </>
  )}</Show></div>;
}

type WebhookDetail = { event_id: string; type: string; received_at: string; processed_at: string | null; error: string | null; needs_review: boolean; payload: unknown };
export function AdminWebhookDetail({ id }: { id: string }) {
  const [state, reload] = useAdmin<WebhookDetail>(`/v1/admin/webhooks/${encodeURIComponent(id)}`);
  return <div className="grid gap-6"><Back href="/admin/webhooks" label="Webhooks" /><Show state={state} retry={() => void reload()}>{data => (
    <>
      <h1 className="break-all text-2xl sm:text-4xl">{data.type}</h1>
      <Card><Facts rows={[["Event id", <span key="e" className="break-all font-mono text-xs">{data.event_id}</span>], ["Received", when(data.received_at)], ["Applied", when(data.processed_at)], ["Needs review", data.needs_review ? "Yes" : "No"], ["Error", data.error ?? "—"]]} /></Card>
      <Card><CardHeader title="Payload" description="As Razorpay sent it (trimmed after 90 days)." /><pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap break-all rounded-input bg-surface-muted p-3 font-mono text-xs">{JSON.stringify(data.payload, null, 2)}</pre></Card>
    </>
  )}</Show></div>;
}
