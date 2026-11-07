"use client";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, CalendarCheck, CheckCircle2, ChevronDown, Lock, Mail } from "lucide-react";
import { bookingErrorCopy, bookingReturnPath, dayRangeLabel, formatAmount, googleErrorCopy, parseBookingReturnPath, sameClockAt, sessionRangeLabel, tiersInWords, timezoneLabel } from "@bayana/shared";
import { Button } from "@/components/ui/button";
import { choiceVariants } from "@/components/ui/choice";
import { Card, EmptyState, LoadingState, Money, Notice, Skeleton, Stepper } from "@/components/ui/display";
import { Checkbox, Field, Input, RadioCards, Textarea } from "@/components/ui/field";
import { StickySummary } from "@/components/ui/sticky-summary";
import { GoogleButton, useGoogleEnabled } from "@/components/auth/google-button";
import { HoldCountdown } from "@/components/booking/countdown";
import { DayStep, dailyQuote } from "@/components/booking/day-step";
import { dateLabel, formatBookingWhen, formatDate, formatDateTime, formatTime, localDateKey, viewerTimezone } from "@/components/booking/time";
import { PaymentPanel, TestPaymentNotice } from "@/components/booking/payment-panel";
import { blockChoices, offersLength, rangeEnd, sessionQuote } from "@/components/booking/sessions";
import { bookingPageHref, tokenHeaders, type BookingView } from "@/components/booking/types";
import { ApiError, api, humanMessage } from "@/lib/api";
import type { PublicService, PublicVendor } from "@/lib/public-vendor";
import { priceUnit, serviceLength } from "@/lib/service-label";
import { cn } from "@/lib/utils";

/** maxBlocks: the most consecutive sessions free from this start (the API lists only starts where the minimum fits). */
type Slot = { startsAt: string; endsAt: string; maxBlocks?: number };
type Hold = { id: string; token: string | null; holdExpiresAt: string };
type Accepted = { booking: { id: string; status: string; hold_expires_at: string | null; advance_paise: string } };
type Details = { name: string; email: string; phone: string; notes: string };
const STRIP_DAYS = 14;
// Steps: 0 service, 1 time, 2 details and email code (verifying holds the time), 3 terms and payment, 4 done.
const DETAILS = 2, REVIEW = 3, DONE = 4;
/** Name, phone and notes kept in this tab while the customer is away at Google (a convenience; the email comes from Google). */
const detailsKey = (slug: string) => `bayana:booking-details:${slug}`;
const saveDetails = (slug: string, value: { name: string; phone: string; notes: string }) => { try { sessionStorage.setItem(detailsKey(slug), JSON.stringify(value)); } catch { /* storage off: the customer types them again */ } };
const loadDetails = (slug: string) => { try { const value = JSON.parse(sessionStorage.getItem(detailsKey(slug)) ?? "null") as Record<string, unknown> | null; return value && typeof value === "object" ? { name: String(value.name ?? "").slice(0, 120), phone: String(value.phone ?? "").slice(0, 20), notes: String(value.notes ?? "").slice(0, 2000) } : null; } catch { return null; } };
/**
 * One idempotency key per hold request (the same time, details and email), kept in this tab until that request is settled: a
 * second tap, a refresh while it is in flight, or Back and the same choices again send the same key, so the server returns the
 * hold it already made instead of making a second one. Without storage the key lives for this page only.
 */
const holdKeyStore = (slug: string) => `bayana:hold-key:${slug}`;
type StoredKey = { fingerprint: string; key: string };
function holdKeyFor(slug: string, fingerprint: string, memory: { current?: StoredKey }) {
  let stored = memory.current;
  try { const value = JSON.parse(sessionStorage.getItem(holdKeyStore(slug)) ?? "null") as Partial<StoredKey> | null; if (typeof value?.fingerprint === "string" && typeof value.key === "string") stored = { fingerprint: value.fingerprint, key: value.key }; } catch { /* storage off: the key in memory */ }
  if (stored?.fingerprint === fingerprint) return stored.key;
  memory.current = { fingerprint, key: crypto.randomUUID() };
  try { sessionStorage.setItem(holdKeyStore(slug), JSON.stringify(memory.current)); } catch { /* storage off: the key in memory */ }
  return memory.current.key;
}
const forgetHoldKey = (slug: string, memory: { current?: StoredKey }) => { memory.current = undefined; try { sessionStorage.removeItem(holdKeyStore(slug)); } catch { /* storage off */ } };
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const detailErrors = (value: Details, phoneRequired: boolean) => ({
  name: value.name.trim().length < 2 ? "Enter your name (at least 2 characters)." : undefined,
  email: !emailPattern.test(value.email.trim()) ? "Enter an email address you can open now; we'll send a code to it." : undefined,
  phone: phoneRequired && value.phone.trim().length < 8 ? "This business needs a phone number (at least 8 digits)." : value.phone && value.phone.trim().length > 20 ? "Use at most 20 characters." : undefined
});
const monthOf = (date: string) => date.slice(0, 7);
const nextMonth = (month: string) => { const [year, value] = month.split("-").map(Number); return value === 12 ? `${year + 1}-01` : `${year}-${String(value + 1).padStart(2, "0")}`; };

