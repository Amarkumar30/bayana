"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CalendarDays, Download } from "lucide-react";
import { formatDateTime } from "@/components/booking/time";
import { PageHeader } from "@/components/layout/brand";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Card, CardHeader, EmptyState, LoadingState, Money, Notice, Skeleton, StatusBadge } from "@/components/ui/display";
import { Field, Input } from "@/components/ui/field";
import { ApiError, api, humanMessage, vendorMessage } from "@/lib/api";

type ClientBooking = { id: string; starts_at: string; timezone: string; service_name: string | null; status: string; display_name: string; balance_due_paise: string | number };

/** A customer's bookings across businesses, plus their privacy rights: download or erase their data (PV-02). */
export default function MyBookings() {
  const [data, setData] = useState<{ bookings: ClientBooking[] }>(); const [error, setError] = useState<{ signIn: boolean; message: string }>();
  const load = useCallback(() => api<{ bookings: ClientBooking[] }>("/v1/client/bookings").then(setData).catch(failure => setError({ signIn: failure instanceof ApiError && failure.status === 401, message: humanMessage(failure) })), []);
  useEffect(() => { void load(); }, [load]);

  if (error?.signIn) return <EmptyState icon={<CalendarDays />} title="Sign in to view your bookings" description="Use the email you booked with. We'll send you a one-time code." action={<Button asChild><Link href="/login?next=/my-bookings">Sign in with an email code</Link></Button>} />;
  if (error) return <div className="grid gap-3"><Notice tone="danger">{error.message}</Notice><Button variant="secondary" className="w-fit" onClick={() => { setError(undefined); void load(); }}>Try again</Button></div>;
  if (!data) return <LoadingState label="Loading bookings…" className="grid gap-3"><Skeleton className="h-9 w-48" />{[0, 1, 2].map(index => <Skeleton key={index} className="h-20 rounded-card" />)}</LoadingState>;
  return (
    <div className="grid gap-6">
      <PageHeader eyebrow="Your account" title="Your bookings" />
      {data.bookings.length === 0 ? <EmptyState icon={<CalendarDays />} title="You have no bookings yet" description="When you book a service through a Bayana link, it will appear here." /> :
        <ul className="grid gap-3">{data.bookings.map(booking => <li key={booking.id}><Link className="flex flex-wrap items-center justify-between gap-3 rounded-card bg-surface p-4 text-ink no-underline shadow-soft ring-1 ring-border/70 hover:ring-primary/40" href={`/b/${booking.id}`}>
          <div className="grid gap-0.5"><strong>{booking.display_name}</strong><span className="text-sm text-muted">{booking.service_name ? `${booking.service_name} · ` : ""}{formatDateTime(booking.starts_at, booking.timezone)}</span></div>
          <div className="flex items-center gap-3"><StatusBadge status={booking.status} /><span className="text-sm"><Money paise={booking.balance_due_paise} className="font-semibold" /> due</span></div>
        </Link></li>)}</ul>}
      <YourData />
    </div>
  );
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
