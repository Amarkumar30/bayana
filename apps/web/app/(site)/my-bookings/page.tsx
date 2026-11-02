"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CalendarDays, Download, LogOut } from "lucide-react";
import { MY_BOOKINGS_PATH, timezoneLabel } from "@bayana/shared";
import { GoogleButton } from "@/components/auth/google-button";
import { formatBookingWhen, formatDate, type DailyFields } from "@/components/booking/time";
import { PageHeader } from "@/components/layout/brand";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Card, CardHeader, EmptyState, LoadingState, Money, Notice, Skeleton, StatusBadge } from "@/components/ui/display";
import { Field, Input } from "@/components/ui/field";
import { ApiError, api, humanMessage, vendorMessage } from "@/lib/api";

type ClientBooking = DailyFields & { id: string; starts_at: string; timezone: string; service_name: string | null; status: string; slug: string; display_name: string;
  total_paise: string | number; paid_paise: string | number; balance_due_paise: string | number; terms_accepted_at: string | null };
type Me = { email: string; role: string };
const finished = new Set(["CANCELLED", "EXPIRED", "EXPIRED_PAID", "COMPLETED"]);
/** Still to come: not finished, and not over yet. */
const upcoming = (booking: ClientBooking) => !finished.has(booking.status) && new Date(booking.ends_at ?? booking.starts_at).getTime() > Date.now();

/**
 * The signed-in person's bookings as a customer, across businesses: upcoming first (soonest first), then past (latest first).
 * The session lasts (30 days from the last visit), so a customer who comes back later is still signed in. Signed out, it
 * offers the customer sign-in only: nothing here can create a business account. Plus privacy rights (PV-02) for customers.
 */
export default function MyBookings() {
  const [data, setData] = useState<{ bookings: ClientBooking[]; me: Me }>(); const [error, setError] = useState<{ signIn: boolean; message: string }>();
  const load = useCallback(() => Promise.all([api<{ bookings: ClientBooking[] }>("/v1/client/bookings"), api<{ user: Me }>("/v1/auth/me")])
    .then(([list, me]) => setData({ bookings: list.bookings, me: me.user }))
    .catch(failure => setError({ signIn: failure instanceof ApiError && failure.status === 401, message: humanMessage(failure) })), []);
  useEffect(() => { void load(); }, [load]);

  if (error?.signIn) return (
    <EmptyState icon={<CalendarDays />} title="Sign in to see your bookings" description="Use the email you booked with. You stay signed in on this device for 30 days."
      action={<div className="grid w-full max-w-sm gap-3"><GoogleButton intent="customer" next={MY_BOOKINGS_PATH} label="See my bookings with Google" /><Button asChild variant="secondary"><Link href={`/login?next=${encodeURIComponent(MY_BOOKINGS_PATH)}`}>Use an email code instead</Link></Button></div>} />
  );
  if (error) return <div className="grid gap-3"><Notice tone="danger">{error.message}</Notice><Button variant="secondary" className="w-fit" onClick={() => { setError(undefined); void load(); }}>Try again</Button></div>;
  if (!data) return <LoadingState label="Loading your bookings…" className="grid gap-3"><Skeleton className="h-9 w-48" />{[0, 1, 2].map(index => <Skeleton key={index} className="h-28 rounded-card" />)}</LoadingState>;
  const soon = data.bookings.filter(upcoming), past = data.bookings.filter(booking => !upcoming(booking)).reverse();
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageHeader eyebrow="Your account" title="My bookings" description={`Signed in as ${data.me.email}`} />
        <SignOut />
      </div>
      {data.me.role !== "CLIENT" && <Notice tone="info">These are the bookings you made as a customer. <Link href="/dashboard">Go to your business dashboard</Link>.</Notice>}
      {data.bookings.length === 0 ? <EmptyState icon={<CalendarDays />} title="No bookings yet" description={`Bookings made with ${data.me.email} appear here. When you book through a business's Bayana link, you'll find it here.`} /> : <>
        <BookingList title="Upcoming" bookings={soon} empty="Nothing coming up." />
        <BookingList title="Past" bookings={past} empty="No past bookings." />
      </>}
      {data.me.role === "CLIENT" && <YourData />}
    </div>
  );
}

