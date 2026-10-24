"use client";
import { env } from "@/env";
import { FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, LoadingState, Notice, Skeleton, StatusBadge } from "@/components/ui/display";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
const api = env.NEXT_PUBLIC_API_URL;
type Rule = { id: string; weekday: number; start_time: string; end_time: string };
type Period = { id: string; starts_at: string; ends_at: string; reason: string };
type Booking = { id: string; status: string; starts_at_utc: string; ends_at_utc: string };
type Data = { rules: Rule[]; exceptions: { id: string; local_date: string; is_closed: boolean; start_time: string | null; end_time: string | null }[]; blocked_periods: Period[]; bookings: Booking[] };
const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export function AvailabilityManager() {
  const [data, setData] = useState<Data>(); const [notice, setNotice] = useState(""); const [timezone, setTimezone] = useState("your business timezone");
  const load = () => Promise.all([fetch(`${api}/v1/vendor/availability`, { credentials: "include" }), fetch(`${api}/v1/vendor/me`, { credentials: "include" })]).then(async ([availability, profile]) => { if (!availability.ok || !profile.ok) throw new Error("Unavailable"); setData(await availability.json() as Data); setTimezone((await profile.json() as { timezone: string }).timezone); }).catch(() => setNotice("Availability could not be loaded."));
  useEffect(() => { void load(); }, []);
  const submit = async (event: FormEvent<HTMLFormElement>, path: string) => { event.preventDefault(); const form = new FormData(event.currentTarget); const body = Object.fromEntries(form); if (path.endsWith("exceptions")) Object.assign(body, { is_closed: form.get("is_closed") === "on", start_time: form.get("is_closed") === "on" ? null : form.get("start_time"), end_time: form.get("is_closed") === "on" ? null : form.get("end_time") }); const response = await fetch(`${api}${path}`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); if (!response.ok) { setNotice("Could not save availability. Check the values and try again."); return; } event.currentTarget.reset(); setNotice("Saved."); void load(); };
  return (
    <div className="grid gap-6">
      <p className="text-sm text-muted">Times use <strong className="text-ink">{timezone}</strong>. Existing bookings and payment holds cannot be overwritten.</p>
      {notice && <Notice tone={notice === "Saved." ? "success" : "danger"}>{notice}</Notice>}
      <Card>
        <Tabs defaultValue="weekly">
          <TabsList aria-label="Availability controls"><TabsTrigger value="weekly">Weekly hours</TabsTrigger><TabsTrigger value="exception">Date exception</TabsTrigger><TabsTrigger value="block">Block a period</TabsTrigger></TabsList>
          <TabsContent value="weekly"><form onSubmit={event => void submit(event, "/v1/vendor/availability/rules")} className="grid gap-4 sm:grid-cols-3"><Field label="Day">{p => <Select {...p} name="weekday" defaultValue="1">{["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((day, index) => <option key={day} value={index}>{day}</option>)}</Select>}</Field><Field label="Starts">{p => <Input {...p} name="start_time" type="time" required />}</Field><Field label="Ends">{p => <Input {...p} name="end_time" type="time" required />}</Field><div className="sm:col-span-3"><Button>Add hours</Button></div></form></TabsContent>
          <TabsContent value="exception"><form onSubmit={event => void submit(event, "/v1/vendor/availability/exceptions")} className="grid gap-4 sm:grid-cols-3"><Field label="Date" className="sm:col-span-3">{p => <Input {...p} name="local_date" type="date" required />}</Field><Checkbox name="is_closed" label="Closed all day" className="sm:col-span-3" /><Field label="Starts">{p => <Input {...p} name="start_time" type="time" />}</Field><Field label="Ends">{p => <Input {...p} name="end_time" type="time" />}</Field><div className="sm:col-span-3"><Button>Add exception</Button></div></form></TabsContent>
          <TabsContent value="block"><form onSubmit={event => void submit(event, "/v1/vendor/availability/blocked-periods")} className="grid gap-4 sm:grid-cols-2"><Field label="Starts">{p => <Input {...p} name="starts_at" type="datetime-local" required />}</Field><Field label="Ends">{p => <Input {...p} name="ends_at" type="datetime-local" required />}</Field><Field label="Reason" optional className="sm:col-span-2">{p => <Input {...p} name="reason" maxLength={500} />}</Field><div className="sm:col-span-2"><Button>Block period</Button></div></form></TabsContent>
        </Tabs>
      </Card>
      <Card>
        <CardHeader title="Current setup" />
        {!data ? <LoadingState label="Loading calendar…" className="grid gap-3"><Skeleton className="h-6" /><Skeleton className="h-6 w-2/3" /><Skeleton className="h-6 w-1/2" /></LoadingState> : (
          <dl className="grid gap-4 text-sm">
            <div className="grid gap-1"><dt className="font-semibold">Weekly hours</dt><dd className="flex flex-wrap gap-2">{data.rules.length ? data.rules.map(rule => <span key={rule.id} className="rounded-input bg-surface-muted px-2.5 py-1 tabular-nums">{weekdays[rule.weekday]} {rule.start_time.slice(0, 5)}–{rule.end_time.slice(0, 5)}</span>) : <span className="text-muted">No hours configured</span>}</dd></div>
            <div className="flex flex-wrap gap-x-8 gap-y-2"><div><dt className="inline font-semibold">Exceptions: </dt><dd className="inline text-muted">{data.exceptions.length || "None"}</dd></div><div><dt className="inline font-semibold">Blocked: </dt><dd className="inline text-muted">{data.blocked_periods.length || "None"}</dd></div></div>
            <div className="grid gap-1"><dt className="font-semibold">Bookings and holds</dt><dd className="grid gap-2">{data.bookings.length ? data.bookings.map(booking => <span key={booking.id} className="flex items-center gap-2"><StatusBadge status={booking.status} /><span className="tabular-nums">{new Date(booking.starts_at_utc).toLocaleString("en-IN", { timeZone: timezone })}</span></span>) : <span className="text-muted">None</span>}</dd></div>
          </dl>
        )}
      </Card>
    </div>
  );
}
