"use client";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, CalendarCheck, CheckCircle2, ChevronDown, Lock, Mail } from "lucide-react";
import { bookingReturnPath, dayRangeLabel, formatINR, googleErrorCopy, parseBookingReturnPath, sessionRangeLabel, tiersInWords } from "@bayana/shared";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, LoadingState, Money, Notice, Skeleton, Stepper } from "@/components/ui/display";
import { Checkbox, Field, Input, RadioCards, Textarea } from "@/components/ui/field";
import { GoogleButton, useGoogleEnabled } from "@/components/auth/google-button";
import { HoldCountdown } from "@/components/booking/countdown";
import { DayStep, dailyQuote } from "@/components/booking/day-step";
import { dateLabel, formatBookingWhen, formatDate, formatDateTime, formatTime, localDateKey, viewerTimezone } from "@/components/booking/time";
import { PaymentPanel } from "@/components/booking/payment-panel";
import { blockChoices, offersLength, rangeEnd, sessionQuote } from "@/components/booking/sessions";
import { bookingPageHref, tokenHeaders, type BookingView } from "@/components/booking/types";
import { ApiError, api, humanMessage } from "@/lib/api";
import type { PublicService, PublicVendor } from "@/lib/public-vendor";
import { priceUnit, serviceLength } from "@/lib/service-label";
import { cn } from "@/lib/utils";

const steps = ["Service", "Time", "Details", "Verify", "Review and agree", "Pay"];
/** maxBlocks: the most consecutive sessions free from this start (the API lists only starts where the minimum fits). */
type Slot = { startsAt: string; endsAt: string; maxBlocks?: number };
type Hold = { id: string; token: string | null; holdExpiresAt: string };
type Accepted = { booking: { id: string; status: string; hold_expires_at: string | null; advance_paise: string } };
const STRIP_DAYS = 14;
/** Name, phone and notes kept in this tab while the customer is away at Google (a convenience; the email comes from Google). */
const detailsKey = (slug: string) => `bayana:booking-details:${slug}`;
const saveDetails = (slug: string, value: { name: string; phone: string; notes: string }) => { try { sessionStorage.setItem(detailsKey(slug), JSON.stringify(value)); } catch { /* storage off: the customer types them again */ } };
const loadDetails = (slug: string) => { try { const value = JSON.parse(sessionStorage.getItem(detailsKey(slug)) ?? "null") as Record<string, unknown> | null; return value && typeof value === "object" ? { name: String(value.name ?? "").slice(0, 120), phone: String(value.phone ?? "").slice(0, 20), notes: String(value.notes ?? "").slice(0, 2000) } : null; } catch { return null; } };
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const monthOf = (date: string) => date.slice(0, 7);
const nextMonth = (month: string) => { const [year, value] = month.split("-").map(Number); return value === 12 ? `${year + 1}-01` : `${year}-${String(value + 1).padStart(2, "0")}`; };