/**
 * SPEC 5.5 booking flow: service, time, details with the email code (a verified email holds the time for 15 minutes on its
 * own, by code or by Google), then the terms and the advance on one screen, then what happens next.
 */
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
  const [details, setDetails] = useState<Details>({ name: "", email: "", phone: "", notes: "" });
  // Bumped to start the details form afresh (a business account's email was cleared).
  const [detailsVersion, setDetailsVersion] = useState(0);
  const [verified, setVerified] = useState(false);
  // Set once the email is verified (code or Google return): the effect below then holds the time with the latest state.
  const [holdWanted, setHoldWanted] = useState(false); const [holding, setHolding] = useState(false); const [slotTaken, setSlotTaken] = useState(false);
  const [hold, setHold] = useState<Hold>(); const [holdExpired, setHoldExpired] = useState(false);
  const [accepted, setAccepted] = useState<Accepted>();
  const storedKey = useRef<StoredKey | undefined>(undefined); const holdInFlight = useRef(false);
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
      // Resuming (?resume=<id>&t=<token>: from the booking page, or this page refreshed after the hold) goes back to the terms.
      const resume = search.get("resume");
      if (resume) { setHold({ id: resume, token: search.get("t"), holdExpiresAt: "" }); setVerified(true); setStep(REVIEW); }
      else if (search.get("google") === "1" || search.get("google_error")) void returnFromGoogle(value);
      else if (preset) setStep(1);
    }).catch(error => setLoadError(error instanceof ApiError && error.status === 404 ? "This booking page is not available. Check the link with the business." : humanMessage(error)));
  }, [slug, search]);

  /**
   * Back from Google (intent=customer): the selection in the URL is validated again (shared rule) and restored, details come
   * from this tab, the email from the verified session. With the details complete the time is held straight away (the server
   * checks the time, the price and the session again); otherwise the details form asks for what is missing first.
   */
  const returnFromGoogle = async (value: PublicVendor) => {
    const params = new URLSearchParams(search.toString()); const error = params.get("google_error"); params.delete("google_error"); params.delete("google");
    const selection = parseBookingReturnPath(`/${value.slug}/book?${params}`);
    const chosen = selection && value.services.find(item => item.id === selection.service);
    window.history.replaceState(null, "", `/${value.slug}/book${chosen ? `?service=${chosen.id}` : ""}`);
    // A refused start comes back to /<slug>/book with only google_error: say why, then start the choice again.
    if (!selection || !chosen) { setStep(0); setMessage(error ? `${googleErrorCopy[error] ?? googleErrorCopy.google_failed} Please choose the service and time again.` : "Your choice could not be restored. Please choose the service and time again."); return; }
    setServiceId(chosen.id); setSlotDate(selection.date ?? ""); setSlotStart(chosen.booking_mode === "daily" ? "" : selection.start ?? "");
    setDayCount(chosen.booking_mode === "daily" ? selection.days ?? 0 : 0); setBlockCount(chosen.booking_mode === "daily" ? 0 : selection.blocks ?? chosen.min_blocks ?? 1);
    const kept = loadDetails(value.slug);
    const timeChosen = chosen.booking_mode === "daily" ? Boolean(selection.date && selection.days) : Boolean(selection.start);
    if (kept) setDetails(current => ({ ...current, ...kept }));
    if (error) { setMessage(googleErrorCopy[error] ?? googleErrorCopy.google_failed); setStep(timeChosen ? DETAILS : 1); return; }
    try {
      const { user } = await api<{ user: { email: string; role: string } }>("/v1/auth/me");
      if (user.role !== "CLIENT") { setMessage(googleErrorCopy.google_business_account); setStep(timeChosen ? DETAILS : 1); return; }
      setDetails(current => ({ ...current, ...(kept ?? {}), email: user.email })); setVerified(true);
      if (!timeChosen) { setStep(1); return; }
      setStep(DETAILS);
      const errors = detailErrors({ name: kept?.name ?? "", email: user.email, phone: kept?.phone ?? "", notes: "" }, value.phone_required);
      if (!errors.name && !errors.phone) setHoldWanted(true);
    } catch (failure) { setMessage(humanMessage(failure)); setStep(timeChosen ? DETAILS : 1); }
  };

  const service = vendor?.services.find(value => value.id === serviceId);
  const go = (to: number) => { setMessage(""); setStep(to); window.scrollTo({ top: 0 }); };
  const daily = service?.booking_mode === "daily";
  const markExpired = useCallback(() => setHoldExpired(true), []);
  const learnHoldExpiry = useCallback((until: string) => setHold(current => current && !current.holdExpiresAt ? { ...current, holdExpiresAt: until } : current), []);
  /** The verified email belongs to a business account (a vendor booking their own page): ask for another email. */
  const useAnotherEmail = useCallback(() => { setVerified(false); setDetails(current => ({ ...current, email: "" })); setDetailsVersion(value => value + 1); setStep(DETAILS); window.scrollTo({ top: 0 }); setMessage(bookingErrorCopy.BUSINESS_ACCOUNT_CANNOT_BOOK); }, []);
  const restartFromTime = useCallback((copy: string) => {
    if (vendor) forgetHoldKey(vendor.slug, storedKey);
    if (vendor) window.history.replaceState(null, "", `/${vendor.slug}/book${serviceId ? `?service=${serviceId}` : ""}`);
    setHold(undefined); setHoldExpired(false); setAccepted(undefined); setSlotTaken(false); setSlotStart(""); setDayCount(0); setBlockCount(0); setSlotsVersion(value => value + 1); setMessage(copy); setStep(1); window.scrollTo({ top: 0 });
  }, [vendor, serviceId]);

  const createHold = async () => {
    if (!vendor || !service || holdInFlight.current) return;
    holdInFlight.current = true; setHolding(true); setMessage("");
    const body = { slug: vendor.slug, date: slotDate, service_id: service.id, ...(daily ? { days: dayCount } : { starts_at: slotStart, ...((service.max_blocks ?? 1) > 1 ? { blocks: blockCount } : {}) }), name: details.name.trim(), phone: details.phone.trim() || undefined, notes: details.notes.trim() || undefined };
    try {
      const key = holdKeyFor(vendor.slug, JSON.stringify({ ...body, email: details.email.trim().toLowerCase() }), storedKey);
      const { booking } = await api<{ booking: { id: string; access_token?: string; hold_expires_at: string } }>("/v1/bookings", { body, headers: { "Idempotency-Key": key } });
      // From here a refresh reopens this hold (the resume path) instead of asking for a second one.
      window.history.replaceState(null, "", `/${vendor.slug}/book?resume=${booking.id}${booking.access_token ? `&t=${encodeURIComponent(booking.access_token)}` : ""}`);
      setHold({ id: booking.id, token: booking.access_token ?? null, holdExpiresAt: booking.hold_expires_at }); setHoldExpired(false); go(REVIEW);
    } catch (error) {
      if (error instanceof ApiError && error.code === "SLOT_TAKEN") { forgetHoldKey(vendor.slug, storedKey); setSlotTaken(true); window.scrollTo({ top: 0 }); }
      else if (error instanceof ApiError && error.code === "BUSINESS_ACCOUNT_CANNOT_BOOK") useAnotherEmail();
      else setMessage(humanMessage(error));
    } finally { holdInFlight.current = false; setHolding(false); }
  };
  useEffect(() => {
    if (!holdWanted || !verified || !vendor || !service) return;
    setHoldWanted(false); void createHold();
    // createHold reads the state of this render; it runs once per request, not on every change.
  }, [holdWanted, verified, vendor, service]);

  /** After agreeing: online payment stays on this screen (Checkout opens); anything else is done. */
  const agreed = (result: Accepted) => {
    setAccepted(result);
    if (result.booking.status !== "PENDING" || !vendor?.payments_enabled) { if (vendor) forgetHoldKey(vendor.slug, storedKey); go(DONE); }
  };

  if (loadError) return <EmptyState title={loadError} action={<Button asChild variant="secondary"><Link href="/">Go to Bayana</Link></Button>} />;
  if (!vendor) return <LoadingState label="Loading booking details…" className="grid gap-4"><Skeleton className="h-9 w-2/3" /><Skeleton className="h-7" /><Skeleton className="h-72 rounded-card" /></LoadingState>;
  if (!vendor.services.length) return <EmptyState title="No services are open for booking yet" description={`${vendor.display_name} hasn't listed any services. Please check back soon.`} action={<Button asChild variant="secondary"><Link href={`/${vendor.slug}`}>Back to {vendor.display_name}</Link></Button>} />;

  const steps = ["Service", daily ? "Dates" : "Time", "Details", vendor.payments_enabled ? "Review and pay" : "Review and agree"];
  const detailsOk = (() => { const errors = detailErrors(details, vendor.phone_required); return !errors.name && !errors.phone; })();
  // A verified customer who picks a time again (after "Pick another time") holds it as soon as they continue.
  const toDetails = () => { go(DETAILS); if (verified && detailsOk) setHoldWanted(true); };
  const holdUntil = accepted?.booking.hold_expires_at ?? hold?.holdExpiresAt;
  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-primary"><Lock className="size-3.5" aria-hidden />Secure booking</p>
        <h1 className="text-2xl sm:text-4xl">Book {vendor.display_name}</h1>
        <p className="text-sm text-muted">{step < steps.length ? `Step ${step + 1} of ${steps.length}: ${steps[step]} · ` : ""}{daily ? "Days" : "Times"} in {timezoneLabel(vendor.timezone, "long")}</p>
      </div>
      <Stepper steps={steps} current={step} />
      {hold && step === REVIEW && !holdExpired && holdUntil && (!accepted || accepted.booking.status === "PENDING") && <HoldCountdown until={holdUntil} onExpire={markExpired} />}
      {message && <Notice tone="danger">{message}</Notice>}

      {/* The summary follows the step so that, stuck to the bottom of a phone screen, it never covers the step's last button. */}
      <div className="flex flex-col gap-6">
        {step === 0 && <ServiceStep services={vendor.services} selected={serviceId} onSelect={id => { setServiceId(id); setSlotStart(""); setDayCount(0); setBlockCount(0); go(1); }} />}
        {step === 1 && service && daily && <DayStep vendor={vendor} service={service} version={slotsVersion} date={slotDate} days={dayCount} onDate={setSlotDate} onDays={setDayCount} onBack={() => go(0)} onNext={toDetails} />}
        {step === 1 && service && !daily && <TimeStep vendor={vendor} service={service} version={slotsVersion} date={slotDate} start={slotStart} blocks={blockCount} onDate={setSlotDate} onStart={setSlotStart} onBlocks={setBlockCount} onBack={() => go(0)} onNext={toDetails} />}
        {step === DETAILS && service && (slotTaken
          ? <Card className="grid gap-3"><h2 className="text-lg">This time was just taken</h2><p className="text-sm text-muted">{bookingErrorCopy.SLOT_TAKEN}</p><Button size="lg" block onClick={() => restartFromTime("")}>Pick another time</Button></Card>
          : <DetailsStep key={detailsVersion} phoneRequired={vendor.phone_required} value={details} verified={verified} holding={holding} onChange={setDetails} onBack={() => go(1)}
              onVerified={() => { setVerified(true); setHoldWanted(true); }} onBusinessAccount={useAnotherEmail} onHold={() => setHoldWanted(true)}
              googleNext={bookingReturnPath({ slug: vendor.slug, service: service.id, ...(slotDate ? { date: slotDate } : {}), ...(daily ? { days: dayCount || undefined } : { start: slotStart || undefined, blocks: blockCount > 1 ? blockCount : undefined }) })}
              onLeaveForGoogle={() => saveDetails(vendor.slug, { name: details.name.trim(), phone: details.phone.trim(), notes: details.notes.trim() })} />)}
        {step === REVIEW && hold && (holdExpired
          ? <Card className="grid gap-3"><h2 className="text-lg">Your hold ran out</h2><p className="text-sm text-muted">The 15 minutes passed, so the time was released for others. Nothing was charged.</p><Button onClick={() => restartFromTime("")}>Choose a time again</Button></Card>
          : <ReviewStep hold={hold} vendor={vendor} email={details.email} accepted={accepted} onHoldInfo={learnHoldExpiry} onExpired={markExpired} onAccepted={agreed} />)}
        {step === DONE && accepted && hold && <DoneStep vendor={vendor} email={details.email || "your verified email"} booking={accepted.booking} bookingHref={bookingPageHref(hold.id, hold.token)} />}
        {service && (step === 1 || step === DETAILS) && <BookingSummary service={service} timezone={vendor.timezone} startsAt={slotStart} date={slotDate} days={dayCount} blocks={blockCount} />}
      </div>
    </div>
  );
}

