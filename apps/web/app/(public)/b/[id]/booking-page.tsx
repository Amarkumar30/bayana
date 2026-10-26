"use client";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { CalendarX2, ChevronDown, Download, FileText } from "lucide-react";
import { describeRefund, formatINR, tiersInWords } from "@bayana/shared";
import { env } from "@/env";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, EmptyState, LoadingState, Money, Notice, Skeleton, StatusBadge } from "@/components/ui/display";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { OfflinePaymentForm } from "@/components/booking/offline-payment-form";
import { PaymentPanel } from "@/components/booking/payment-panel";
import { HoldCountdown } from "@/components/booking/countdown";
import { formatBookingWhen, formatDate, formatDateTime, formatTime } from "@/components/booking/time";
import { tokenHeaders, type BookingView } from "@/components/booking/types";
import { ApiError, api, humanMessage } from "@/lib/api";

const headline: Record<string, string> = {
  HELD: "Finish your booking", PENDING: "Request received", CONFIRMED: "Your booking is confirmed", COMPLETED: "Completed",
  CANCELLED: "Booking cancelled", EXPIRED: "This hold has expired", EXPIRED_PAID: "Payment arrived after the hold expired"
};
const stepLabel: Record<string, string> = { HELD: "Time held for 15 minutes", PENDING: "Terms agreed", CONFIRMED: "Booking confirmed", COMPLETED: "Completed", CANCELLED: "Cancelled", EXPIRED: "Hold expired", EXPIRED_PAID: "Paid after expiry" };
const paymentLabel: Record<string, string> = { created: "Started, not paid", authorized: "Authorised, confirming", failed: "Did not go through", captured: "Paid", refunded: "Refunded", partially_refunded: "Partly refunded" };
const refundLabel: Record<string, string> = { pending: "Refund on its way", processed: "Refunded", failed: "Refund failed; we're looking into it", manual: "To be returned by the business directly" };
const methodLabel: Record<string, string> = { card: "card", upi: "UPI", netbanking: "net banking", wallet: "wallet", cash: "cash", bank_transfer: "bank transfer", other: "other" };
const paymentTitle = (payment: BookingView["payments"][number]) => `${payment.kind === "advance" ? "Advance" : "Balance"} · ${payment.provider === "offline" ? "paid to the business" : "paid online"}${payment.method ? ` (${methodLabel[payment.method] ?? payment.method})` : ""}`;

export function BookingSkeleton() {
  return <LoadingState label="Loading your booking…" className="grid gap-4"><Skeleton className="h-6 w-28" /><Skeleton className="h-10 w-3/4" /><Skeleton className="h-40 rounded-card" /><Skeleton className="h-32 rounded-card" /></LoadingState>;
}