/** SPEC 5.5 booking flow: service, time, details, email code (creates the 15-minute hold), terms, payment. */
export function BookingFlow() {
  const { slug } = useParams<{ slug: string }>(); const search = useSearchParams();
  const [vendor, setVendor] = useState<PublicVendor>(); const [loadError, setLoadError] = useState("");
  const [step, setStep] = useState(0); const [message, setMessage] = useState("");
  const [serviceId, setServiceId] = useState(search.get("service") ?? "");
  const [slotDate, setSlotDate] = useState(""); const [slotStart, setSlotStart] = useState(""); const [slotsVersion, setSlotsVersion] = useState(0);
  // Daily services: the number of days from slotDate (no time).
  const [dayCount, setDayCount] = useState(0);
  // Hourly services: how many consecutive sessions from slotStart (one continuous range).
  const [blockCount, setBlockCount] = useState(0);
  const [details, setDetails] = useState({ name: "", email: "", phone: "", notes: "" });
  const [verified, setVerified] = useState(false);
  const [hold, setHold] = useState<Hold>(); const [holdExpired, setHoldExpired] = useState(false);
  const [accepted, setAccepted] = useState<Accepted>();
  const idempotencyKey = useRef<string>("");
  // The start (preset service, resume, return from Google) runs once per page load: cleaning the address after a Google
  // return changes the search params, and must not start the flow over.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    api<PublicVendor>(`/v1/vendors/${encodeURIComponent(slug)}`).then(value => {
      setVendor(value);
      const preset = value.services.find(service => service.id === search.get("service"));
      setServiceId(preset?.id ?? value.services[0]?.id ?? "");
      // Resuming from the booking page (?resume=<id>&t=<token>) goes straight back to the terms.
      const resume = search.get("resume");
      if (resume) { setHold({ id: resume, token: search.get("t"), holdExpiresAt: "" }); setVerified(true); setStep(4); }
      else if (search.get("google") === "1" || search.get("google_error")) void returnFromGoogle(value);
      else if (preset) setStep(1);
    }).catch(error => setLoadError(error instanceof ApiError && error.status === 404 ? "This booking page is not available. Check the link with the business." : humanMessage(error)));
  }, [slug, search]);

  /**
   * Back from Google (intent=customer): the selection in the URL is validated again (shared rule) and restored, details come
   * from this tab, the email from the verified session. Nothing is held here: the customer presses "Hold this time" next,
   * and the server checks the time, the price and the session again.
   */
  const returnFromGoogle = async (value: PublicVendor) => {
    const params = new URLSearchParams(search.toString()); const error = params.get("google_error"); params.delete("google_error"); params.delete("google");
    const selection = parseBookingReturnPath(`/${value.slug}/book?${params}`);
    const chosen = selection && value.services.find(item => item.id === selection.service);
    window.history.replaceState(null, "", `/${value.slug}/book${chosen ? `?service=${chosen.id}` : ""}`);
    if (!selection || !chosen) { setStep(0); setMessage("Your choice could not be restored. Please choose the service and time again."); return; }
    setServiceId(chosen.id); setSlotDate(selection.date ?? ""); setSlotStart(chosen.booking_mode === "daily" ? "" : selection.start ?? "");
    setDayCount(chosen.booking_mode === "daily" ? selection.days ?? 0 : 0); setBlockCount(chosen.booking_mode === "daily" ? 0 : selection.blocks ?? chosen.min_blocks ?? 1);
    const kept = loadDetails(value.slug);
    const timeChosen = chosen.booking_mode === "daily" ? Boolean(selection.date && selection.days) : Boolean(selection.start);
    if (error) { if (kept) setDetails(current => ({ ...current, ...kept })); setMessage(googleErrorCopy[error] ?? googleErrorCopy.google_failed); setStep(timeChosen ? (kept?.name ? 3 : 2) : 1); return; }
    try {
      const { user } = await api<{ user: { email: string; role: string } }>("/v1/auth/me");
      if (user.role !== "CLIENT") { if (kept) setDetails(current => ({ ...current, ...kept })); setMessage(googleErrorCopy.google_business_account); setStep(timeChosen ? 2 : 1); return; }
      setDetails(current => ({ ...current, ...(kept ?? {}), email: user.email })); setVerified(true);
      setStep(!timeChosen ? 1 : kept && kept.name.trim().length >= 2 && (!value.phone_required || kept.phone.trim().length >= 8) ? 3 : 2);
    } catch (failure) { setMessage(humanMessage(failure)); setStep(timeChosen ? 3 : 1); }
  };

  const service = vendor?.services.find(value => value.id === serviceId);
  const go = (to: number) => { setMessage(""); setStep(to); window.scrollTo({ top: 0 }); };
  // A new time or new details is a new booking request, so it gets a new idempotency key.
  useEffect(() => { idempotencyKey.current = crypto.randomUUID(); }, [serviceId, slotStart, slotDate, dayCount, blockCount, details.name, details.phone, details.notes]);
  const daily = service?.booking_mode === "daily";
  const markExpired = useCallback(() => setHoldExpired(true), []);
  const learnHoldExpiry = useCallback((until: string) => setHold(current => current && !current.holdExpiresAt ? { ...current, holdExpiresAt: until } : current), []);
  const restartFromTime = useCallback((copy: string) => { setHold(undefined); setHoldExpired(false); setSlotStart(""); setDayCount(0); setBlockCount(0); setSlotsVersion(value => value + 1); setMessage(copy); setStep(1); }, []);

  const createHold = async () => {
    if (!vendor || !service) return;
    try {
      const { booking } = await api<{ booking: { id: string; access_token?: string; hold_expires_at: string } }>("/v1/bookings", { body: { slug: vendor.slug, date: slotDate, service_id: service.id, ...(daily ? { days: dayCount } : { starts_at: slotStart, ...((service.max_blocks ?? 1) > 1 ? { blocks: blockCount } : {}) }), name: details.name.trim(), phone: details.phone.trim() || undefined, notes: details.notes.trim() || undefined }, headers: { "Idempotency-Key": idempotencyKey.current } });
      setHold({ id: booking.id, token: booking.access_token ?? null, holdExpiresAt: booking.hold_expires_at }); setHoldExpired(false); go(4);
    } catch (error) {
      if (error instanceof ApiError && error.code === "SLOT_TAKEN") restartFromTime(humanMessage(error));
      else setMessage(humanMessage(error));
    }
  };

  if (loadError) return <EmptyState title={loadError} action={<Button asChild variant="secondary"><Link href="/">Go to Bayana</Link></Button>} />;
  if (!vendor) return <LoadingState label="Loading booking details…" className="grid gap-4"><Skeleton className="h-9 w-2/3" /><Skeleton className="h-7" /><Skeleton className="h-72 rounded-card" /></LoadingState>;
  if (!vendor.services.length) return <EmptyState title="No services are open for booking yet" description={`${vendor.display_name} hasn't listed any services. Please check back soon.`} action={<Button asChild variant="secondary"><Link href={`/${vendor.slug}`}>Back to {vendor.display_name}</Link></Button>} />;

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-primary"><Lock className="size-3.5" aria-hidden />Secure booking</p>
        <h1 className="text-2xl sm:text-4xl">Book {vendor.display_name}</h1>
        <p className="text-sm text-muted">Step {step + 1} of {steps.length}: {daily && step === 1 ? "Dates" : steps[step]} · {daily ? "Days" : "Times"} in {vendor.timezone}</p>
      </div>
      <Stepper steps={steps} current={step} />
      {service && step > 0 && step < 5 && <Summary service={service} timezone={vendor.timezone} startsAt={slotStart} date={slotDate} days={dayCount} blocks={blockCount} />}
      {hold && (step === 4 || step === 5 && vendor.payments_enabled && accepted?.booking.status === "PENDING") && !holdExpired && hold.holdExpiresAt && <HoldCountdown until={hold.holdExpiresAt} onExpire={markExpired} />}
      {message && <Notice tone="danger">{message}</Notice>}

      {step === 0 && <ServiceStep services={vendor.services} selected={serviceId} onSelect={id => { setServiceId(id); setSlotStart(""); setDayCount(0); setBlockCount(0); go(1); }} />}
      {step === 1 && service && daily && <DayStep vendor={vendor} service={service} version={slotsVersion} date={slotDate} days={dayCount} onDate={setSlotDate} onDays={setDayCount} onBack={() => go(0)} onNext={() => go(2)} />}
      {step === 1 && service && !daily && <TimeStep vendor={vendor} service={service} version={slotsVersion} date={slotDate} start={slotStart} blocks={blockCount} onDate={setSlotDate} onStart={setSlotStart} onBlocks={setBlockCount} onBack={() => go(0)} onNext={() => go(2)} />}
      {step === 2 && <DetailsStep phoneRequired={vendor.phone_required} value={details} verified={verified} onChange={setDetails} onBack={() => go(1)} onNext={() => go(3)} />}
      {step === 3 && service && <VerifyStep email={details.email} verified={verified} onVerified={() => setVerified(true)} onHold={createHold} onBack={() => go(2)}
        googleNext={bookingReturnPath({ slug: vendor.slug, service: service.id, ...(slotDate ? { date: slotDate } : {}), ...(daily ? { days: dayCount || undefined } : { start: slotStart || undefined, blocks: blockCount > 1 ? blockCount : undefined }) })}
        onLeaveForGoogle={() => saveDetails(vendor.slug, { name: details.name.trim(), phone: details.phone.trim(), notes: details.notes.trim() })} />}
      {step === 4 && hold && (holdExpired
        ? <Card className="grid gap-3"><h2 className="text-lg">Your hold ran out</h2><p className="text-sm text-muted">The 15 minutes passed, so the time was released for others. Nothing was charged.</p><Button onClick={() => restartFromTime("")}>Choose a time again</Button></Card>
        : <ReviewStep hold={hold} onHoldInfo={learnHoldExpiry} onExpired={markExpired} onAccepted={result => { setAccepted(result); go(5); }} />)}
      {step === 5 && accepted && hold && <PayStep vendor={vendor} email={details.email || "your verified email"} accepted={accepted} bookingId={hold.id} token={hold.token} bookingHref={bookingPageHref(hold.id, hold.token)} />}
    </div>
  );
}