/** Service, when, and the money: total, the advance now and the balance later (or the price per unit before a choice). */
function BookingSummary({ service, timezone, startsAt, date, days, blocks }: { service: PublicService; timezone: string; startsAt: string; date: string; days: number; blocks: number }) {
  const daily = service.booking_mode === "daily", chosen = daily ? Boolean(date && days > 0) : Boolean(startsAt);
  const quote = !chosen ? null : daily ? dailyQuote(service, days) : sessionQuote(service, Math.max(1, blocks));
  const when = !chosen ? (daily ? "Choose your dates" : "Choose a time") : daily ? dayRangeLabel(date, days) : blocks > 1 ? sessionRangeLabel(startsAt, rangeEnd(startsAt, blocks, service.duration_minutes ?? 0), timezone) : formatDateTime(startsAt, timezone);
  const unit = priceUnit(service);
  return (
    <StickySummary title={service.name} detail={when}>
      {quote ? <>Total {formatAmount(quote.total)}{quote.advance > 0 ? <> · <strong className="font-semibold">Advance {formatAmount(quote.advance)} now</strong> · {formatAmount(quote.total - quote.advance)} later</> : " · No advance to pay"}</>
        : <>{formatAmount(Number(service.price_paise))}{unit ? ` ${unit}` : ""}{service.advance_paise > 0 ? ` · Advance ${formatAmount(service.advance_paise)} now` : ""}</>}
    </StickySummary>
  );
}

