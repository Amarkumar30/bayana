"use client";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/dialog";
import { Money, StatusBadge } from "@/components/ui/display";

type Booking = { customer: string; service: string; date: string; time: string; status: string; total: number; paid: number };
const timeline = (status: string) => [
  { label: "Email verified", done: true }, { label: "Slot held for 15 minutes", done: true },
  { label: "Terms accepted", done: status !== "held" }, { label: "Advance verified", done: ["confirmed", "completed"].includes(status) },
  { label: "Completed", done: status === "completed" }
];

/** Preview of the booking detail: a side sheet on desktop, a bottom sheet on phones. */
export function BookingDetailSheet({ booking }: { booking: Booking }) {
  return (
    <Sheet>
      <SheetTrigger asChild><Button size="sm" variant="secondary">View</Button></SheetTrigger>
      <SheetContent title={booking.customer} description={`${booking.service} · ${booking.date}, ${booking.time}`}>
        <StatusBadge status={booking.status} className="w-fit" />
        <dl className="grid gap-2 rounded-input bg-surface-muted p-4 text-sm">
          <div className="flex justify-between"><dt className="text-muted">Total</dt><dd><Money paise={booking.total} size="sm" /></dd></div>
          <div className="flex justify-between"><dt className="text-muted">Paid</dt><dd><Money paise={booking.paid} size="sm" /></dd></div>
          <div className="flex justify-between border-t border-border pt-2 font-semibold"><dt>Balance due</dt><dd><Money paise={booking.total - booking.paid} size="sm" /></dd></div>
        </dl>
        <section aria-labelledby="timeline-title"><h3 id="timeline-title" className="mb-3 text-sm font-semibold">Timeline</h3>
          <ol className="grid gap-3 border-l-2 border-border pl-4">{timeline(booking.status).map(item => <li key={item.label} className="relative text-sm"><span aria-hidden className={`absolute -left-[1.4rem] top-1 size-3 rounded-full ring-2 ring-surface ${item.done ? "bg-success" : "bg-border"}`} /><span className={item.done ? "text-ink" : "text-muted"}>{item.label}</span><span className="sr-only">{item.done ? " (done)" : " (not yet)"}</span></li>)}</ol>
        </section>
        <div className="mt-auto grid gap-2"><Button disabled aria-describedby="offline-advance-note">Record offline advance</Button><p id="offline-advance-note" className="text-xs text-muted">Online payments are off, so customers pay you directly. Recording that advance here (and confirming the booking) arrives with the payments update.</p><Button variant="danger" disabled>Cancel booking</Button><p className="text-xs text-muted">Cancelling from the dashboard is not available yet.</p></div>
      </SheetContent>
    </Sheet>
  );
}