function Summary({ service, timezone, startsAt, date, days, blocks }: { service: PublicService; timezone: string; startsAt: string; date: string; days: number; blocks: number }) {
  // Daily: the dates and price x days. Hourly: the time and the session price, or for several sessions the whole range and
  // price x sessions.
  const daily = service.booking_mode === "daily", chosen = daily && date && days > 0;
  const sessions = !daily && startsAt && blocks > 1 ? blocks : 0, unit = priceUnit(service);
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-input bg-surface-muted px-4 py-3 text-sm">
      <span className="font-medium">{service.name}{daily ? chosen && <span className="font-normal text-muted"> · {dayRangeLabel(date, days)}</span> : startsAt && <span className="font-normal text-muted"> · {sessions ? sessionRangeLabel(startsAt, rangeEnd(startsAt, sessions, service.duration_minutes ?? 0), timezone) : formatDateTime(startsAt, timezone)}</span>}</span>
      {chosen ? <Money paise={dailyQuote(service, days).total} size="sm" className="font-semibold" /> : sessions ? <Money paise={sessionQuote(service, sessions).total} size="sm" className="font-semibold" /> : <span className="inline-flex items-baseline gap-1"><Money paise={service.price_paise} size="sm" className="font-semibold" />{unit && <span className="text-xs text-muted">{unit}</span>}</span>}
    </div>
  );
}

