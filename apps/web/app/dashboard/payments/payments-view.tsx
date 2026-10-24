"use client";
import Link from "next/link";
import { Wallet } from "lucide-react";
import { PageHeader } from "@/components/layout/brand";
import { formatDate, formatDateTime } from "@/components/booking/time";
import { bookingHref } from "@/components/dashboard/booking-list";
import { Gate, useVendorData } from "@/components/dashboard/load";
import type { PaymentsData } from "@/components/dashboard/types";
import { Badge, Card, CardHeader, EmptyState, LoadingState, Money, Notice, Skeleton, Table, Td, Th } from "@/components/ui/display";

const statusWord: Record<string, string> = { captured: "Received", refunded: "Refunded", partially_refunded: "Partly refunded", authorized: "Confirming", failed: "Failed" };
const refundWord: Record<string, string> = { pending: "On its way", processed: "Refunded", failed: "Failed", manual: "You return it" };
const methodWord = (method: string | null, provider: string) => `${provider === "offline" ? "Offline" : "Online"}${method ? ` · ${method.replace("_", " ")}` : ""}`;

/** SPEC 5.3 payments: totals, balances due, the payment ledger and refunds; online money settles straight to the vendor. */
export function PaymentsView() {
  const [state, reload] = useVendorData<PaymentsData>("/v1/vendor/payments");
  const skeleton = <LoadingState label="Loading payments…" className="grid gap-4"><div className="grid gap-4 sm:grid-cols-3"><Skeleton className="h-24 rounded-card" /><Skeleton className="h-24 rounded-card" /><Skeleton className="h-24 rounded-card" /></div><Skeleton className="h-64 rounded-card" /></LoadingState>;
  return (
    <>
      <PageHeader eyebrow="Payments" title="Money in and out" description="Every advance, balance and refund, recorded once." />
      <Gate state={state} skeleton={skeleton} retry={() => void reload()} next="/dashboard/payments">{data => { const tz = data.timezone; return (
        <div className="grid gap-6">
          <Notice tone="info">{data.payout.mode === "razorpay_direct" ? "Online advances are paid into your own Razorpay account; Bayana never holds your money. Payout timing follows your Razorpay settlement schedule." : "Online payments are off. Record cash, UPI or bank transfers on each booking; they appear here."}</Notice>
          <dl className="grid gap-4 sm:grid-cols-3">
            <Card className="grid gap-1"><dt className="text-sm text-muted">Received</dt><dd><Money paise={data.summary.received_paise} size="xl" /></dd><dd className="text-xs text-muted">Online <Money paise={data.summary.online_paise} size="sm" /> · offline <Money paise={data.summary.offline_paise} size="sm" /></dd></Card>
            <Card className="grid gap-1"><dt className="text-sm text-muted">Balances still due</dt><dd><Money paise={data.summary.balance_due_paise} size="xl" /></dd><dd className="text-xs text-muted">On confirmed and completed bookings</dd></Card>
            <Card className="grid gap-1"><dt className="text-sm text-muted">Refunded</dt><dd><Money paise={data.summary.refunded_paise} size="xl" /></dd>{data.summary.owed_by_you_paise > 0 ? <dd className="text-xs text-danger">You still return <Money paise={data.summary.owed_by_you_paise} size="sm" /> directly</dd> : <dd className="text-xs text-muted">Through Razorpay</dd>}</Card>
          </dl>

          {data.balances_due.length > 0 && <Card><CardHeader title="Balances due" description="Collect these on the day or as agreed, then record them on the booking." />
            <ul className="grid divide-y divide-border">{data.balances_due.map(row => <li key={row.id}><Link href={bookingHref(row.id)} className="flex min-h-11 flex-wrap items-center justify-between gap-2 py-2 text-sm text-ink no-underline hover:text-primary"><span className="grid"><span className="font-medium">{row.client_name}</span><span className="text-muted">{row.service_name ?? "Booking"} · {formatDate(row.starts_at, tz, "short")}</span></span><Money paise={row.balance_due_paise} size="sm" /></Link></li>)}</ul>
          </Card>}

          <section aria-labelledby="ledger" className="grid gap-3"><h2 id="ledger" className="text-lg">Payments</h2>
            {data.payments.length === 0 ? <EmptyState icon={<Wallet />} title="No payments recorded yet" description="Advances appear here when a customer pays online or when you record an offline payment on a booking." /> : <>
              <ul className="grid gap-3 md:hidden" aria-label="Payments">{data.payments.map(payment => <li key={payment.id}><Link href={bookingHref(payment.booking_id)} className="grid gap-1 rounded-card bg-surface p-4 text-sm text-ink no-underline shadow-soft ring-1 ring-border/70">
                <span className="flex items-start justify-between gap-2"><span className="font-medium">{payment.client_name}</span><Money paise={payment.amount_paise} size="sm" className="font-semibold" /></span>
                <span className="text-muted">{payment.kind === "advance" ? "Advance" : "Balance"} · {methodWord(payment.method, payment.provider)}</span>
                <span className="flex items-center justify-between gap-2 text-muted"><span>{formatDateTime(payment.verified_at ?? payment.created_at, tz)}</span><Badge tone={payment.verified_at ? "success" : "warning"}>{statusWord[payment.status] ?? payment.status}</Badge></span>
              </Link></li>)}</ul>
              <div className="hidden md:block"><Table><caption className="sr-only">Payments</caption><thead><tr><Th>Date</Th><Th>Customer</Th><Th>For</Th><Th>How</Th><Th>Status</Th><Th className="text-right">Amount</Th></tr></thead><tbody>{data.payments.map(payment => (
                <tr key={payment.id}><Td className="whitespace-nowrap text-muted">{formatDateTime(payment.verified_at ?? payment.created_at, tz)}</Td><Td><Link href={bookingHref(payment.booking_id)} className="font-medium">{payment.client_name}</Link><span className="block text-xs text-muted">{payment.service_name}</span></Td><Td>{payment.kind === "advance" ? "Advance" : "Balance"}</Td><Td className="text-muted">{methodWord(payment.method, payment.provider)}</Td><Td><Badge tone={payment.verified_at ? "success" : "warning"}>{statusWord[payment.status] ?? payment.status}</Badge></Td><Td className="text-right"><Money paise={payment.amount_paise} size="sm" className="font-semibold" /></Td></tr>
              ))}</tbody></Table></div>
            </>}
          </section>

          {data.refunds.length > 0 && <section aria-labelledby="refunds" className="grid gap-3"><h2 id="refunds" className="text-lg">Refunds</h2>
            <ul className="grid divide-y divide-border rounded-card bg-surface ring-1 ring-border/70">{data.refunds.map(refund => <li key={refund.id}><Link href={bookingHref(refund.booking_id)} className="flex min-h-11 flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm text-ink no-underline hover:bg-surface-muted">
              <span className="grid"><span className="font-medium">{refund.client_name}</span><span className="text-muted">{refund.reason}</span><span className="text-xs text-muted">{formatDateTime(refund.processed_at ?? refund.created_at, tz)}</span></span>
              <span className="flex items-center gap-2"><Badge tone={refund.status === "processed" ? "success" : refund.status === "failed" || refund.status === "manual" ? "danger" : "warning"}>{refundWord[refund.status] ?? refund.status}</Badge><Money paise={refund.amount_paise} size="sm" /></span>
            </Link></li>)}</ul>
          </section>}
        </div>
      ); }}</Gate>
    </>
  );
}
