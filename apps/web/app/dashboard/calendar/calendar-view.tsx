"use client";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { localDateTimeToUtc } from "@bayana/shared";
import { PageHeader } from "@/components/layout/brand";
import { dateLabel, formatBookingTime, formatTime, localDateKey } from "@/components/booking/time";
import { NewBookingDialog } from "@/components/dashboard/booking-actions";
import { bookingHref } from "@/components/dashboard/booking-list";
import { Gate, useVendorData } from "@/components/dashboard/load";
import type { CalendarData } from "@/components/dashboard/types";
import { Button } from "@/components/ui/button";
import { Badge, Card, LoadingState, Notice, Skeleton, StatusBadge } from "@/components/ui/display";
import { Sheet, SheetContent } from "@/components/ui/dialog";
import { Checkbox, Field, Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { api, vendorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";

// Dates here are local calendar dates (YYYY-MM-DD) in the vendor's timezone; arithmetic goes through UTC noon so no DST shifts.
const shift = (date: string, days: number) => { const value = new Date(`${date}T12:00:00Z`); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10); };
const weekday = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();
const monthOf = (date: string) => date.slice(0, 7);
const addMonths = (date: string, months: number) => { const value = new Date(`${date.slice(0, 7)}-01T12:00:00Z`); value.setUTCMonth(value.getUTCMonth() + months); return value.toISOString().slice(0, 10); };
function range(view: "month" | "week", anchor: string) {
  if (view === "week") { const from = shift(anchor, -weekday(anchor)); return { from, to: shift(from, 6) }; }
  const first = `${monthOf(anchor)}-01`, last = shift(addMonths(first, 1), -1);
  return { from: shift(first, -weekday(first)), to: shift(last, 6 - weekday(last)) };
}
const days = (from: string, to: string) => { const out: string[] = []; for (let day = from; day <= to; day = shift(day, 1)) out.push(day); return out; };

type Entry = { key: string; kind: "confirmed" | "held" | "blocked"; label: string; href?: string; blockedId?: string; status?: string };
const kindStyle = { confirmed: "bg-success-soft text-success", held: "bg-warning-soft text-warning", blocked: "bg-surface-muted text-muted line-through" };
const kindWord = { confirmed: "Confirmed", held: "Held or awaiting advance", blocked: "Blocked" };

function entriesFor(date: string, data: CalendarData): Entry[] {
  const dayStart = localDateTimeToUtc(`${date}T00:00:00`, data.timezone), dayEnd = localDateTimeToUtc(`${shift(date, 1)}T00:00:00`, data.timezone);
  // A daily booking appears on every day it covers, as "All day"; an hourly one on its start day with its time.
  const covers = (booking: CalendarData["bookings"][number]) => booking.booking_mode === "daily" && booking.first_date && booking.days_count
    ? date >= booking.first_date && date < shift(booking.first_date, booking.days_count) : localDateKey(new Date(booking.starts_at), data.timezone) === date;
  const label = (booking: CalendarData["bookings"][number]) => booking.booking_mode === "daily" && booking.first_date && booking.days_count
    ? `All day${booking.days_count > 1 ? ` (day ${days(booking.first_date, date).length} of ${booking.days_count})` : ""} ${booking.client_name}` : `${formatBookingTime(booking, data.timezone)} ${booking.client_name}`;
  const bookings = data.bookings.filter(covers).map((booking): Entry => ({
    key: booking.id, kind: booking.status === "CONFIRMED" || booking.status === "COMPLETED" ? "confirmed" : "held", label: label(booking), href: bookingHref(booking.id), status: booking.status
  }));
  const blocked = dayStart && dayEnd ? data.blocked_periods.filter(period => new Date(period.starts_at) < dayEnd && new Date(period.ends_at) > dayStart).map((period): Entry => ({
    key: `${period.id}-${date}`, kind: "blocked", blockedId: period.id, label: `${new Date(period.starts_at) <= dayStart && new Date(period.ends_at) >= dayEnd ? "All day" : `${formatTime(period.starts_at, data.timezone)}–${formatTime(period.ends_at, data.timezone)}`}${period.reason ? ` ${period.reason}` : " Time off"}`
  })) : [];
  return [...blocked, ...bookings];
}

/** SPEC 5.3 calendar: month and week views; confirmed, held and blocked time colour-coded with words; a day opens its details. */
export function CalendarView() {
  const [view, setView] = useState<"month" | "week">("month");
  // "Today" comes from the browser after mount, so the server render and the first client render agree.
  const [anchor, setAnchor] = useState<string>();
  useEffect(() => { setAnchor(localDateKey(new Date(), Intl.DateTimeFormat().resolvedOptions().timeZone)); }, []);
  const [openDay, setOpenDay] = useState<string>();
  const { from, to } = anchor ? range(view, anchor) : { from: "", to: "" };
  const [state, reload] = useVendorData<CalendarData>(anchor ? `/v1/vendor/calendar?from=${from}&to=${to}` : null);
  const move = (direction: 1 | -1) => anchor && setAnchor(view === "month" ? addMonths(anchor, direction) : shift(anchor, 7 * direction));
  const title = !anchor ? "Calendar" : view === "month" ? new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${monthOf(anchor)}-01T12:00:00Z`)) : `${dateLabel(from, "day")} ${dateLabel(from, "month")} – ${dateLabel(to, "day")} ${dateLabel(to, "month")}`;
  const skeleton = <LoadingState label="Loading calendar…"><Skeleton className="h-[28rem] rounded-card" /></LoadingState>;

  return (
    <>
      <PageHeader eyebrow="Calendar" title={title} description="Confirmed, held and blocked time at a glance. Choose a day to see it, block time or add a booking." actions={<NewBookingDialog />} />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1"><Button variant="secondary" size="icon" aria-label={view === "month" ? "Previous month" : "Previous week"} onClick={() => move(-1)}><ChevronLeft aria-hidden /></Button><Button variant="ghost" onClick={() => setAnchor(localDateKey(new Date(), state.kind === "ready" ? state.data.timezone : Intl.DateTimeFormat().resolvedOptions().timeZone))}>Today</Button><Button variant="secondary" size="icon" aria-label={view === "month" ? "Next month" : "Next week"} onClick={() => move(1)}><ChevronRight aria-hidden /></Button></div>
        <div role="group" aria-label="Calendar view" className="inline-flex gap-1 rounded-card bg-surface-muted p-1">{(["month", "week"] as const).map(option => <Button key={option} variant={view === option ? "secondary" : "ghost"} aria-pressed={view === option} onClick={() => setView(option)}>{option === "month" ? "Month" : "Week"}</Button>)}</div>
      </div>
      <div className="mb-4 flex flex-wrap gap-2" aria-label="Legend"><Badge tone="success">Confirmed</Badge><Badge tone="warning">Held or awaiting advance</Badge><Badge>Blocked</Badge></div>
      <Gate state={state} skeleton={skeleton} retry={() => void reload()} next="/dashboard/calendar">{data => {
        const today = localDateKey(new Date(), data.timezone);
        return (
          <>
            {view === "month" ? <Card className="p-2 sm:p-4">
              <div className="grid grid-cols-7 text-center text-xs font-semibold text-muted" aria-hidden>{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => <span key={day} className="py-2">{day}</span>)}</div>
              <ol className="grid grid-cols-7 gap-px overflow-hidden rounded-input bg-border">
                {days(from, to).map(date => { const items = entriesFor(date, data); const inMonth = monthOf(date) === monthOf(anchor ?? date); return (
                  <li key={date} className={cn("min-h-16 bg-surface sm:min-h-24", !inMonth && "bg-surface-muted/60")}>
                    <button type="button" onClick={() => setOpenDay(date)} className="flex size-full min-h-16 flex-col items-stretch gap-1 p-1 text-left hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-ring sm:min-h-24 sm:p-2" aria-label={`${dateLabel(date, "full")}${items.length ? `, ${items.length} item${items.length > 1 ? "s" : ""}` : ", nothing booked"}`}>
                      <span className={cn("text-xs tabular-nums", date === today ? "inline-flex size-6 items-center justify-center rounded-full bg-primary font-semibold text-primary-foreground" : inMonth ? "text-ink" : "text-muted")}>{dateLabel(date, "day")}</span>
                      <span className="hidden gap-0.5 sm:grid">{items.slice(0, 3).map(item => <span key={item.key} className={cn("truncate rounded px-1 py-0.5 text-xs font-medium", kindStyle[item.kind])}>{item.label}</span>)}{items.length > 3 && <span className="text-xs text-muted">+{items.length - 3} more</span>}</span>
                      <span className="flex flex-wrap gap-0.5 sm:hidden" aria-hidden>{items.slice(0, 4).map(item => <span key={item.key} className={cn("size-2 rounded-full", item.kind === "confirmed" ? "bg-success" : item.kind === "held" ? "bg-warning" : "bg-muted")} />)}</span>
                    </button>
                  </li>
                ); })}
              </ol>
            </Card> : <ol className="grid gap-3 lg:grid-cols-7 lg:gap-2">
              {days(from, to).map(date => { const items = entriesFor(date, data); return (
                <li key={date} className="grid content-start gap-2 rounded-card bg-surface p-3 shadow-soft ring-1 ring-border/70">
                  <button type="button" onClick={() => setOpenDay(date)} className="flex min-h-11 items-center justify-between gap-2 rounded-input text-left text-sm font-semibold hover:text-primary" aria-label={`Open ${dateLabel(date, "full")}`}>
                    <span>{dateLabel(date, "weekday")} {dateLabel(date, "day")} {dateLabel(date, "month")}</span>{date === today && <Badge tone="primary">Today</Badge>}
                  </button>
                  {items.length === 0 ? <span className="text-xs text-muted">Free</span> : <ul className="grid gap-1">{items.map(item => <li key={item.key}>{item.href ? <Link href={item.href} className={cn("block min-h-9 rounded px-2 py-1.5 text-xs font-medium no-underline", kindStyle[item.kind])}>{item.label}</Link> : <span className={cn("block rounded px-2 py-1.5 text-xs font-medium", kindStyle[item.kind])}>{item.label}</span>}</li>)}</ul>}
                </li>
              ); })}
            </ol>}
            <Sheet open={Boolean(openDay)} onOpenChange={open => { if (!open) setOpenDay(undefined); }}>
              {openDay && <SheetContent title={dateLabel(openDay, "full")} description={`Times in ${data.timezone}`}><DayPanel date={openDay} data={data} onChanged={() => void reload()} /></SheetContent>}
            </Sheet>
          </>
        );
      }}</Gate>
    </>
  );
}

function DayPanel({ date, data, onChanged }: { date: string; data: CalendarData; onChanged: () => void }) {
  const toast = useToast(); const items = entriesFor(date, data);
  const [allDay, setAllDay] = useState(false); const [error, setError] = useState(""); const [busy, setBusy] = useState("");
  const block = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = new FormData(event.currentTarget); setError("");
    const start = allDay ? localDateTimeToUtc(`${date}T00:00:00`, data.timezone) : localDateTimeToUtc(`${date}T${form.get("start")}:00`, data.timezone);
    const end = allDay ? localDateTimeToUtc(`${shift(date, 1)}T00:00:00`, data.timezone) : localDateTimeToUtc(`${date}T${form.get("end")}:00`, data.timezone);
    if (!start || !end) { setError("That time does not exist on this date (a clock change). Choose another time."); return; }
    if (end <= start) { setError("End must be after the start."); return; }
    setBusy("block");
    try { await api("/v1/vendor/availability/blocked-periods", { body: { starts_at: start.toISOString(), ends_at: end.toISOString(), reason: String(form.get("reason") ?? "").trim() } }); toast({ title: "Time blocked", tone: "success" }); onChanged(); }
    catch (failure) { setError(vendorMessage(failure)); } finally { setBusy(""); }
  };
  const unblock = async (id: string) => {
    setBusy(id);
    try { await api(`/v1/vendor/availability/blocked-periods/${id}`, { method: "DELETE" }); toast({ title: "Time off removed", tone: "success" }); onChanged(); }
    catch (failure) { setError(vendorMessage(failure)); } finally { setBusy(""); }
  };
  return (
    <div className="grid gap-5">
      <section aria-label="On this day" className="grid gap-2">
        {items.length === 0 ? <p className="text-sm text-muted">Nothing booked or blocked.</p> : <ul className="grid gap-2">{items.map(item => (
          <li key={item.key} className={cn("flex min-h-11 items-center justify-between gap-2 rounded-input px-3 py-2 text-sm", kindStyle[item.kind])}>
            {item.href ? <Link href={item.href} className="grid min-w-0 text-inherit no-underline"><span className="truncate font-medium">{item.label}</span><span className="text-xs">{item.status ? <StatusBadge status={item.status} className="bg-transparent px-0" /> : kindWord[item.kind]}</span></Link> : <span className="grid"><span className="font-medium">{item.label}</span><span className="text-xs">{kindWord[item.kind]}</span></span>}
            {item.blockedId && <Button variant="ghost" size="icon" aria-label="Remove this time off" loading={busy === item.blockedId} onClick={() => void unblock(item.blockedId!)}><Trash2 aria-hidden /></Button>}
          </li>
        ))}</ul>}
      </section>
      <NewBookingDialog defaultDate={date} onCreated={onChanged} trigger={<Button variant="secondary">Add a booking on this day</Button>} />
      <form onSubmit={block} noValidate className="grid gap-3 border-t border-border pt-4">
        <h3 className="font-semibold">Block time</h3>
        <Checkbox label="The whole day" checked={allDay} onChange={event => setAllDay(event.target.checked)} />
        {!allDay && <div className="grid grid-cols-2 gap-3"><Field label="From">{p => <Input {...p} name="start" type="time" step={300} defaultValue="13:00" />}</Field><Field label="Until">{p => <Input {...p} name="end" type="time" step={300} defaultValue="14:00" />}</Field></div>}
        <Field label="Reason" optional hint="Only you see this.">{p => <Input {...p} name="reason" maxLength={500} />}</Field>
        {error && <Notice tone="danger">{error}</Notice>}
        <Button loading={busy === "block"} loadingText="Blocking…">Block this time</Button>
      </form>
    </div>
  );
}