function ServiceStep({ services, selected, onSelect }: { services: PublicService[]; selected: string; onSelect: (id: string) => void }) {
  return (
    <section aria-labelledby="choose-service" className="grid gap-3">
      <h2 id="choose-service" className="text-lg">Choose a service</h2>
      <ul className="grid gap-3">{services.map(service => (
        <li key={service.id}><button type="button" aria-pressed={selected === service.id} onClick={() => onSelect(service.id)} className={cn("grid w-full gap-2 rounded-card bg-surface p-4 text-left ring-1 transition-shadow hover:ring-primary", selected === service.id ? "ring-2 ring-primary" : "ring-border")}>
          <span className="flex items-start justify-between gap-3"><strong>{service.name}</strong><span className="grid justify-items-end"><Money paise={service.price_paise} className="font-semibold" />{priceUnit(service) && <span className="text-xs text-muted">{priceUnit(service)}</span>}</span></span>
          {service.description && <span className="text-sm text-muted">{service.description}</span>}
          <span className="text-sm text-muted">{serviceLength(service)} · {service.advance_paise > 0 ? `${formatINR(service.advance_paise)} now, ${formatINR(service.remaining_paise)} later` : "No advance"}</span>
        </button></li>
      ))}</ul>
    </section>
  );
}

function TimeStep({ vendor, service, version, date, start, blocks, onDate, onStart, onBlocks, onBack, onNext }: { vendor: PublicVendor; service: PublicService; version: number; date: string; start: string; blocks: number; onDate: (date: string) => void; onStart: (start: string) => void; onBlocks: (blocks: number) => void; onBack: () => void; onNext: () => void }) {
  const [days, setDays] = useState<string[]>(); const [slots, setSlots] = useState<Slot[]>(); const [error, setError] = useState("");
  const viewerZone = useMemo(() => viewerTimezone(), []);
  // The next open days: this month and the next, so a strip of 14 never runs dry at a month's end.
  useEffect(() => {
    setDays(undefined); setError("");
    const today = localDateKey(new Date(), vendor.timezone);
    const months = [monthOf(today), nextMonth(monthOf(today))];
    Promise.all(months.map(month => api<{ days: { date: string; available: boolean }[] }>(`/v1/vendors/${vendor.slug}/availability/month?service_id=${service.id}&month=${month}`)))
      .then(results => { const open = results.flatMap(result => result.days).filter(day => day.available && day.date >= today).map(day => day.date).slice(0, STRIP_DAYS); setDays(open); if (open.length && !open.includes(date)) onDate(open[0]); })
      .catch(failure => setError(humanMessage(failure)));
    // onDate and date are read once when the strip loads; reloading on every pick would reset the strip.
  }, [vendor.slug, vendor.timezone, service.id, version]);
  useEffect(() => {
    if (!date) return; setSlots(undefined);
    api<{ slots: Slot[] }>(`/v1/vendors/${vendor.slug}/availability/slots?service_id=${service.id}&date=${date}`).then(value => setSlots(value.slots)).catch(failure => setError(humanMessage(failure)));
  }, [vendor.slug, service.id, date, version]);
  const minBlocks = service.min_blocks ?? 1, maxBlocks = service.max_blocks ?? 1, chosenSlot = slots?.find(slot => slot.startsAt === start);
  const choices = chosenSlot ? blockChoices(service, chosenSlot.maxBlocks ?? minBlocks) : [];
  // A start whose free run got shorter (fresh slots after a failed hold) cannot keep a longer choice.
  useEffect(() => { if (start && choices.length && !choices.some(choice => choice.blocks === blocks)) onBlocks(choices[0].blocks); }, [start, blocks, choices.map(choice => choice.blocks).join(",")]);
  const pick = (slot: Slot) => { onStart(slot.startsAt); onBlocks(minBlocks); };
  const ready = Boolean(start) && (maxBlocks === 1 || choices.some(choice => choice.blocks === blocks));
  if (error) return <Notice tone="danger">{error}</Notice>;
  return (
    <section aria-labelledby="choose-time" className="grid gap-4">
      <h2 id="choose-time" className="text-lg">{offersLength(service) ? "Choose a date and start time" : "Choose a date and time"}</h2>
      {maxBlocks > 1 && <p className="text-sm text-muted">One booking is one continuous time on one day: {minBlocks === maxBlocks ? `${maxBlocks} sessions` : `${minBlocks} to ${maxBlocks} sessions`} of {serviceLength({ ...service, min_blocks: 1, max_blocks: 1 })} in a row. Sessions on different days need separate bookings.</p>}
      {!days ? <LoadingState label="Loading open days…" className="flex gap-2">{[0, 1, 2, 3, 4].map(index => <Skeleton key={index} className="h-16 w-14 shrink-0" />)}</LoadingState>
        : !days.length ? <EmptyState title="No open times in the next few weeks" description={`${vendor.display_name} has no free times soon. Please check back later or contact them directly.`} />
        : <div className="-mx-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0"><ul className="flex gap-2" aria-label="Open days">{days.map(day => (
            <li key={day}><button type="button" aria-pressed={day === date} aria-label={dateLabel(day, "full")} onClick={() => { onDate(day); onStart(""); }} className={cn("grid min-h-16 w-14 justify-items-center rounded-input py-2 text-xs ring-1 transition-colors", day === date ? "bg-primary text-primary-foreground ring-primary" : "bg-surface text-ink ring-border hover:ring-primary")}>
              <span>{dateLabel(day, "weekday")}</span><span className="text-lg font-semibold tabular-nums">{dateLabel(day, "day")}</span><span>{dateLabel(day, "month")}</span>
            </button></li>
          ))}</ul></div>}
      {date && <div aria-live="polite" className="grid gap-2">
        <h3 className="text-sm font-semibold">{dateLabel(date, "full")}</h3>
        {!slots ? <LoadingState label="Loading times…" className="grid grid-cols-3 gap-2 sm:grid-cols-4">{[0, 1, 2, 3, 4, 5].map(index => <Skeleton key={index} className="h-11" />)}</LoadingState>
          : slots.length ? <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4" aria-label="Open times">{slots.map(slot => (
              <li key={slot.startsAt}><button type="button" aria-pressed={start === slot.startsAt} onClick={() => pick(slot)} className={cn("grid min-h-11 w-full place-items-center rounded-input px-1 py-1.5 text-sm font-medium tabular-nums ring-1 transition-colors", start === slot.startsAt ? "bg-primary text-primary-foreground ring-primary" : "bg-surface text-ink ring-border hover:ring-primary")}>
                {formatTime(slot.startsAt, vendor.timezone)}{viewerZone !== vendor.timezone && <span className="text-[11px] font-normal opacity-80">{formatTime(slot.startsAt, viewerZone)} yours</span>}
              </button></li>
            ))}</ul>
          : <p className="text-sm text-muted">No times remain on this day. Choose another day above.</p>}
      </div>}
      {start && offersLength(service) && choices.length > 0 && (
        <div aria-live="polite" className="grid gap-2">
          <RadioCards legend={`How long, from ${formatTime(start, vendor.timezone)}?`} name="blocks" value={String(blocks)} onChange={value => onBlocks(Number(value))}
            options={choices.map(choice => ({ value: String(choice.blocks), label: choice.label, description: `${formatTime(start, vendor.timezone)} to ${formatTime(rangeEnd(start, choice.blocks, service.duration_minutes ?? 0), vendor.timezone)} · ${formatINR(sessionQuote(service, choice.blocks).total)}` }))} />
          {choices.length < maxBlocks - minBlocks + 1 && <p className="text-xs text-muted">Longer is not free from this time. Pick an earlier start for more.</p>}
        </div>
      )}
      {start && blocks > 1 && <p className="rounded-input bg-surface-muted px-4 py-3 text-sm" data-testid="session-summary"><strong>{sessionRangeLabel(start, rangeEnd(start, blocks, service.duration_minutes ?? 0), vendor.timezone)}</strong> · Total {formatINR(sessionQuote(service, blocks).total)}{sessionQuote(service, blocks).advance > 0 ? ` · Advance ${formatINR(sessionQuote(service, blocks).advance)} now` : ""}</p>}
      <div className="flex flex-wrap gap-2"><Button variant="ghost" onClick={onBack}><ArrowLeft aria-hidden />Service</Button><Button className="flex-1" size="lg" disabled={!ready} title={!ready ? "Choose a time to continue" : undefined} onClick={onNext}>Continue</Button></div>
    </section>
  );
}