function ServiceStep({ services, selected, onSelect }: { services: PublicService[]; selected: string; onSelect: (id: string) => void }) {
  return (
    <section aria-labelledby="choose-service" className="grid gap-3">
      <h2 id="choose-service" className="text-lg">Choose a service</h2>
      <ul className="grid gap-3">{services.map(service => (
        <li key={service.id}><button type="button" aria-pressed={selected === service.id} onClick={() => onSelect(service.id)} className={cn(choiceVariants({ kind: "card", selected: selected === service.id }), "grid w-full gap-2 p-4")}>
          <span className="flex items-start justify-between gap-3"><strong>{service.name}</strong><span className="grid justify-items-end"><Money paise={service.price_paise} className="font-semibold" />{priceUnit(service) && <span className="text-xs text-muted">{priceUnit(service)}</span>}</span></span>
          {service.description && <span className="text-sm text-muted">{service.description}</span>}
          <span className="text-sm text-muted">{serviceLength(service)} · {service.advance_paise > 0 ? `${formatAmount(service.advance_paise)} now, ${formatAmount(service.remaining_paise)} later` : "No advance"}</span>
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
            <li key={day}><button type="button" aria-pressed={day === date} aria-label={dateLabel(day, "full")} onClick={() => { onDate(day); onStart(""); }} className={cn(choiceVariants({ selected: day === date }), "grid min-h-16 w-14 justify-items-center py-2 text-xs")}>
              <span>{dateLabel(day, "weekday")}</span><span className="text-lg font-semibold tabular-nums">{dateLabel(day, "day")}</span><span>{dateLabel(day, "month")}</span>
            </button></li>
          ))}</ul></div>}
      {date && <div aria-live="polite" className="grid gap-2">
        <h3 className="text-sm font-semibold">{dateLabel(date, "full")}</h3>
        {!slots ? <LoadingState label="Loading times…" className="grid grid-cols-3 gap-2 sm:grid-cols-4">{[0, 1, 2, 3, 4, 5].map(index => <Skeleton key={index} className="h-11" />)}</LoadingState>
          : slots.length ? <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4" aria-label="Open times">{slots.map(slot => (
              <li key={slot.startsAt}><button type="button" aria-pressed={start === slot.startsAt} onClick={() => pick(slot)} className={cn(choiceVariants({ selected: start === slot.startsAt }), "grid min-h-11 w-full place-items-center px-1 py-1.5 text-sm font-medium tabular-nums")}>
                {formatTime(slot.startsAt, vendor.timezone)}{!sameClockAt(viewerZone, vendor.timezone, slot.startsAt) && <span className="text-[11px] font-normal opacity-80">{formatTime(slot.startsAt, viewerZone)} yours</span>}
              </button></li>
            ))}</ul>
          : <p className="text-sm text-muted">No times remain on this day. Choose another day above.</p>}
      </div>}
      {start && offersLength(service) && choices.length > 0 && (
        <div aria-live="polite" className="grid gap-2">
          <RadioCards legend={`How long, from ${formatTime(start, vendor.timezone)}?`} name="blocks" value={String(blocks)} onChange={value => onBlocks(Number(value))}
            options={choices.map(choice => ({ value: String(choice.blocks), label: choice.label, description: `${formatTime(start, vendor.timezone)} to ${formatTime(rangeEnd(start, choice.blocks, service.duration_minutes ?? 0), vendor.timezone)} · ${formatAmount(sessionQuote(service, choice.blocks).total)}` }))} />
          {choices.length < maxBlocks - minBlocks + 1 && <p className="text-xs text-muted">Longer is not free from this time. Pick an earlier start for more.</p>}
        </div>
      )}
      <div className="flex flex-wrap gap-2"><Button variant="ghost" onClick={onBack}><ArrowLeft aria-hidden />Service</Button><Button className="flex-1" size="lg" disabled={!ready} title={!ready ? "Choose a time to continue" : undefined} onClick={onNext}>Continue</Button></div>
    </section>
  );
}

