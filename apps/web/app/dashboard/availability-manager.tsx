"use client";
import Link from "next/link";
import { CalendarClock, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { localDateTimeToUtc, weeklyScheduleSchema } from "@bayana/shared";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, EmptyState, LoadingState, Notice, Skeleton, StatusBadge } from "@/components/ui/display";
import { Field, Input, Select } from "@/components/ui/field";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { weekdayNames } from "@/components/vendor/types";
import { ApiError, api, humanMessage } from "@/lib/api";

type Window = { start_time: string; end_time: string };
type Override = { id: string; local_date: string; kind: "block" | "open"; start_time: string | null; end_time: string | null; note: string };
type Period = { id: string; starts_at: string; ends_at: string; reason: string };
type Booking = { id: string; status: string; starts_at_utc: string };
type Data = { timezone: string; min_notice_minutes: number; max_advance_days: number; rules: ({ id: string; weekday: number } & Window)[]; overrides: Override[]; blocked_periods: Period[]; bookings: Booking[] };

export function AvailabilityManager() {
  const toast = useToast();
  const [data, setData] = useState<Data>(); const [error, setError] = useState(""); const [needsProfile, setNeedsProfile] = useState(false);
  const load = useCallback(() => api<Data>("/v1/vendor/availability").then(value => { setData(value); setError(""); }).catch(failure => { if (failure instanceof ApiError && failure.code === "PROFILE_NOT_FOUND") setNeedsProfile(true); else setError(humanMessage(failure)); }), []);
  useEffect(() => { void load(); }, [load]);
  const saved = (title: string) => { toast({ title, tone: "success" }); void load(); };

  if (needsProfile) return <EmptyState icon={<CalendarClock />} title="Set up your business first" description="Your hours belong to your booking page." action={<Button asChild><Link href="/onboarding">Start setup</Link></Button>} />;
  if (!data) return error ? <Notice tone="danger">{error}</Notice> : <LoadingState label="Loading availability…" className="grid gap-4"><Skeleton className="h-11 w-80" /><Skeleton className="h-80 rounded-card" /></LoadingState>;
  return (
    <div className="grid gap-6">
      <p className="text-sm text-muted">All times are in <strong className="text-ink">{data.timezone}</strong>. Existing bookings and holds are never overwritten.</p>
      {error && <Notice tone="danger">{error}</Notice>}
      <Tabs defaultValue="weekly">
        <TabsList aria-label="Availability sections"><TabsTrigger value="weekly">Weekly hours</TabsTrigger><TabsTrigger value="dates">Date changes</TabsTrigger><TabsTrigger value="blocked">Time off</TabsTrigger><TabsTrigger value="window">Booking window</TabsTrigger></TabsList>
        <TabsContent value="weekly"><WeeklyEditor rules={data.rules} onSaved={() => saved("Weekly hours saved")} /></TabsContent>
        <TabsContent value="dates"><OverridesEditor overrides={data.overrides} onChanged={saved} /></TabsContent>
        <TabsContent value="blocked"><BlockedEditor timezone={data.timezone} periods={data.blocked_periods} onChanged={saved} /></TabsContent>
        <TabsContent value="window"><WindowEditor notice={data.min_notice_minutes} days={data.max_advance_days} onSaved={() => saved("Booking window saved")} /></TabsContent>
      </Tabs>
      <Card><CardHeader title="Upcoming bookings and holds" description="These times are taken." />
        {data.bookings.length ? <ul className="grid gap-2">{data.bookings.map(booking => <li key={booking.id} className="flex items-center gap-3 text-sm"><StatusBadge status={booking.status} /><span className="tabular-nums">{new Date(booking.starts_at_utc).toLocaleString("en-IN", { timeZone: data.timezone, dateStyle: "medium", timeStyle: "short" })}</span></li>)}</ul> : <p className="text-sm text-muted">None yet.</p>}
      </Card>
    </div>
  );
}