function DetailsStep({ phoneRequired, value, verified, onChange, onBack, onNext }: { phoneRequired: boolean; value: { name: string; email: string; phone: string; notes: string }; verified: boolean; onChange: (value: { name: string; email: string; phone: string; notes: string }) => void; onBack: () => void; onNext: () => void }) {
  const [submitted, setSubmitted] = useState(false);
  const errors = {
    name: value.name.trim().length < 2 ? "Enter your name (at least 2 characters)." : undefined,
    email: !emailPattern.test(value.email.trim()) ? "Enter an email address you can open now; we'll send a code to it." : undefined,
    phone: phoneRequired && value.phone.trim().length < 8 ? "This business needs a phone number (at least 8 digits)." : value.phone && value.phone.trim().length > 20 ? "Use at most 20 characters." : undefined
  };
  const submit = (event: FormEvent) => { event.preventDefault(); setSubmitted(true); if (!errors.name && !errors.email && !errors.phone) onNext(); };
  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      <h2 className="text-lg">Your details</h2>
      <Field label="Your name" error={submitted ? errors.name : undefined}>{p => <Input {...p} autoComplete="name" value={value.name} onChange={event => onChange({ ...value, name: event.target.value })} />}</Field>
      <Field label="Email" hint={verified ? "Verified." : "We'll send a six-digit code to confirm it. Your receipt goes here too."} error={submitted ? errors.email : undefined}>{p => <Input {...p} type="email" autoComplete="email" inputMode="email" value={value.email} disabled={verified} onChange={event => onChange({ ...value, email: event.target.value })} />}</Field>
      <Field label="Phone" optional={!phoneRequired} error={submitted ? errors.phone : undefined}>{p => <Input {...p} type="tel" autoComplete="tel" value={value.phone} onChange={event => onChange({ ...value, phone: event.target.value })} />}</Field>
      <Field label="Anything the business should know?" optional>{p => <Textarea {...p} maxLength={2000} value={value.notes} onChange={event => onChange({ ...value, notes: event.target.value })} />}</Field>
      <div className="flex flex-wrap gap-2"><Button type="button" variant="ghost" onClick={onBack}><ArrowLeft aria-hidden />Time</Button><Button className="flex-1" size="lg">Continue</Button></div>
    </form>
  );
}