type DetailsProps = { phoneRequired: boolean; value: Details; verified: boolean; holding: boolean; onChange: (value: Details) => void; onBack: () => void; onVerified: () => void; onBusinessAccount: () => void; onHold: () => void; googleNext: string; onLeaveForGoogle: () => void };
/**
 * Name, phone and notes, then the email confirmed in place: Google, or a six-digit code. A correct code (or a verified email
 * already, after Google) holds the time; nothing is held or charged before that.
 */
function DetailsStep({ phoneRequired, value, verified, holding, onChange, onBack, onVerified, onBusinessAccount, onHold, googleNext, onLeaveForGoogle }: DetailsProps) {
  const google = useGoogleEnabled();
  const [submitted, setSubmitted] = useState(false);
  const [sent, setSent] = useState(false); const [code, setCode] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [cooldown, setCooldown] = useState(0);
  // A second submit while a code is being checked (a double tap, Enter twice) is ignored: one code, one check, one hold.
  const checking = useRef(false);
  useEffect(() => { if (!cooldown) return; const timer = setTimeout(() => setCooldown(cooldown - 1), 1000); return () => clearTimeout(timer); }, [cooldown]);
  const errors = detailErrors(value, phoneRequired);
  const send = async () => { setBusy(true); setError(""); try { await api("/v1/auth/booking/otp/request", { body: { email: value.email.trim() } }); setSent(true); setCooldown(60); } catch (failure) { setError(humanMessage(failure)); } finally { setBusy(false); } };
  const verify = async () => {
    if (!/^\d{6}$/.test(code)) { setError("Enter the six digits from the email."); return; }
    if (checking.current) return;
    checking.current = true; setBusy(true);
    try {
      const { user } = await api<{ user: { role: string } }>("/v1/auth/booking/otp/verify", { body: { email: value.email.trim(), code } });
      // The code proves the email, but a business account cannot book as a customer (the API would refuse the hold too).
      if (user.role !== "CLIENT") { onBusinessAccount(); return; }
      onVerified();
    } catch (failure) { setError(humanMessage(failure)); } finally { checking.current = false; setBusy(false); }
  };
  const submit = (event: FormEvent) => {
    event.preventDefault(); setSubmitted(true); setError("");
    if (errors.name || errors.phone || (!verified && errors.email)) return;
    if (verified) onHold(); else if (!sent) void send(); else void verify();
  };
  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      <h2 className="text-lg">Your details</h2>
      <Field label="Your name" error={submitted ? errors.name : undefined}>{p => <Input {...p} autoComplete="name" value={value.name} onChange={event => onChange({ ...value, name: event.target.value })} />}</Field>
      <Field label="Phone" optional={!phoneRequired} error={submitted ? errors.phone : undefined}>{p => <Input {...p} type="tel" autoComplete="tel" value={value.phone} onChange={event => onChange({ ...value, phone: event.target.value })} />}</Field>
      <Field label="Anything the business should know?" optional>{p => <Textarea {...p} maxLength={2000} value={value.notes} onChange={event => onChange({ ...value, notes: event.target.value })} />}</Field>
      {verified ? (
        <Card className="grid gap-3">
          <p className="flex items-center gap-2 text-sm"><CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden /><span className="min-w-0 break-all"><strong className="font-semibold">{value.email}</strong> is confirmed.</span></p>
          <Button size="lg" block loading={holding} loadingText="Holding your time…">Hold my time</Button>
        </Card>
      ) : (
        <Card className="grid gap-4">
          <div className="grid gap-1"><h3 className="text-base font-semibold">Confirm your email</h3><p className="text-sm text-muted">Nothing is held or charged until your email is confirmed. Then your time is held for 15 minutes while you read the terms.</p></div>
          {!sent && <GoogleButton intent="customer" next={googleNext} onLeave={onLeaveForGoogle} />}
          {!sent && google && <p className="flex items-center gap-3 text-xs uppercase tracking-wide text-muted" aria-hidden><span className="h-px flex-1 bg-border" />or<span className="h-px flex-1 bg-border" /></p>}
          <Field label="Email" hint={sent ? undefined : "We'll send a six-digit code. Your receipt goes here too."} error={submitted && !sent ? errors.email : undefined}>{p => <Input {...p} type="email" autoComplete="email" inputMode="email" value={value.email} disabled={sent} onChange={event => onChange({ ...value, email: event.target.value })} />}</Field>
          {!sent ? <Button size="lg" block variant={google ? "secondary" : "primary"} loading={busy} loadingText="Sending…"><Mail aria-hidden />Send my code</Button> : <>
            <Field label="Six-digit code" hint="It expires in 10 minutes.">{p => <Input {...p} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={event => setCode(event.target.value.replace(/\D/g, ""))} className="text-center text-lg tracking-[0.5em] tabular-nums" />}</Field>
            <Button size="lg" block loading={busy || holding} loadingText={holding ? "Holding your time…" : "Checking…"}>Verify and hold my time</Button>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="ghost" size="sm" disabled={cooldown > 0 || busy} onClick={() => void send()}>{cooldown > 0 ? `Send a new code in ${cooldown}s` : "Send a new code"}</Button>
              <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => { setSent(false); setCode(""); setError(""); }}>Change email</Button>
            </div>
          </>}
          {error && <Notice tone="danger">{error}</Notice>}
        </Card>
      )}
      <Button type="button" variant="ghost" className="w-fit" onClick={onBack}><ArrowLeft aria-hidden />Time</Button>
    </form>
  );
}

