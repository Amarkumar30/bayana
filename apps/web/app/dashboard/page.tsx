"use client";
import Link from "next/link";
import { useState } from "react";
import { AlertTriangle, CalendarCheck2, CheckCircle2, Clock, HandCoins, Undo2 } from "lucide-react";
import { formatAmount } from "@bayana/shared";
import { PageHeader } from "@/components/layout/brand";
import { BookingList } from "@/components/dashboard/booking-list";
import { ExtendDeadlineDialog, NewBookingDialog } from "@/components/dashboard/booking-actions";
import { Gate, useVendorData } from "@/components/dashboard/load";
import { ShareCard } from "@/components/dashboard/share-card";
import type { Overview, TodoKind } from "@/components/dashboard/types";
import { formatBookingTime, formatDate, formatDateTime, formatTime, localDateKey } from "@/components/booking/time";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, EmptyState, LoadingState, Money, Notice, Skeleton } from "@/components/ui/display";
import { useToast } from "@/components/ui/toast";
import { ChecklistCard } from "@/components/vendor/checklist-card";
import type { Checklist, Profile } from "@/components/vendor/types";
import { ApiError, api, humanMessage, requirementCopy } from "@/lib/api";

type Home = { profile: Profile; checklist: Checklist; overview: Overview };
const todoCopy: Record<TodoKind, { icon: typeof HandCoins; text: (name: string, amount: number | null) => string }> = {
  record_advance: { icon: HandCoins, text: (name, amount) => `Collect and record the ${formatAmount(amount ?? 0)} advance from ${name}` },
  deadline_passed: { icon: Clock, text: (name, amount) => `The deadline for ${name}'s ${formatAmount(amount ?? 0)} advance passed, so the time was released` },
  mark_complete: { icon: CheckCircle2, text: name => `Mark ${name}'s booking as completed` },
  return_money: { icon: Undo2, text: (name, amount) => `Return ${formatAmount(amount ?? 0)} to ${name} directly (paid to you offline)` },
  refund_failed: { icon: AlertTriangle, text: (name, amount) => `A ${formatAmount(amount ?? 0)} refund to ${name} failed. We're looking into it.` }
};

/** Dashboard home, today's work first: what needs the vendor, what is coming up, this month's money, then the share card. */
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

        <section aria-labelledby="action" className="grid gap-3">
          <h2 id="action" className="text-lg">Needs your action</h2>
          {overview.todo.length === 0 ? <p className="rounded-card bg-surface-muted px-4 py-3 text-sm text-muted">You're all caught up.</p>
            : <ul className="grid divide-y divide-border rounded-card bg-surface ring-1 ring-border/70">{overview.todo.map(item => { const copy = todoCopy[item.kind]; const Icon = copy.icon; return (
              <li key={`${item.kind}-${item.id}`} className="flex flex-wrap items-center gap-2 px-2 py-1">
                <Link href={`/dashboard/bookings/${item.id}`} className="flex min-h-11 min-w-0 flex-1 basis-60 items-start gap-3 rounded-input px-2 py-2 text-sm text-ink no-underline hover:bg-surface-muted"><Icon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden /><span className="grid"><span>{copy.text(item.client_name, item.amount_paise)}</span><span className="text-xs text-muted">{item.booking_mode === "daily" ? formatBookingTime(item, overview.timezone) : `${formatDate(item.starts_at, overview.timezone, "short")}, ${formatTime(item.starts_at, overview.timezone)}`}</span>{item.kind === "record_advance" && item.hold_expires_at && <span className="text-xs font-medium text-muted">Hold ends {formatDateTime(item.hold_expires_at, overview.timezone)}</span>}</span></Link>
                {(item.kind === "deadline_passed" || item.kind === "record_advance" && !overview.payments_enabled) && <ExtendDeadlineDialog booking={{ ...item, timezone: overview.timezone }} onDone={() => void reload()} />}
              </li>
            ); })}</ul>}
        </section>

        <section aria-labelledby="today" className="grid gap-3">
          <h2 id="today" className="text-lg">Today, {formatDate(new Date(), overview.timezone)}</h2>
          {todays.length ? <BookingList rows={todays} timezone={overview.timezone} caption="Today's bookings" /> : <p className="rounded-card bg-surface-muted px-4 py-3 text-sm text-muted">Nothing booked today.</p>}
        </section>
        <section aria-labelledby="week" className="grid gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2"><h2 id="week" className="text-lg">Next 7 days</h2><Link href="/dashboard/calendar" className="text-sm font-medium">Open calendar</Link></div>
          {later.length ? <BookingList rows={later} timezone={overview.timezone} caption="Bookings in the next 7 days" />
            : <EmptyState icon={<CalendarCheck2 />} title="No bookings in the next 7 days" description={profile.published ? "Share your page link on WhatsApp or Instagram. New bookings appear here the moment someone reserves a time." : "Publish your page so customers can book you."} />}
        </section>

        <section aria-labelledby="money" className="grid gap-3">
          <h2 id="money" className="text-lg">This month's money</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card className="grid gap-1"><span className="text-sm text-muted">Advances collected this month</span><Money paise={overview.money.advance_month_paise} size="xl" /><span className="text-xs text-muted">{overview.payments_enabled ? "Online and offline." : "Recorded offline payments."}</span></Card>
            <Card className="grid gap-1"><span className="text-sm text-muted">Balance due on upcoming bookings</span><Money paise={overview.money.balance_due_paise} size="xl" /><span className="text-xs text-muted">Collected on the day or as agreed.</span></Card>
            <Card className="grid gap-1"><span className="text-sm text-muted">Received, last 30 days</span><Money paise={overview.money.collected_30d_paise} size="xl" /><span className="text-xs text-muted">All payments, after refunds.</span></Card>
          </div>
        </section>

        <ShareCard slug={profile.slug} businessName={profile.business_name} published={profile.published} />
      </div>
    );
  }}</Gate>;
}