function VerifyStep({ email, verified, onVerified, onHold, onBack, googleNext, onLeaveForGoogle }: { email: string; verified: boolean; onVerified: () => void; onHold: () => Promise<void>; onBack: () => void; googleNext: string; onLeaveForGoogle: () => void }) {
  const google = useGoogleEnabled();
  const [sent, setSent] = useState(false); const [code, setCode] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [cooldown, setCooldown] = useState(0);
  useEffect(() => { if (!cooldown) return; const timer = setTimeout(() => setCooldown(cooldown - 1), 1000); return () => clearTimeout(timer); }, [cooldown]);
  const send = async () => { setBusy(true); setError(""); try { await api("/v1/auth/booking/otp/request", { body: { email: email.trim() } }); setSent(true); setCooldown(60); } catch (failure) { setError(humanMessage(failure)); } finally { setBusy(false); } };
  const verify = async (event: FormEvent) => {
    event.preventDefault(); setError("");
    if (!/^\d{6}$/.test(code)) { setError("Enter the six digits from the email."); return; }
    setBusy(true);
    try { await api("/v1/auth/booking/otp/verify", { body: { email: email.trim(), code } }); onVerified(); await onHold(); }
    catch (failure) { setError(humanMessage(failure)); } finally { setBusy(false); }
  };
  const holdNow = async () => { setBusy(true); try { await onHold(); } finally { setBusy(false); } };
  if (verified) return (
    <Card className="grid gap-4"><div className="grid gap-1"><h2 className="text-lg">Email confirmed</h2><p className="text-sm text-muted">{email} is verified. Hold this time for 15 minutes while you read the terms.</p></div>
      <Button size="lg" block loading={busy} loadingText="Holding your time…" onClick={() => void holdNow()}>Hold this time</Button></Card>
  );
  return (
    <Card>
      <form onSubmit={verify} noValidate className="grid gap-4">
        <div className="grid gap-1"><h2 className="text-lg">Confirm your email</h2><p className="text-sm text-muted">Nothing is held or charged until your email is confirmed.</p></div>
        <GoogleButton intent="customer" next={googleNext} onLeave={onLeaveForGoogle} />
        {google && <p className="-mt-2 text-center text-xs text-muted">Google confirms your email; you will use that address for this booking. You come back here to hold the time.</p>}
        {google && <p className="flex items-center gap-3 text-xs uppercase tracking-wide text-muted" aria-hidden><span className="h-px flex-1 bg-border" />or<span className="h-px flex-1 bg-border" /></p>}
        <p className="flex items-center gap-2 rounded-input bg-surface-muted px-3 py-2 text-sm"><Mail className="size-4 shrink-0 text-muted" aria-hidden /><span className="min-w-0 break-all">{email}</span></p>
        {!sent ? <Button type="button" size="lg" block variant={google ? "secondary" : "primary"} loading={busy} loadingText="Sending…" onClick={() => void send()}>Send my code</Button> : <>
          <Field label="Six-digit code" hint="It expires in 10 minutes.">{p => <Input {...p} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={event => setCode(event.target.value.replace(/\D/g, ""))} className="text-center text-lg tracking-[0.5em] tabular-nums" />}</Field>
          <Button size="lg" block loading={busy} loadingText="Checking…">Verify and hold my time</Button>
          <Button type="button" variant="ghost" size="sm" className="w-fit" disabled={cooldown > 0 || busy} onClick={() => void send()}>{cooldown > 0 ? `Send a new code in ${cooldown}s` : "Send a new code"}</Button>
        </>}
        {error && <Notice tone="danger">{error}</Notice>}
        <Button type="button" variant="ghost" size="sm" className="w-fit" onClick={onBack}><ArrowLeft aria-hidden />Change email or details</Button>
      </form>
    </Card>
  );
}

