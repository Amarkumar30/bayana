"use client";
import { env } from "@/env";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, LoadingState, Notice, Skeleton, Stepper } from "@/components/ui/display";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { DatePicker, monthKey } from "@/components/ui/date-picker";
import { cn } from "@/lib/utils";
const api = env.NEXT_PUBLIC_API_URL;
type Service = { id: string; name: string };
type Vendor = { display_name: string; timezone: string; phone_required: boolean; services: Service[] };
type Day = { date: string; available: boolean };
type Slot = { startsAt: string; endsAt: string };
const pad = (value: number) => String(value).padStart(2, "0");
const dateKey = (date: Date) => `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
export default function Book() {
  const { slug } = useParams<{ slug: string }>(); const router = useRouter(); const search = useSearchParams();
  const [vendor, setVendor] = useState<Vendor>(); const [verified, setVerified] = useState(false); const [email, setEmail] = useState(""); const [code, setCode] = useState(""); const [message, setMessage] = useState("");
  const [serviceId, setServiceId] = useState(search.get("service") ?? ""); const [month, setMonth] = useState(() => monthKey(new Date())); const [days, setDays] = useState<Day[]>(); const [selectedDate, setSelectedDate] = useState(""); const [slots, setSlots] = useState<Slot[]>(); const [selectedSlot, setSelectedSlot] = useState("");
  useEffect(() => { fetch(`${api}/v1/vendors/${slug}`).then(response => response.ok ? response.json() as Promise<Vendor> : Promise.reject()).then(value => { setVendor(value); setServiceId(current => current && value.services.some(service => service.id === current) ? current : value.services[0]?.id ?? ""); }).catch(() => setMessage("This vendor page is unavailable.")); }, [slug]);
  useEffect(() => { if (!serviceId) return; setDays(undefined); setSelectedDate(""); setSelectedSlot(""); setSlots(undefined); fetch(`${api}/v1/vendors/${slug}/availability/month?service_id=${encodeURIComponent(serviceId)}&month=${month}`).then(response => response.ok ? response.json() as Promise<{ days: Day[] }> : Promise.reject()).then(value => setDays(value.days)).catch(() => setMessage("Availability could not be loaded.")); }, [slug, serviceId, month]);
  useEffect(() => { if (!serviceId || !selectedDate) return; setSlots(undefined); setSelectedSlot(""); fetch(`${api}/v1/vendors/${slug}/availability/slots?service_id=${encodeURIComponent(serviceId)}&date=${selectedDate}`).then(response => response.ok ? response.json() as Promise<{ slots: Slot[] }> : Promise.reject()).then(value => setSlots(value.slots)).catch(() => setMessage("Times could not be loaded.")); }, [slug, serviceId, selectedDate]);
  const available = useMemo(() => new Map(days?.map(day => [day.date, day.available]) ?? []), [days]);
  const post = (path: string, body: object, headers: HeadersInit = {}) => fetch(`${api}${path}`, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, credentials: "include", body: JSON.stringify(body) });
  const verify = async () => { const response = await post(code ? "/v1/auth/booking/otp/verify" : "/v1/auth/booking/otp/request", code ? { email, code } : { email }); if (response.ok) { if (code) setVerified(true); else setCode(" "); } else setMessage("We could not verify that email."); };
  const submit = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); if (!selectedDate || !selectedSlot) return setMessage("Choose an available date and time first."); const form = new FormData(event.currentTarget); const response = await post("/v1/bookings", { slug, date: selectedDate, service_id: serviceId, starts_at: selectedSlot, name: form.get("name"), phone: form.get("phone") || undefined, notes: form.get("notes") || undefined, terms_accepted: true }, { "Idempotency-Key": crypto.randomUUID() }); const payload = await response.json() as { booking?: { id: string }; error?: { message?: string } }; if (response.ok && payload.booking) router.push(`/booking/${payload.booking.id}`); else setMessage(payload.error?.message ?? "We could not create your booking."); };
  const disabledReason = (date: string) => date < dateKey(new Date()) ? "past date" : available.get(date) ? null : "no times available";
  if (!vendor) return message ? <Notice tone="danger">{message}</Notice> : <LoadingState label="Loading booking details…" className="grid gap-4"><Skeleton className="h-9 w-2/3" /><Skeleton className="h-6 w-1/3" /><Skeleton className="h-72 rounded-card" /></LoadingState>;
  const step = !verified ? 0 : !selectedSlot ? 1 : 2;
  return (
    <div className="grid gap-6">
      <div className="grid gap-1"><p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-primary"><Lock className="size-3.5" aria-hidden />Secure booking</p><h1 className="text-2xl sm:text-4xl">Book {vendor.display_name}</h1><p className="text-sm text-muted">Times shown in {vendor.timezone}</p></div>
      <Stepper steps={["Verify email", "Pick a time", "Your details"]} current={step} />
      {!verified ? (
        <Card>
          <form onSubmit={event => { event.preventDefault(); void verify(); }} className="grid gap-4">
            <div className="grid gap-1"><h2 className="text-lg">First, confirm your email</h2><p className="text-sm text-muted">We'll send a six-digit code. Your booking details and receipt go to this address.</p></div>
            <Field label="Email">{p => <Input {...p} type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} required />}</Field>
            {code && <Field label="Six-digit code" hint={`Sent to ${email}. It expires in 10 minutes.`}>{p => <Input {...p} inputMode="numeric" autoComplete="one-time-code" value={code} onChange={event => setCode(event.target.value.replace(/\D/g, ""))} required className="text-center text-lg tracking-[0.5em] tabular-nums" />}</Field>}
            {message && <Notice tone="danger">{message}</Notice>}
            <Button size="lg" block>{code ? "Verify email" : "Send verification code"}</Button>
          </form>
        </Card>
      ) : (
        <form onSubmit={submit} className="grid gap-6">
          <Field label="Service">{p => <Select {...p} value={serviceId} onChange={event => setServiceId(event.target.value)} required>{vendor.services.map(service => <option key={service.id} value={service.id}>{service.name}</option>)}</Select>}</Field>
          <DatePicker label="Choose a booking date" month={month} onMonthChange={setMonth} value={selectedDate} onSelect={setSelectedDate} disabledReason={disabledReason} loading={!days} />
          {selectedDate && <section aria-live="polite" aria-labelledby="times" className="grid gap-3"><h2 id="times" className="text-lg">Available times</h2>{!slots ? <LoadingState label="Loading times…" className="grid grid-cols-3 gap-2 sm:grid-cols-4">{[0, 1, 2, 3].map(index => <Skeleton key={index} className="h-11" />)}</LoadingState> : slots.length ? <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">{slots.map(slot => <button type="button" aria-pressed={selectedSlot === slot.startsAt} className={cn("min-h-11 rounded-input text-sm font-medium tabular-nums ring-1 transition-colors", selectedSlot === slot.startsAt ? "bg-primary text-primary-foreground ring-primary" : "bg-surface text-ink ring-border hover:ring-primary")} key={slot.startsAt} onClick={() => setSelectedSlot(slot.startsAt)}>{new Date(slot.startsAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: vendor.timezone })}</button>)}</div> : <p className="text-sm text-muted">No times remain on this date. Choose another available day.</p>}</section>}
          <Card className="grid gap-4">
            <h2 className="text-lg">Your details</h2>
            <Field label="Your name">{p => <Input {...p} name="name" autoComplete="name" required minLength={2} />}</Field>
            {vendor.phone_required && <Field label="Phone">{p => <Input {...p} name="phone" type="tel" autoComplete="tel" required minLength={8} />}</Field>}
            <Field label="Notes" optional>{p => <Textarea {...p} name="notes" maxLength={2000} />}</Field>
            <Checkbox required label="I accept the booking terms." />
          </Card>
          {message && <Notice tone="danger">{message}</Notice>}
          <div className="sticky bottom-0 -mx-4 border-t border-border bg-background/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
            <Button size="lg" block disabled={!selectedSlot} title={!selectedSlot ? "Choose an available time to continue" : undefined}>Reserve this time</Button>
          </div>
        </form>
      )}
    </div>
  );
}
