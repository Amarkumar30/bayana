"use client";
import Link from "next/link";
import { useState } from "react";
import { AlertTriangle, CalendarCheck2, CheckCircle2, Copy, ExternalLink, HandCoins, Undo2 } from "lucide-react";
import { formatINR } from "@bayana/shared";
import { PageHeader } from "@/components/layout/brand";
import { BookingList } from "@/components/dashboard/booking-list";
import { NewBookingDialog } from "@/components/dashboard/booking-actions";
import { Gate, useVendorData } from "@/components/dashboard/load";
import type { Overview, TodoKind } from "@/components/dashboard/types";
import { formatBookingTime, formatDate, formatTime, localDateKey } from "@/components/booking/time";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, EmptyState, LoadingState, Money, Notice, Skeleton } from "@/components/ui/display";
import { useToast } from "@/components/ui/toast";
import { ChecklistCard } from "@/components/vendor/checklist-card";
import type { Checklist, Profile } from "@/components/vendor/types";
import { ApiError, api, humanMessage, requirementCopy } from "@/lib/api";
import { vendorLinkLabel, vendorUrl } from "@/lib/site";
import { env } from "@/env";

type Home = { profile: Profile; checklist: Checklist; overview: Overview };
const todoCopy: Record<TodoKind, { icon: typeof HandCoins; text: (name: string, amount: number | null) => string }> = {
  record_advance: { icon: HandCoins, text: (name, amount) => `Collect and record the ${formatINR(amount ?? 0)} advance from ${name}` },
  mark_complete: { icon: CheckCircle2, text: name => `Mark ${name}'s booking as completed` },
  return_money: { icon: Undo2, text: (name, amount) => `Return ${formatINR(amount ?? 0)} to ${name} directly (paid to you offline)` },
  refund_failed: { icon: AlertTriangle, text: (name, amount) => `A ${formatINR(amount ?? 0)} refund to ${name} failed. We're looking into it.` }
};