function BookingList({ title, bookings, empty }: { title: string; bookings: ClientBooking[]; empty: string }) {
  return (
    <section aria-labelledby={`list-${title}`} className="grid gap-3">
      <h2 id={`list-${title}`} className="text-lg">{title}</h2>
      {bookings.length === 0 ? <p className="text-sm text-muted">{empty}</p> : <ul className="grid gap-3">{bookings.map(booking => (
        <li key={booking.id}><Card className="grid gap-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="grid gap-0.5"><Link href={`/${booking.slug}`} className="font-semibold text-ink">{booking.display_name}</Link>
              <span className="text-sm text-muted">{booking.service_name ? `${booking.service_name} · ` : ""}{formatBookingWhen(booking, booking.timezone)} ({timezoneLabel(booking.timezone)})</span></div>
            <StatusBadge status={booking.status} />
          </div>
          <dl className="grid grid-cols-3 gap-2 text-sm">
            <div className="grid"><dt className="text-muted">Price</dt><dd><Money paise={booking.total_paise} size="sm" /></dd></div>
            <div className="grid"><dt className="text-muted">Paid</dt><dd><Money paise={booking.paid_paise} size="sm" /></dd></div>
            <div className="grid"><dt className="text-muted">Balance</dt><dd><Money paise={booking.balance_due_paise} size="sm" className="font-semibold" /></dd></div>
          </dl>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-sm">
            <span className="text-muted">{booking.terms_accepted_at ? `Terms agreed on ${formatDate(booking.terms_accepted_at, booking.timezone)}` : "Terms not agreed yet"}</span>
            <Link href={`/b/${booking.id}`} className="inline-flex min-h-11 items-center font-medium">View booking and terms</Link>
          </div>
        </Card></li>
      ))}</ul>}
    </section>
  );
}

function SignOut() {
  const [busy, setBusy] = useState(false);
  const signOut = async () => { setBusy(true); try { await api("/v1/auth/logout", { method: "POST" }); } finally { window.location.assign("/"); } };
  return <Button variant="secondary" loading={busy} loadingText="Signing out…" onClick={() => void signOut()}><LogOut aria-hidden />Sign out</Button>;
}

function YourData() {
  const [busy, setBusy] = useState(""); const [error, setError] = useState(""); const [confirm, setConfirm] = useState("");
  const download = async () => {
    setBusy("export"); setError("");
    try {
      const data = await api<Record<string, unknown>>("/v1/client/export");
      const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })); link.download = "bayana-my-data.json"; link.click(); URL.revokeObjectURL(link.href);
    } catch (failure) { setError(humanMessage(failure)); } finally { setBusy(""); }
  };
  const erase = async () => {
    setBusy("delete"); setError("");
    try { await api("/v1/client/delete", { body: { confirm: "DELETE" } }); window.location.assign("/"); } catch (failure) { setError(vendorMessage(failure)); setBusy(""); }
  };
  return (
    <Card className="grid gap-3"><CardHeader title="Your data" description="Download everything Bayana holds about you, or erase it." />
      {error && <Notice tone="danger">{error}</Notice>}
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" loading={busy === "export"} loadingText="Preparing…" onClick={() => void download()}><Download aria-hidden />Download my data</Button>
        <Dialog><DialogTrigger asChild><Button variant="ghost">Delete my data</Button></DialogTrigger>
          <DialogContent title="Delete your data?" description="Your name, email, phone and notes are removed from all your bookings and you are signed out. Payment and refund records stay, without your details, because tax law requires them. This can't be undone.">
            <Notice tone="warning">If a booking is still coming up, cancel it first (or ask the business to).</Notice>
            <Field label="Type DELETE to confirm">{props => <Input {...props} value={confirm} autoComplete="off" onChange={event => setConfirm(event.target.value)} />}</Field>
            {error && <Notice tone="danger">{error}</Notice>}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><DialogClose asChild><Button variant="secondary">Keep my data</Button></DialogClose><Button variant="danger" disabled={confirm !== "DELETE"} loading={busy === "delete"} loadingText="Deleting…" onClick={() => void erase()}>Delete for good</Button></div>
          </DialogContent>
        </Dialog>
      </div>
    </Card>
  );
}