/** SPEC 5.2 customer booking page: status, timeline, contract, payment history, cancel with a refund preview. */
export function BookingPage() {
  const { id } = useParams<{ id: string }>(); const token = useSearchParams().get("t");
  const [view, setView] = useState<BookingView>(); const [error, setError] = useState<{ title: string; description: string }>();
  const load = useCallback(() => api<BookingView>(`/v1/bookings/${id}`, { headers: tokenHeaders(token) }).then(value => { setView(value); setError(undefined); }).catch(failure => setError(failure instanceof ApiError && failure.status === 404
    ? { title: "We couldn't find this booking", description: "Booking links are private. Open the link from your email again, or sign in with the email you booked with." }
    : { title: "Your booking didn't load", description: humanMessage(failure) })), [id, token]);
  useEffect(() => { void load(); }, [load]);
  // While a payment may still be confirming, refresh quietly.
  useEffect(() => { if (view?.status !== "PENDING" || !view.payments_enabled) return; const timer = setInterval(() => void load(), 5000); return () => clearInterval(timer); }, [view?.status, view?.payments_enabled, load]);
  const expire = useCallback(() => setView(current => current ? { ...current, status: "EXPIRED", contract_preview: null } : current), []);

  if (error) return <EmptyState icon={<CalendarX2 />} title={error.title} description={error.description} action={<div className="flex flex-wrap justify-center gap-2"><Button asChild><Link href="/login?next=/my-bookings">Sign in</Link></Button><Button variant="secondary" onClick={() => void load()}>Try again</Button></div>} />;
  if (!view) return <BookingSkeleton />;
  const finishHref = `/${view.vendor.slug}/book?resume=${view.id}${token ? `&t=${encodeURIComponent(token)}` : ""}`;
  return (
    <div className="grid gap-6">
      <div className="flex items-center gap-3"><Avatar name={view.vendor.display_name} /><div className="grid"><span className="text-sm text-muted">Your booking with</span><Link href={`/${view.vendor.slug}`} className="font-semibold text-ink">{view.vendor.display_name}</Link></div></div>
      <div className="grid gap-2">
        <StatusBadge status={view.status} className="w-fit" />
        <h1 className="text-2xl sm:text-4xl">{headline[view.status] ?? "Your booking"}</h1>
        <p className="text-muted">{view.service_name} · {formatBookingWhen(view, view.timezone)} ({view.timezone})</p>
      </div>
      <StatusHelp view={view} token={token} finishHref={finishHref} onExpire={expire} onPaid={setView} />

      <Card><CardHeader title="Payment summary" />
        <dl className="grid gap-2 text-sm">
          <div className="flex justify-between gap-4"><dt className="text-muted">Total</dt><dd><Money paise={view.total_paise} /></dd></div>
          <div className="flex justify-between gap-4"><dt className="text-muted">Advance</dt><dd><Money paise={view.advance_paise} /></dd></div>
          <div className="flex justify-between gap-4"><dt className="text-muted">Paid so far</dt><dd><Money paise={view.paid_paise} /></dd></div>
          <div className="flex justify-between gap-4 border-t border-border pt-2 text-base font-semibold"><dt>Balance due</dt><dd><Money paise={view.balance_due_paise} /></dd></div>
        </dl>
      </Card>

      <section aria-labelledby="timeline" className="grid gap-3"><h2 id="timeline" className="text-lg">Timeline</h2>
        <ol className="grid gap-3 border-l-2 border-border pl-4">
          {view.timeline.map(event => <li key={`${event.to_status}-${event.created_at}`} className="relative grid text-sm"><span aria-hidden className="absolute -left-[1.4rem] top-1 size-3 rounded-full bg-success ring-2 ring-surface" /><span className="font-medium">{stepLabel[event.to_status] ?? event.to_status}</span><span className="text-muted">{formatDateTime(event.created_at, view.timezone)}</span></li>)}
          {view.status === "EXPIRED" && view.timeline.at(-1)?.to_status !== "EXPIRED" && <li className="relative grid text-sm"><span aria-hidden className="absolute -left-[1.4rem] top-1 size-3 rounded-full bg-border ring-2 ring-surface" /><span className="font-medium">Hold expired</span>{view.hold_expires_at && <span className="text-muted">{formatDateTime(view.hold_expires_at, view.timezone)}</span>}</li>}
        </ol>
      </section>

      <section aria-labelledby="contract" className="grid gap-3"><h2 id="contract" className="text-lg">Contract</h2>
        {view.contract ? <details className="group rounded-card bg-surface ring-1 ring-border/70">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-5 py-3"><span className="inline-flex items-center gap-2 font-medium"><FileText className="size-4" aria-hidden />Terms you agreed to on {formatDate(view.contract.accepted_at, view.timezone)}</span><ChevronDown className="size-4 shrink-0 text-muted transition-transform group-open:rotate-180" aria-hidden /></summary>
          <div className="grid gap-2 border-t border-border px-5 py-4"><pre className="max-h-96 overflow-y-auto whitespace-pre-wrap break-words font-sans text-sm" data-testid="contract-text">{view.contract.body}</pre><p className="break-all text-xs text-muted">Agreed {formatDateTime(view.contract.accepted_at, view.timezone)}. SHA-256 {view.contract.sha256}</p></div>
        </details> : <Notice tone="info">{view.status === "HELD" ? "You haven't agreed to the terms yet." : "No terms were agreed for this booking."}</Notice>}
      </section>

      <section aria-labelledby="payments" className="grid gap-3"><h2 id="payments" className="text-lg">Payment history</h2>
        {view.payments.length === 0 ? <Notice tone="info">{view.payments_enabled ? "No payments yet. Your advance will appear here once it's verified." : `No payments yet. Online payment isn't switched on for ${view.vendor.display_name}; they will arrange the advance with you directly.`}</Notice> :
          <ul className="grid divide-y divide-border rounded-card bg-surface ring-1 ring-border/70">{view.payments.map(payment => <li key={payment.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm"><span className="grid min-w-0"><span className="font-medium">{paymentTitle(payment)}</span><span className="text-muted">{paymentLabel[payment.status] ?? payment.status} · {formatDateTime(payment.verified_at ?? payment.created_at, view.timezone)}</span>{payment.note && <span className="text-muted">Note: {payment.note}</span>}</span><span className="flex items-center gap-1"><Money paise={payment.amount_paise} size="sm" />{payment.receipt && <Button asChild size="icon" variant="ghost"><a href={`${env.NEXT_PUBLIC_API_URL}/v1/bookings/${view.id}/receipts/${payment.id}${token ? `?t=${encodeURIComponent(token)}` : ""}`} aria-label={`Download receipt for ${formatINR(payment.amount_paise)}`} rel="noreferrer"><Download aria-hidden /></a></Button>}</span></li>)}</ul>}
        {view.refunds.length > 0 && <ul className="grid gap-1 text-sm">{view.refunds.map(refund => <li key={refund.id} className="flex flex-wrap justify-between gap-2 rounded-input bg-surface-muted px-4 py-2"><span>{refundLabel[refund.status] ?? refund.status}</span><Money paise={refund.amount_paise} size="sm" /></li>)}</ul>}
      </section>

      {view.viewer === "customer" && (view.can_cancel ? <CancelCard view={view} token={token} onCancelled={setView} /> : null)}
      {view.viewer === "vendor" && ["PENDING", "CONFIRMED", "COMPLETED"].includes(view.status) && view.balance_due_paise > 0 && <OfflinePaymentForm view={view} onRecorded={() => void load()} />}
    </div>
  );
}

function StatusHelp({ view, token, finishHref, onExpire, onPaid }: { view: BookingView; token: string | null; finishHref: string; onExpire: () => void; onPaid: (view: BookingView) => void }) {
  if (view.status === "HELD" && view.hold_expires_at) return (
    <div className="grid gap-3"><HoldCountdown until={view.hold_expires_at} onExpire={onExpire} /><Button asChild size="lg"><Link href={finishHref}>Read the terms and finish</Link></Button></div>
  );
  if (view.status === "PENDING" && !view.payments_enabled) return <Notice tone="info">{view.vendor.display_name} has your request and will contact you to arrange the advance.{view.hold_expires_at ? ` Your time is reserved until ${formatDate(view.hold_expires_at, view.timezone)}, ${formatTime(view.hold_expires_at, view.timezone)}.` : ""}</Notice>;
  if (view.status === "PENDING" && view.can_pay && view.viewer === "customer") return (
    <Card className="grid gap-3">
      {view.hold_expires_at && <HoldCountdown until={view.hold_expires_at} onExpire={onExpire} />}
      <p className="text-sm text-muted">Pay the {formatINR(view.advance_paise - view.paid_paise)} advance to confirm. It is confirmed only once the payment is verified.</p>
      <PaymentPanel bookingId={view.id} token={token} amountPaise={view.advance_paise - view.paid_paise} businessName={view.vendor.display_name} onSettled={onPaid} />
    </Card>
  );
  if (view.status === "PENDING") return <Notice tone="warning">Waiting for the payment to be verified. This page updates by itself.</Notice>;
  if (view.status === "EXPIRED") return <Notice tone="warning">The time was released because the booking wasn't finished in time. Nothing was charged. <Link href={`/${view.vendor.slug}/book`}>Book again</Link>.</Notice>;
  return null;
}

function CancelCard({ view, token, onCancelled }: { view: BookingView; token: string | null; onCancelled: (view: BookingView) => void }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [open, setOpen] = useState(false);
  const refund = view.refund_preview ?? { refund_paise: 0, refund_percent: 0, paid_paise: 0 };
  const cancel = async () => {
    setBusy(true); setError("");
    try { onCancelled(await api<BookingView>(`/v1/bookings/${view.id}/cancel`, { body: {}, headers: tokenHeaders(token) })); setOpen(false); }
    catch (failure) { setError(humanMessage(failure)); } finally { setBusy(false); }
  };
  return (
    <Card className="grid gap-3">
      <CardHeader title="Need to cancel?" description={tiersInWords(view.cancellation_tiers)} />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild><Button variant="secondary" className="w-fit">Cancel booking</Button></DialogTrigger>
        <DialogContent title="Cancel this booking?" description={`${view.service_name}, ${formatBookingWhen(view, view.timezone)}`}>
          <Notice tone={refund.refund_paise > 0 || refund.paid_paise === 0 ? "info" : "warning"}>{describeRefund(refund)}</Notice>
          {error && <Notice tone="danger">{error}</Notice>}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><DialogClose asChild><Button variant="secondary">Keep my booking</Button></DialogClose><Button variant="danger" loading={busy} loadingText="Cancelling…" onClick={() => void cancel()}>Yes, cancel</Button></div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