function WeeklyEditor({ rules, onSaved }: { rules: Data["rules"]; onSaved: () => void }) {
  const [days, setDays] = useState<Window[][]>(() => weekdayNames.map((_, weekday) => rules.filter(rule => rule.weekday === weekday).map(({ start_time, end_time }) => ({ start_time, end_time }))));
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const windows = days.flatMap((list, weekday) => list.map(window => ({ weekday, ...window })));
  const parsed = weeklyScheduleSchema.safeParse({ windows });
  const update = (weekday: number, list: Window[]) => setDays(current => current.map((value, at) => at === weekday ? list : value));
  const save = async (event: FormEvent) => {
    event.preventDefault(); if (!parsed.success) { setError(parsed.error.issues[0].message); return; }
    setBusy(true); setError("");
    try { await api("/v1/vendor/availability/rules", { method: "PUT", body: { windows } }); onSaved(); } catch (failure) { setError(humanMessage(failure)); } finally { setBusy(false); }
  };
  return (
    <Card>
      <form onSubmit={save} className="grid gap-4">
        <CardHeader title="When you usually work" description="Add one or more windows per day. Leave a day empty if you're closed." />
        <ul className="grid gap-3">{days.map((list, weekday) => (
          <li key={weekday} className="grid gap-2 border-b border-border pb-3 last:border-0 sm:grid-cols-[8rem_1fr]">
            <strong className="pt-2.5 text-sm">{weekdayNames[weekday]}</strong>
            <div className="grid gap-2">
              {list.length === 0 && <p className="pt-2.5 text-sm text-muted">Closed</p>}
              {list.map((window, index) => (
                <div key={index} className="flex flex-wrap items-end gap-2">
                  <Field label="From" className="w-32">{p => <Input {...p} type="time" value={window.start_time} onChange={event => update(weekday, list.map((item, at) => at === index ? { ...item, start_time: event.target.value } : item))} />}</Field>
                  <Field label="To" className="w-32">{p => <Input {...p} type="time" value={window.end_time} onChange={event => update(weekday, list.map((item, at) => at === index ? { ...item, end_time: event.target.value } : item))} />}</Field>
                  <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${weekdayNames[weekday]} window ${index + 1}`} onClick={() => update(weekday, list.filter((_, at) => at !== index))}><Trash2 aria-hidden /></Button>
                </div>
              ))}
              <Button type="button" variant="ghost" size="sm" className="w-fit" onClick={() => update(weekday, [...list, list.length ? { start_time: "14:00", end_time: "18:00" } : { start_time: "09:00", end_time: "17:00" }])}><Plus aria-hidden />Add hours</Button>
            </div>
          </li>
        ))}</ul>
        {!parsed.success && windows.length > 0 && <Notice tone="warning">{parsed.error.issues[0].message}</Notice>}
        {error && <Notice tone="danger">{error}</Notice>}
        <div><Button loading={busy} loadingText="Saving…">Save weekly hours</Button></div>
      </form>
    </Card>
  );
}

function OverridesEditor({ overrides, onChanged }: { overrides: Override[]; onChanged: (title: string) => void }) {
  const [form, setForm] = useState({ local_date: "", type: "closed", start_time: "", end_time: "", note: "" }); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError("");
    const timed = form.type !== "closed";
    try { await api("/v1/vendor/availability/overrides", { body: { local_date: form.local_date, kind: form.type === "extra" ? "open" : "block", start_time: timed ? form.start_time || null : null, end_time: timed ? form.end_time || null : null, note: form.note } }); setForm({ local_date: "", type: "closed", start_time: "", end_time: "", note: "" }); onChanged("Date change saved"); }
    catch (failure) { setError(humanMessage(failure)); } finally { setBusy(false); }
  };
  const remove = async (id: string) => { try { await api(`/v1/vendor/availability/overrides/${id}`, { method: "DELETE" }); onChanged("Date change removed"); } catch (failure) { setError(humanMessage(failure)); } };
  const describe = (item: Override) => item.kind === "open" ? `Extra hours ${item.start_time}–${item.end_time}` : item.start_time ? `Closed ${item.start_time}–${item.end_time}` : "Closed all day";
  return (
    <div className="grid gap-4">
      <Card>
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <CardHeader className="sm:col-span-2" title="Change a single date" description="Date changes beat your weekly hours for that day. To replace a day's hours, close it all day and add extra hours." />
          <Field label="Date">{p => <Input {...p} type="date" required value={form.local_date} onChange={event => setForm({ ...form, local_date: event.target.value })} />}</Field>
          <Field label="Change">{p => <Select {...p} value={form.type} onChange={event => setForm({ ...form, type: event.target.value })}><option value="closed">Closed all day</option><option value="partial">Closed for part of the day</option><option value="extra">Extra opening hours</option></Select>}</Field>
          {form.type !== "closed" && <><Field label="From">{p => <Input {...p} type="time" required value={form.start_time} onChange={event => setForm({ ...form, start_time: event.target.value })} />}</Field><Field label="To">{p => <Input {...p} type="time" required value={form.end_time} onChange={event => setForm({ ...form, end_time: event.target.value })} />}</Field></>}
          <Field label="Note" optional className="sm:col-span-2">{p => <Input {...p} maxLength={500} value={form.note} onChange={event => setForm({ ...form, note: event.target.value })} placeholder="Diwali" />}</Field>
          {error && <Notice tone="danger" className="sm:col-span-2">{error}</Notice>}
          <div><Button loading={busy}>Save date change</Button></div>
        </form>
      </Card>
      {overrides.length ? <ul className="grid gap-2">{overrides.map(item => <li key={item.id} className="flex items-center gap-3 rounded-input bg-surface px-4 py-3 ring-1 ring-border"><span className="font-medium tabular-nums">{new Date(`${item.local_date}T12:00:00Z`).toLocaleDateString("en-IN", { dateStyle: "medium", timeZone: "UTC" })}</span><span className="flex-1 text-sm text-muted">{describe(item)}{item.note ? ` · ${item.note}` : ""}</span><Button size="icon" variant="ghost" aria-label={`Remove change on ${item.local_date}`} onClick={() => void remove(item.id)}><Trash2 aria-hidden /></Button></li>)}</ul> : <p className="text-sm text-muted">No date changes coming up.</p>}
    </div>
  );
}

function BlockedEditor({ timezone, periods, onChanged }: { timezone: string; periods: Period[]; onChanged: (title: string) => void }) {
  const [form, setForm] = useState({ starts: "", ends: "", reason: "" }); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError("");
    // datetime-local has no zone: interpret it in the vendor's timezone, not the browser's, and send an exact instant.
    const starts = form.starts && localDateTimeToUtc(form.starts, timezone), ends = form.ends && localDateTimeToUtc(form.ends, timezone);
    if (!starts || !ends) { setError("Enter a start and end that exist in your timezone."); return; }
    setBusy(true);
    try { await api("/v1/vendor/availability/blocked-periods", { body: { starts_at: starts.toISOString(), ends_at: ends.toISOString(), reason: form.reason } }); setForm({ starts: "", ends: "", reason: "" }); onChanged("Time off saved"); }
    catch (failure) { setError(humanMessage(failure)); } finally { setBusy(false); }
  };
  const remove = async (id: string) => { try { await api(`/v1/vendor/availability/blocked-periods/${id}`, { method: "DELETE" }); onChanged("Time off removed"); } catch (failure) { setError(humanMessage(failure)); } };
  const show = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: timezone, dateStyle: "medium", timeStyle: "short" });
  return (
    <div className="grid gap-4">
      <Card>
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <CardHeader className="sm:col-span-2" title="Block time off" description={`For trips or appointments that span hours or days. Times are in ${timezone}.`} />
          <Field label="Starts">{p => <Input {...p} type="datetime-local" required value={form.starts} onChange={event => setForm({ ...form, starts: event.target.value })} />}</Field>
          <Field label="Ends">{p => <Input {...p} type="datetime-local" required value={form.ends} onChange={event => setForm({ ...form, ends: event.target.value })} />}</Field>
          <Field label="Reason" optional className="sm:col-span-2" hint="Only you see this.">{p => <Input {...p} maxLength={500} value={form.reason} onChange={event => setForm({ ...form, reason: event.target.value })} />}</Field>
          {error && <Notice tone="danger" className="sm:col-span-2">{error}</Notice>}
          <div><Button loading={busy}>Block this time</Button></div>
        </form>
      </Card>
      {periods.length ? <ul className="grid gap-2">{periods.map(period => <li key={period.id} className="flex flex-wrap items-center gap-3 rounded-input bg-surface px-4 py-3 ring-1 ring-border"><span className="flex-1 text-sm tabular-nums">{show(period.starts_at)} → {show(period.ends_at)}{period.reason ? <span className="text-muted"> · {period.reason}</span> : null}</span><Button size="icon" variant="ghost" aria-label="Remove this time off" onClick={() => void remove(period.id)}><Trash2 aria-hidden /></Button></li>)}</ul> : <p className="text-sm text-muted">No time off coming up.</p>}
    </div>
  );
}

function WindowEditor({ notice, days, onSaved }: { notice: number; days: number; onSaved: () => void }) {
  const [form, setForm] = useState({ notice: String(notice), days: String(days) }); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError("");
    try { await api("/v1/vendor/me/booking-window", { method: "PATCH", body: { min_notice_minutes: Number(form.notice), max_advance_days: Number(form.days) } }); onSaved(); } catch (failure) { setError(humanMessage(failure)); } finally { setBusy(false); }
  };
  return (
    <Card>
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <CardHeader className="sm:col-span-2" title="How soon and how far ahead" description="Clients only see times inside this window." />
        <Field label="Minimum notice">{p => <Select {...p} value={form.notice} onChange={event => setForm({ ...form, notice: event.target.value })}>{[[0, "None"], [30, "30 minutes"], [60, "1 hour"], [120, "2 hours"], [240, "4 hours"], [720, "12 hours"], [1440, "1 day"], [2880, "2 days"], [10080, "1 week"]].map(([value, label]) => <option key={value} value={value}>{label}</option>)}{![0, 30, 60, 120, 240, 720, 1440, 2880, 10080].includes(Number(form.notice)) && <option value={form.notice}>{form.notice} minutes</option>}</Select>}</Field>
        <Field label="Book up to (days ahead)" hint="1 to 365 days.">{p => <Input {...p} type="number" min={1} max={365} value={form.days} onChange={event => setForm({ ...form, days: event.target.value })} />}</Field>
        {error && <Notice tone="danger" className="sm:col-span-2">{error}</Notice>}
        <div><Button loading={busy}>Save booking window</Button></div>
      </form>
    </Card>
  );
}