/** SPEC 5.3 dashboard home: today and the next 7 days, money summary, to-do. */
export default function Dashboard() {
  const toast = useToast();
  const [state, reload] = useVendorData<Home>("home", async () => { const [profile, checklist, overview] = await Promise.all([api<Profile>("/v1/vendor/me"), api<Checklist>("/v1/vendor/checklist"), api<Overview>("/v1/vendor/overview")]); return { profile, checklist, overview }; });
  const [notice, setNotice] = useState<{ tone: "danger" | "warning"; text: string }>(); const [busy, setBusy] = useState(false);
  const skeleton = <LoadingState label="Loading your dashboard…" className="grid gap-4"><Skeleton className="h-10 w-64" /><div className="grid gap-4 sm:grid-cols-3"><Skeleton className="h-28 rounded-card" /><Skeleton className="h-28 rounded-card" /><Skeleton className="h-28 rounded-card" /></div><Skeleton className="h-64 rounded-card" /></LoadingState>;

  return <Gate state={state} skeleton={skeleton} retry={() => void reload()} next="/dashboard">{({ profile, checklist, overview }) => {
    const togglePublish = async () => {
      setBusy(true); setNotice(undefined);
      try { await api(`/v1/vendor/${profile.published ? "unpublish" : "publish"}`, { body: {} }); toast({ title: profile.published ? "Your page is hidden" : "Your page is live", tone: "success" }); await reload(); }
      catch (failure) { const missing = failure instanceof ApiError ? (failure.details.missing as string[] | undefined) : undefined; setNotice({ tone: missing ? "warning" : "danger", text: missing ? `Before publishing: ${missing.map(key => requirementCopy[key] ?? key).join("; ")}.` : humanMessage(failure) }); }
      finally { setBusy(false); }
    };
    const today = localDateKey(new Date(), overview.timezone);
    const todays = overview.upcoming.filter(row => localDateKey(new Date(row.starts_at), overview.timezone) === today);
    const later = overview.upcoming.filter(row => localDateKey(new Date(row.starts_at), overview.timezone) !== today);
    return (
      <div className="grid gap-6">
        <PageHeader eyebrow={profile.published ? "Live" : "Not published yet"} title={profile.business_name} actions={<><NewBookingDialog onCreated={() => void reload()} /><Button variant={profile.published ? "secondary" : "primary"} loading={busy} onClick={() => void togglePublish()}>{profile.published ? "Unpublish" : "Publish"}</Button></>} />
        {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
        {!checklist.steps.every(step => step.done) && <ChecklistCard checklist={checklist} />}

        <section aria-label="Money summary" className="grid gap-4 sm:grid-cols-3">
          <Card className="grid gap-1"><span className="text-sm text-muted">Received, last 30 days</span><Money paise={overview.money.collected_30d_paise} size="xl" /><span className="text-xs text-muted">After refunds. {overview.payments_enabled ? "Online and offline." : "Recorded offline payments."}</span></Card>
          <Card className="grid gap-1"><span className="text-sm text-muted">Balance due on upcoming bookings</span><Money paise={overview.money.balance_due_paise} size="xl" /><span className="text-xs text-muted">Collected on the day or as agreed.</span></Card>
          <Card className="grid gap-1"><span className="text-sm text-muted">Next 7 days</span><span className="text-2xl font-semibold tabular-nums">{overview.upcoming.length}</span><span className="text-xs text-muted">{overview.upcoming.length === 1 ? "booking" : "bookings"}, including today</span></Card>
        </section>

        <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="grid min-w-0 content-start gap-6">
            <section aria-labelledby="today" className="grid gap-3">
              <h2 id="today" className="text-lg">Today, {formatDate(new Date(), overview.timezone)}</h2>
              {todays.length ? <BookingList rows={todays} timezone={overview.timezone} caption="Today's bookings" /> : <p className="rounded-card bg-surface-muted px-4 py-3 text-sm text-muted">Nothing booked today.</p>}
            </section>
            <section aria-labelledby="week" className="grid gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2"><h2 id="week" className="text-lg">Next 7 days</h2><Link href="/dashboard/calendar" className="text-sm font-medium">Open calendar</Link></div>
              {later.length ? <BookingList rows={later} timezone={overview.timezone} caption="Bookings in the next 7 days" />
                : <EmptyState icon={<CalendarCheck2 />} title="No bookings in the next 7 days" description={profile.published ? "Share your page link on WhatsApp or Instagram. New bookings appear here the moment someone reserves a time." : "Publish your page so customers can book you."} />}
            </section>
          </div>
          <aside className="grid content-start gap-6 md:grid-cols-2 2xl:grid-cols-1">
            <Card><CardHeader title="To do" description={overview.todo.length ? undefined : "You're all caught up."} />
              {overview.todo.length > 0 && <ul className="grid gap-2">{overview.todo.map(item => { const copy = todoCopy[item.kind]; const Icon = copy.icon; return (
                <li key={`${item.kind}-${item.id}`}><Link href={`/dashboard/bookings/${item.id}`} className="flex min-h-11 items-start gap-3 rounded-input px-2 py-2 text-sm text-ink no-underline hover:bg-surface-muted"><Icon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden /><span className="grid"><span>{copy.text(item.client_name, item.amount_paise)}</span><span className="text-xs text-muted">{item.booking_mode === "daily" ? formatBookingTime(item, overview.timezone) : `${formatDate(item.starts_at, overview.timezone, "short")}, ${formatTime(item.starts_at, overview.timezone)}`}</span></span></Link></li>
              ); })}</ul>}
            </Card>
            <Card><CardHeader title="Your public page" description={profile.published ? "Live. Share it anywhere." : "Publish when the checklist is done."} />
              <p className="mb-4 break-all rounded-input bg-surface-muted px-3 py-2.5 font-mono text-sm">{vendorLinkLabel(env.NEXT_PUBLIC_SITE_URL, profile.slug)}</p>
              <div className="grid gap-2"><Button asChild variant="secondary"><a href={`/${profile.slug}`} target="_blank" rel="noreferrer"><ExternalLink aria-hidden />Preview</a></Button><Button type="button" variant="ghost" onClick={() => void navigator.clipboard.writeText(vendorUrl(env.NEXT_PUBLIC_SITE_URL, profile.slug)).then(() => toast({ title: "Link copied", tone: "success" }))}><Copy aria-hidden />Copy public link</Button></div>
            </Card>
          </aside>
        </div>
      </div>
    );
  }}</Gate>;
}