type ReviewProps = { hold: Hold; vendor: PublicVendor; email: string; accepted?: Accepted; onHoldInfo: (until: string) => void; onExpired: () => void; onAccepted: (result: Accepted) => void };
/**
 * The key terms, the full text one tap away, one unticked box and one button: "Agree and pay" (Checkout opens straight after
 * the agreement is saved), "Agree and send request" (offline advance) or "Agree and book" (nothing to pay). The agreement is
 * recorded by the server before any payment. A payment that fails after agreeing is retried here without agreeing again.
 */
function ReviewStep({ hold, vendor, email, accepted, onHoldInfo, onExpired, onAccepted }: ReviewProps) {
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
  // Agreed in this visit with the advance still to pay, or agreed earlier and back (refresh, booking page) to pay.
  const paying = view.payments_enabled && (accepted ? accepted.booking.status === "PENDING" : !preview && view.status === "PENDING" && view.can_pay);
  if (!preview && !paying) return <Notice tone="info">These terms were already agreed. <Link href={bookingPageHref(view.id, hold.token)}>View your booking</Link>.</Notice>;
  const online = view.payments_enabled && view.advance_paise > 0;
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (!agree || !preview) return;
    setBusy(true); setError("");
    try { onAccepted(await api<Accepted>(`/v1/bookings/${view.id}/accept`, { body: { terms_hash: preview.sha256, accepted: true }, headers: tokenHeaders(hold.token) })); }
    catch (failure) {
      if (failure instanceof ApiError && failure.code === "HOLD_EXPIRED") onExpired();
      else { setError(humanMessage(failure)); if (failure instanceof ApiError && failure.code === "TERMS_CHANGED") { setAgree(false); setVersion(value => value + 1); } }
    } finally { setBusy(false); }
  };
  return (
    <div className="grid gap-4">
      <Card className="grid gap-4">
        <h2 className="text-lg">Key terms</h2>
        <p className="text-sm">{view.service_name} with {view.vendor.display_name}, {formatBookingWhen(view, view.timezone)} ({timezoneLabel(view.timezone)})</p>
        <dl className="grid gap-2 text-sm">
          <div className="flex justify-between gap-4"><dt className="text-muted">Total price</dt><dd><Money paise={view.total_paise} size="sm" /></dd></div>
          <div className="flex justify-between gap-4 font-semibold"><dt>{view.advance_paise > 0 ? "Advance to confirm" : "Advance"}</dt><dd>{view.advance_paise > 0 ? <Money paise={view.advance_paise} size="sm" /> : "None"}</dd></div>
          <div className="flex justify-between gap-4 border-t border-border pt-2"><dt className="text-muted">Balance due later</dt><dd><Money paise={view.total_paise - view.advance_paise} size="sm" /></dd></div>
        </dl>
        <div className="grid gap-1 text-sm"><p className="font-semibold">If you cancel</p><p className="text-muted">{tiersInWords(view.cancellation_tiers)}</p></div>
      </Card>
      {paying ? (
        <Card className="grid gap-4">
          <p className="flex items-start gap-2 text-sm"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />You agreed to these terms. A copy is saved with your booking.</p>
          <PaymentPanel bookingId={view.id} token={hold.token} amountPaise={view.advance_paise} businessName={vendor.display_name} email={email.includes("@") ? email : undefined} autoStart={Boolean(accepted)}
            onSettled={settled => onAccepted({ booking: { id: settled.id, status: settled.status, hold_expires_at: settled.hold_expires_at, advance_paise: String(settled.advance_paise) } })} />
          <Button asChild variant="ghost" size="sm" className="w-full whitespace-normal py-2 text-center"><Link href={bookingPageHref(view.id, hold.token)}>Pay later from your booking page (while the time is held)</Link></Button>
        </Card>
      ) : preview && (
        <form onSubmit={submit} className="grid gap-4">
          <details className="group rounded-card bg-surface ring-1 ring-border/70">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-5 py-3 font-medium">Read the full terms<ChevronDown className="size-4 shrink-0 text-muted transition-transform group-open:rotate-180" aria-hidden /></summary>
            <div className="grid gap-2 border-t border-border px-5 py-4"><pre className="max-h-96 overflow-y-auto whitespace-pre-wrap break-words font-sans text-sm text-ink" data-testid="contract-text">{preview.body}</pre><p className="text-xs text-muted">Reference {preview.sha256.slice(0, 12)}. This exact text is saved when you agree.</p></div>
          </details>
          <Checkbox checked={agree} onChange={event => setAgree(event.target.checked)} label={`I agree to the terms with ${view.vendor.display_name} and to Bayana's terms.`}
            hint={<>We save the time, your verified email and this device as your agreement. <Link href="/terms" target="_blank">Terms of service</Link> · <Link href="/refunds" target="_blank">Refund policy</Link> · <Link href="/privacy" target="_blank">Privacy</Link></>} />
          {online && <TestPaymentNotice />}
          {error && <Notice tone="danger">{error}</Notice>}
          <Button size="lg" block disabled={!agree} title={!agree ? "Tick the box to agree to the terms" : undefined} loading={busy} loadingText="Saving your agreement…">
            {online ? `Agree and pay ${formatAmount(view.advance_paise)}` : view.advance_paise > 0 ? "Agree and send request" : "Agree and book"}
          </Button>
          {online && <p className="inline-flex items-center justify-center gap-1.5 text-xs text-muted"><Lock className="size-3.5" aria-hidden />Secured by Razorpay. Bayana never sees your card details.</p>}
        </form>
      )}
    </div>
  );
}