function ReviewStep({ hold, onHoldInfo, onExpired, onAccepted }: { hold: Hold; onHoldInfo: (until: string) => void; onExpired: () => void; onAccepted: (result: Accepted) => void }) {
  const [view, setView] = useState<BookingView>(); const [agree, setAgree] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [version, setVersion] = useState(0);
  useEffect(() => {
    api<BookingView>(`/v1/bookings/${hold.id}`, { headers: tokenHeaders(hold.token) }).then(value => {
      if (value.status === "EXPIRED") return onExpired();
      setView(value); if (value.hold_expires_at) onHoldInfo(value.hold_expires_at);
    }).catch(failure => setError(humanMessage(failure)));
  }, [hold.id, hold.token, version, onExpired, onHoldInfo]);
  if (error && !view) return <Notice tone="danger">{error}</Notice>;
  if (!view) return <LoadingState label="Preparing your terms…" className="grid gap-3"><Skeleton className="h-36 rounded-card" /><Skeleton className="h-11" /></LoadingState>;
  const preview = view.contract_preview;
  if (!preview) return <Notice tone="info">These terms were already agreed. <Link href={bookingPageHref(view.id, hold.token)}>View your booking</Link>.</Notice>;
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (!agree) { setError("Tick the box to agree to the terms."); return; }
    setBusy(true); setError("");
    try { onAccepted(await api<Accepted>(`/v1/bookings/${view.id}/accept`, { body: { terms_hash: preview.sha256, accepted: true }, headers: tokenHeaders(hold.token) })); }
    catch (failure) {
      if (failure instanceof ApiError && failure.code === "HOLD_EXPIRED") onExpired();
      else { setError(humanMessage(failure)); if (failure instanceof ApiError && failure.code === "TERMS_CHANGED") { setAgree(false); setVersion(value => value + 1); } }
    } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="grid gap-4">
      <Card className="grid gap-4">
        <h2 className="text-lg">Key terms</h2>
        <p className="text-sm">{view.service_name} with {view.vendor.display_name}, {formatBookingWhen(view, view.timezone)} ({view.timezone})</p>
        <dl className="grid gap-2 text-sm">
          <div className="flex justify-between gap-4"><dt className="text-muted">Total price</dt><dd><Money paise={view.total_paise} size="sm" /></dd></div>
          <div className="flex justify-between gap-4 font-semibold"><dt>{view.advance_paise > 0 ? "Advance to confirm" : "Advance"}</dt><dd>{view.advance_paise > 0 ? <Money paise={view.advance_paise} size="sm" /> : "None"}</dd></div>
          <div className="flex justify-between gap-4 border-t border-border pt-2"><dt className="text-muted">Balance due later</dt><dd><Money paise={view.total_paise - view.advance_paise} size="sm" /></dd></div>
        </dl>
        <div className="grid gap-1 text-sm"><p className="font-semibold">If you cancel</p><p className="text-muted">{tiersInWords(view.cancellation_tiers)}</p></div>
      </Card>
      <details className="group rounded-card bg-surface ring-1 ring-border/70">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-5 py-3 font-medium">Read the full terms<ChevronDown className="size-4 shrink-0 text-muted transition-transform group-open:rotate-180" aria-hidden /></summary>
        <div className="grid gap-2 border-t border-border px-5 py-4"><pre className="max-h-96 overflow-y-auto whitespace-pre-wrap break-words font-sans text-sm text-ink" data-testid="contract-text">{preview.body}</pre><p className="text-xs text-muted">Reference {preview.sha256.slice(0, 12)}. This exact text is saved when you agree.</p></div>
      </details>
      <Checkbox checked={agree} onChange={event => setAgree(event.target.checked)} label={`I have read and agree to the terms with ${view.vendor.display_name}, and to Bayana's terms and refund policy.`} hint={<>Bayana&apos;s <Link href="/terms" target="_blank">terms of service</Link> and <Link href="/refunds" target="_blank">refund policy</Link> apply alongside the business&apos;s own terms above. We record the time, your verified email and this device as evidence of your agreement. How we handle your details: <Link href="/privacy" target="_blank">privacy policy</Link>.</>} />
      {error && <Notice tone="danger">{error}</Notice>}
      <Button size="lg" block loading={busy} loadingText="Saving your agreement…">Agree and continue</Button>
    </form>
  );
}

