"use client";
import Link from "next/link";
import { ArrowLeft, ChevronDown, Download, FileText, Mail, Phone } from "lucide-react";
import { formatINR, tiersInWords } from "@bayana/shared";
import { env } from "@/env";
import { OfflinePaymentForm } from "@/components/booking/offline-payment-form";
import { formatDateTime } from "@/components/booking/time";
import { CancelBookingDialog, CompleteButton, RescheduleDialog } from "@/components/dashboard/booking-actions";
import { Gate, useVendorData } from "@/components/dashboard/load";
import type { BookingDetail, BookingEvent } from "@/components/dashboard/types";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, LoadingState, Money, Notice, Skeleton, StatusBadge } from "@/components/ui/display";

const statusWord: Record<string, string> = { HELD: "held", PENDING: "pending", CONFIRMED: "confirmed", COMPLETED: "completed", CANCELLED: "cancelled", EXPIRED: "expired", EXPIRED_PAID: "paid after expiry" };
const actorWord: Record<string, string> = { client: "Customer", customer: "Customer", vendor: "You", system: "Bayana", razorpay: "Razorpay" };
const paymentStatus: Record<string, string> = { created: "Checkout opened, not paid", authorized: "Authorised, confirming", failed: "Did not go through", captured: "Received", refunded: "Refunded", partially_refunded: "Partly refunded" };
const refundStatus: Record<string, string> = { pending: "Refund on its way", processed: "Refunded", failed: "Refund failed", manual: "You return this directly" };

function eventText(event: BookingEvent, timezone: string) {
  if (event.from_status === event.to_status && event.reason === "rescheduled") {
    const from = typeof event.meta.from_starts_at === "string" ? formatDateTime(event.meta.from_starts_at, timezone) : "";
    const to = typeof event.meta.to_starts_at === "string" ? formatDateTime(event.meta.to_starts_at, timezone) : "";
    return `Moved from ${from} to ${to}`;
  }
  return event.from_status ? `${statusWord[event.from_status] ?? event.from_status} → ${statusWord[event.to_status] ?? event.to_status}` : `Created as ${statusWord[event.to_status] ?? event.to_status}`;
}