/** What happens next: booked, a request waiting for the offline advance, or a late payment being refunded. */
function DoneStep({ vendor, email, booking, bookingHref }: { vendor: PublicVendor; email: string; booking: Accepted["booking"]; bookingHref: string }) {
  if (booking.status === "CONFIRMED") return (
    <Card className="grid justify-items-center gap-3 py-8 text-center"><CheckCircle2 className="size-12 text-success" aria-hidden /><h2 className="text-2xl">You're booked</h2><p className="max-w-sm text-sm text-muted">{Number(booking.advance_paise) > 0 ? "Your advance is verified." : "No advance is needed."} A confirmation is on its way to {email}.</p><Button asChild><Link href={bookingHref}>View your booking</Link></Button></Card>
  );
  if (booking.status === "EXPIRED_PAID") return <Notice tone="warning">Your payment arrived after the time was taken by someone else, so we are refunding it in full. <Link href={bookingHref}>View your booking</Link>.</Notice>;
  return (
    <Card className="grid gap-4">
      <div className="flex items-start gap-3"><CalendarCheck className="mt-0.5 size-6 shrink-0 text-primary" aria-hidden /><div className="grid gap-1"><h2 className="text-lg">Request sent to {vendor.display_name}</h2><p className="text-sm text-muted">Online payment isn't switched on for {vendor.display_name} yet, so nothing has been charged. They will contact you at {email} to arrange the advance.</p></div></div>
      {booking.hold_expires_at && <Notice tone="info">Your time is reserved until {formatDate(booking.hold_expires_at, vendor.timezone)}, {formatTime(booking.hold_expires_at, vendor.timezone)}. It is confirmed once {vendor.display_name} records your advance.</Notice>}
      <Button asChild size="lg" block><Link href={bookingHref}>View your booking</Link></Button>
    </Card>
  );
}