function PayStep({ vendor, email, accepted, bookingId, token, bookingHref }: { vendor: PublicVendor; email: string; accepted: Accepted; bookingId: string; token: string | null; bookingHref: string }) {
  const [booking, setBooking] = useState(accepted.booking);
  if (booking.status === "CONFIRMED") return (
    <Card className="grid justify-items-center gap-3 py-8 text-center"><CheckCircle2 className="size-12 text-success" aria-hidden /><h2 className="text-2xl">You're booked</h2><p className="max-w-sm text-sm text-muted">{Number(booking.advance_paise) > 0 ? "Your advance is verified." : "No advance is needed."} A confirmation is on its way to {email}.</p><Button asChild><Link href={bookingHref}>View your booking</Link></Button></Card>
  );
  if (booking.status === "EXPIRED_PAID") return <Notice tone="warning">Your payment arrived after the time was taken by someone else, so we are refunding it in full. <Link href={bookingHref}>View your booking</Link>.</Notice>;
  if (!vendor.payments_enabled) return (
    <Card className="grid gap-4">
      <div className="flex items-start gap-3"><CalendarCheck className="mt-0.5 size-6 shrink-0 text-primary" aria-hidden /><div className="grid gap-1"><h2 className="text-lg">Request sent to {vendor.display_name}</h2><p className="text-sm text-muted">Online payment isn't switched on for {vendor.display_name} yet, so nothing has been charged. They will contact you at {email} to arrange the advance.</p></div></div>
      {booking.hold_expires_at && <Notice tone="info">Your time is reserved until {formatDate(booking.hold_expires_at, vendor.timezone)}, {formatTime(booking.hold_expires_at, vendor.timezone)}. It is confirmed once {vendor.display_name} records your advance.</Notice>}
      <Button asChild size="lg" block><Link href={bookingHref}>View your booking</Link></Button>
    </Card>
  );
  return (
    <Card className="grid gap-4">
      <div className="grid gap-1"><h2 className="text-lg">Pay the advance</h2><p className="text-sm text-muted">Pay <strong className="text-ink">{formatINR(Number(booking.advance_paise))}</strong> now to confirm. The rest is due later, as agreed. Your booking is confirmed only once the payment is verified.</p></div>
      <PaymentPanel bookingId={bookingId} token={token} amountPaise={Number(booking.advance_paise)} businessName={vendor.display_name} email={email.includes("@") ? email : undefined} onSettled={view => setBooking(current => ({ ...current, status: view.status, hold_expires_at: view.hold_expires_at }))} />
      <Button asChild variant="ghost" size="sm" className="w-fit"><Link href={bookingHref}>Pay later from your booking page (while the time is held)</Link></Button>
    </Card>
  );
}