/** SPEC 5.3 booking detail: timeline, payment ledger, contract, customer, and the vendor's actions. */
export function BookingDetailView({ id }: { id: string }) {
  const [state, reload] = useVendorData<BookingDetail>(`/v1/vendor/bookings/${id}`);
  const skeleton = <LoadingState label="Loading the booking…" className="grid gap-4"><Skeleton className="h-10 w-72" /><Skeleton className="h-40 rounded-card" /><Skeleton className="h-64 rounded-card" /></LoadingState>;
  return (
    <div className="grid gap-6">
      <Link href="/dashboard/bookings" className="inline-flex min-h-11 w-fit items-center gap-2 text-sm font-medium"><ArrowLeft className="size-4" aria-hidden />All bookings</Link>
      <Gate state={state} skeleton={skeleton} retry={() => void reload()} next={`/dashboard/bookings/${id}`}>{booking => (
        <>
          <div className="grid gap-2">
            <StatusBadge status={booking.status} className="w-fit" />
            <h1 className="text-2xl sm:text-4xl">{booking.client_name}</h1>
            <p className="text-muted">{booking.service_name ?? "Booking"} · {formatDateTime(booking.starts_at, booking.timezone)} ({booking.timezone})</p>
          </div>

          {(booking.actions.cancel || booking.actions.complete || booking.actions.reschedule) && <Card className="grid gap-3"><CardHeader title="Actions" className="mb-0" />
            <div className="flex flex-wrap gap-2">
              {booking.actions.complete && <CompleteButton booking={booking} onDone={() => void reload()} />}
              {booking.actions.reschedule && <RescheduleDialog booking={booking} onDone={() => void reload()} />}
              {booking.actions.cancel && <CancelBookingDialog booking={booking} onDone={() => void reload()} />}
            </div>
            {booking.status === "PENDING" && booking.paid_paise < booking.advance_paise && <Notice tone="info">{booking.payments_enabled ? `Waiting for the customer to pay the ${formatINR(booking.advance_paise - booking.paid_paise)} advance online.` : `Collect the ${formatINR(booking.advance_paise - booking.paid_paise)} advance and record it below to confirm this booking.`}{booking.hold_expires_at ? ` The time is held until ${formatDateTime(booking.hold_expires_at, booking.timezone)}.` : ""}</Notice>}
          </Card>}

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="grid content-start gap-6">
              <Card><CardHeader title="Money" />
                <dl className="grid gap-2 text-sm">
                  <div className="flex justify-between gap-4"><dt className="text-muted">Total</dt><dd><Money paise={booking.total_paise} /></dd></div>
                  <div className="flex justify-between gap-4"><dt className="text-muted">Advance</dt><dd><Money paise={booking.advance_paise} /></dd></div>
                  <div className="flex justify-between gap-4"><dt className="text-muted">Received</dt><dd><Money paise={booking.paid_paise} /></dd></div>
                  <div className="flex justify-between gap-4 border-t border-border pt-2 text-base font-semibold"><dt>Balance due</dt><dd><Money paise={booking.balance_due_paise} /></dd></div>
                </dl>
              </Card>

              <section aria-labelledby="ledger" className="grid gap-3"><h2 id="ledger" className="text-lg">Payments and refunds</h2>
                {booking.payments.length === 0 && booking.refunds.length === 0 ? <p className="rounded-card bg-surface-muted px-4 py-3 text-sm text-muted">No payments yet.</p> :
                  <ul className="grid divide-y divide-border rounded-card bg-surface ring-1 ring-border/70">
                    {booking.payments.map(payment => <li key={payment.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                      <span className="grid min-w-0"><span className="font-medium">{payment.kind === "advance" ? "Advance" : "Balance"} · {payment.provider === "offline" ? `offline${payment.method ? ` (${payment.method.replace("_", " ")})` : ""}` : `online${payment.method ? ` (${payment.method})` : ""}`}</span><span className="text-muted">{paymentStatus[payment.status] ?? payment.status} · {formatDateTime(payment.verified_at ?? payment.created_at, booking.timezone)}</span>{payment.note && <span className="text-muted">Note: {payment.note}</span>}</span>
                      <span className="flex items-center gap-1"><Money paise={payment.amount_paise} size="sm" />{payment.receipt && <Button asChild size="icon" variant="ghost"><a href={`${env.NEXT_PUBLIC_API_URL}/v1/bookings/${booking.id}/receipts/${payment.id}`} aria-label={`Download receipt for ${formatINR(payment.amount_paise)}`} rel="noreferrer"><Download aria-hidden /></a></Button>}</span>
                    </li>)}
                    {booking.refunds.map(refund => <li key={refund.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm"><span className="grid"><span className="font-medium">{refundStatus[refund.status] ?? refund.status}</span><span className="text-muted">{refund.reason}</span></span><Money paise={-refund.amount_paise} size="sm" className="text-danger" /></li>)}
                  </ul>}
              </section>
              {booking.actions.record_payment && <OfflinePaymentForm view={booking} onRecorded={() => void reload()} />}

              <section aria-labelledby="timeline" className="grid gap-3"><h2 id="timeline" className="text-lg">Timeline</h2>
                <ol className="grid gap-3 border-l-2 border-border pl-4">
                  {booking.events.map(event => <li key={`${event.to_status}-${event.created_at}`} className="relative grid text-sm"><span aria-hidden className="absolute -left-[1.4rem] top-1 size-3 rounded-full bg-primary ring-2 ring-surface" />
                    <span className="font-medium">{eventText(event, booking.timezone)}</span>
                    <span className="text-muted">{actorWord[event.actor] ?? event.actor} · {formatDateTime(event.created_at, booking.timezone)}</span>
                    {event.reason && event.reason !== "rescheduled" && <span className="text-muted">“{event.reason}”</span>}</li>)}
                </ol>
              </section>

              <section aria-labelledby="contract" className="grid gap-3"><h2 id="contract" className="text-lg">Contract</h2>
                {booking.contract ? <details className="group rounded-card bg-surface ring-1 ring-border/70">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-5 py-3"><span className="inline-flex items-center gap-2 font-medium"><FileText className="size-4" aria-hidden />Terms the customer agreed to</span><ChevronDown className="size-4 shrink-0 text-muted transition-transform group-open:rotate-180" aria-hidden /></summary>
                  <div className="grid gap-2 border-t border-border px-5 py-4"><pre className="max-h-96 overflow-y-auto whitespace-pre-wrap break-words font-sans text-sm">{booking.contract.body}</pre><p className="break-all text-xs text-muted">Agreed {formatDateTime(booking.contract.accepted_at, booking.timezone)}. SHA-256 {booking.contract.sha256}</p></div>
                </details> : <Notice tone="info">{booking.status === "HELD" ? "The customer hasn't agreed to the terms yet." : "No terms were agreed online for this booking (for example a booking you added yourself)."}</Notice>}
                <p className="text-sm text-muted">Cancellation: {tiersInWords(booking.cancellation_tiers)}</p>
              </section>
            </div>

            <aside className="grid content-start gap-6">
              <Card><CardHeader title="Customer" />
                <dl className="grid gap-3 text-sm">
                  <div className="grid"><dt className="text-muted">Name</dt><dd className="font-medium">{booking.customer.name}</dd></div>
                  <div className="grid"><dt className="text-muted">Email</dt><dd><a href={`mailto:${booking.customer.email}`} className="inline-flex min-h-11 items-center gap-2 break-all"><Mail className="size-4 shrink-0" aria-hidden />{booking.customer.email}</a></dd></div>
                  {booking.customer.phone && <div className="grid"><dt className="text-muted">Phone</dt><dd><a href={`tel:${booking.customer.phone}`} className="inline-flex min-h-11 items-center gap-2"><Phone className="size-4" aria-hidden />{booking.customer.phone}</a></dd></div>}
                  {booking.customer.notes && <div className="grid"><dt className="text-muted">Notes</dt><dd className="whitespace-pre-wrap">{booking.customer.notes}</dd></div>}
                  {booking.customer.referral && <div className="grid"><dt className="text-muted">Heard about you from</dt><dd>{booking.customer.referral}</dd></div>}
                  <div className="grid"><dt className="text-muted">Booked</dt><dd>{formatDateTime(booking.created_at, booking.timezone)}</dd></div>
                </dl>
              </Card>
              <p className="break-all text-xs text-muted">Booking id {booking.id}</p>
            </aside>
          </div>
        </>
      )}</Gate>
    </div>
  );
}
