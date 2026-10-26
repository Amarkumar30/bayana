"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { manualBookingSchema, rescheduleSchema, vendorCancelSchema, formatINR } from "@bayana/shared";
import type { ZodError } from "zod";
import { formatBookingWhen, formatDateTime, localDateKey } from "@/components/booking/time";
import { serviceLength } from "@/lib/service-label";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Notice } from "@/components/ui/display";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { api, vendorMessage } from "@/lib/api";
import type { BookingDetail } from "./types";

const firstErrors = (error: ZodError) => Object.fromEntries(Object.entries(error.flatten().fieldErrors).map(([key, list]) => [key, (list as string[] | undefined)?.[0] ?? ""]));
const actionsRow = (children: ReactNode) => <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{children}</div>;

type ServiceOption = { id: string; name: string; price_paise: string | number; duration_minutes: number | null; booking_mode: "hourly" | "daily"; min_days: number | null; max_days: number | null; active: boolean };
/** BK-13: a walk-in or phone booking. The server checks the time against other bookings and time off. */
export function NewBookingDialog({ defaultDate, trigger, onCreated }: { defaultDate?: string; trigger?: ReactNode; onCreated?: (id: string) => void }) {
  const router = useRouter(); const toast = useToast();
  const [open, setOpen] = useState(false); const [services, setServices] = useState<ServiceOption[]>(); const [errors, setErrors] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState(""); const [busy, setBusy] = useState(false); const [key, setKey] = useState("");
  // Daily services take a number of days instead of a start time.
  const [serviceId, setServiceId] = useState(""); const chosen = services?.find(service => service.id === serviceId); const daily = chosen?.booking_mode === "daily";
  useEffect(() => {
    if (!open) return;
    setKey(crypto.randomUUID()); setProblem(""); setErrors({});
    api<{ services: ServiceOption[] }>("/v1/vendor/services").then(result => setServices(result.services.filter(service => service.active))).catch(failure => setProblem(vendorMessage(failure)));
  }, [open]);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    // A placeholder <option disabled> sends nothing in FormData, so every value is read as a string ("" when absent).
    const value = (key: string) => String(form.get(key) ?? "");
    const parsed = manualBookingSchema.safeParse({ service_id: value("service_id"), date: value("date"), ...(daily ? { days: Number(value("days")) } : { time: value("time") || undefined }), name: value("name"), email: value("email"), phone: value("phone"), notes: value("notes") });
    if (!parsed.success) { setErrors(firstErrors(parsed.error)); return; }
    setErrors({}); setProblem(""); setBusy(true);
    try {
      const created = await api<{ id: string }>("/v1/vendor/bookings", { body: parsed.data, headers: { "Idempotency-Key": key } });
      toast({ title: "Booking added", description: `${parsed.data.name} has the time. A confirmation email is on its way.`, tone: "success" }); setOpen(false);
      if (onCreated) onCreated(created.id); else router.push(`/dashboard/bookings/${created.id}`);
    } catch (failure) { setProblem(vendorMessage(failure)); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger ?? <Button>New booking</Button>}</DialogTrigger>
      <DialogContent title="New booking" description="For a walk-in or a phone booking. It takes the time straight away, so customers can't book it online.">
        <form onSubmit={submit} noValidate className="grid max-h-[70dvh] gap-3 overflow-y-auto pr-1">
          <Field label="Service" error={errors.service_id}>{p => <Select {...p} name="service_id" value={serviceId} onChange={event => setServiceId(event.target.value)} required><option value="" disabled>{services ? "Choose a service" : "Loading services…"}</option>{services?.map(service => <option key={service.id} value={service.id}>{service.name} · {formatINR(Number(service.price_paise))}{` · ${service.booking_mode === "daily" ? `per day, ${serviceLength(service)}` : serviceLength(service)}`}</option>)}</Select>}</Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date" error={errors.date}>{p => <Input {...p} name="date" type="date" defaultValue={defaultDate} required />}</Field>
            {daily
              ? <Field label="Number of days" error={errors.days} hint={`${chosen?.min_days ?? 1} to ${chosen?.max_days ?? 1}, from the date.`}>{p => <Input {...p} key="days" name="days" type="number" min={chosen?.min_days ?? 1} max={chosen?.max_days ?? 1} defaultValue={chosen?.min_days ?? 1} required />}</Field>
              : <Field label="Start time" error={errors.time}>{p => <Input {...p} key="time" name="time" type="time" step={300} defaultValue="10:00" />}</Field>}
          </div>
          <Field label="Customer name" error={errors.name}>{p => <Input {...p} name="name" autoComplete="off" required />}</Field>
          <Field label="Customer email" error={errors.email} hint="They get the confirmation and a private link to the booking.">{p => <Input {...p} name="email" type="email" autoComplete="off" required />}</Field>
          <Field label="Phone" optional error={errors.phone}>{p => <Input {...p} name="phone" type="tel" autoComplete="off" />}</Field>
          <Field label="Notes" optional>{p => <Textarea {...p} name="notes" maxLength={2000} />}</Field>
          <Notice tone="info">No advance is asked online for bookings you add. Record any money you receive on the booking page.</Notice>
          {problem && <Notice tone="danger">{problem}</Notice>}
          {actionsRow(<><DialogClose asChild><Button type="button" variant="secondary">Cancel</Button></DialogClose><Button loading={busy} loadingText="Adding…">Add booking</Button></>)}
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** BK-11: the vendor cancels with a reason; everything paid goes back to the customer. */
export function CancelBookingDialog({ booking, onDone }: { booking: BookingDetail; onDone: () => void }) {
  const [open, setOpen] = useState(false); const [reason, setReason] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const submit = async () => {
    const parsed = vendorCancelSchema.safeParse({ reason });
    if (!parsed.success) { setError(parsed.error.issues[0].message); return; }
    setBusy(true); setError("");
    try { await api(`/v1/vendor/bookings/${booking.id}/cancel`, { body: parsed.data }); onDone(); setOpen(false); }
    catch (failure) { setError(vendorMessage(failure)); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="danger">Cancel booking</Button></DialogTrigger>
      <DialogContent title="Cancel this booking?" description={`${booking.client_name}, ${booking.service_name ?? "booking"}, ${formatBookingWhen(booking, booking.timezone)}`}>
        <Notice tone={booking.paid_paise > 0 ? "warning" : "info"}>{booking.paid_paise > 0 ? `${formatINR(booking.paid_paise)} goes back to the customer in full. Online payments are refunded automatically; money paid to you directly you return yourself.` : "Nothing has been paid, so there is nothing to refund."}</Notice>
        <Field label="Reason" hint="The customer sees this in their email." error={error && !busy ? error : undefined}>{p => <Textarea {...p} value={reason} maxLength={500} onChange={event => setReason(event.target.value)} />}</Field>
        {actionsRow(<><DialogClose asChild><Button variant="secondary">Keep booking</Button></DialogClose><Button variant="danger" loading={busy} loadingText="Cancelling…" onClick={() => void submit()}>Cancel and refund</Button></>)}
      </DialogContent>
    </Dialog>
  );
}

/** BK-09: a new time; the payments and agreed terms stay with the booking. */
export function RescheduleDialog({ booking, onDone }: { booking: BookingDetail; onDone: () => void }) {
  const [open, setOpen] = useState(false); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    // A daily booking moves to a new first day and keeps its number of days; an hourly one needs the new time too.
    const parsed = rescheduleSchema.safeParse(daily ? { date: form.get("date") } : { date: form.get("date"), time: form.get("time") });
    if (!parsed.success) { setError(parsed.error.issues[0].message); return; }
    setBusy(true); setError("");
    try { await api(`/v1/vendor/bookings/${booking.id}/reschedule`, { body: parsed.data }); onDone(); setOpen(false); }
    catch (failure) { setError(vendorMessage(failure)); } finally { setBusy(false); }
  };
  const startTime = new Intl.DateTimeFormat("en-GB", { timeZone: booking.timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(booking.starts_at));
  const daily = booking.booking_mode === "daily";
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="secondary">{daily ? "Move to other dates" : "Move to another time"}</Button></DialogTrigger>
      <DialogContent title="Move this booking" description={`Now ${formatBookingWhen(booking, booking.timezone)} (${booking.timezone}). ${daily ? " It keeps its number of days." : ""} The customer gets an email with the new ${daily ? "dates" : "time"}.`}>
        <form onSubmit={submit} noValidate className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label={daily ? "New first day" : "New date"}>{p => <Input {...p} name="date" type="date" defaultValue={booking.first_date ?? localDateKey(new Date(booking.starts_at), booking.timezone)} required />}</Field>
            {!daily && <Field label="New start time">{p => <Input {...p} name="time" type="time" step={300} defaultValue={startTime} />}</Field>}
          </div>
          {error && <Notice tone="danger">{error}</Notice>}
          {actionsRow(<><DialogClose asChild><Button type="button" variant="secondary">Keep the time</Button></DialogClose><Button loading={busy} loadingText="Moving…">Move booking</Button></>)}
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** BK-12: offered only after a confirmed booking has ended. */
export function CompleteButton({ booking, onDone }: { booking: BookingDetail; onDone: () => void }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const complete = async () => {
    setBusy(true); setError("");
    try { await api(`/v1/vendor/bookings/${booking.id}/complete`, { body: {} }); onDone(); } catch (failure) { setError(vendorMessage(failure)); } finally { setBusy(false); }
  };
  return <div className="grid gap-2"><Button loading={busy} loadingText="Saving…" onClick={() => void complete()}>Mark as completed</Button>{error && <Notice tone="danger">{error}</Notice>}</div>;
}
