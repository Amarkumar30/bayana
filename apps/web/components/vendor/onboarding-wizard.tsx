"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, ExternalLink } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { slugProblem, suggestSlug, weeklyScheduleSchema } from "@bayana/shared";
import { Button } from "@/components/ui/button";
import { LoadingState, Notice, Skeleton, Stepper } from "@/components/ui/display";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { ApiError, api, fieldErrors, humanMessage, requirementCopy } from "@/lib/api";
import { ServiceForm } from "./service-form";
import { categories, timezones, weekdayNames, type Checklist, type Profile } from "./types";

const steps = ["Your business", "First service", "Your hours", "Publish"];

/** SPEC 5.3 onboarding: profile, first service, availability, publish. Resumes at the first unfinished step. */
export function OnboardingWizard() {
  const router = useRouter();
  const [step, setStep] = useState<number>(); const [profile, setProfile] = useState<Profile>();
  const refresh = async () => {
    try {
      const [me, checklist] = await Promise.all([api<Profile>("/v1/vendor/me"), api<Checklist>("/v1/vendor/checklist")]);
      setProfile(me);
      const done = Object.fromEntries(checklist.steps.map(item => [item.key, item.done]));
      setStep(current => current ?? (!done.service ? 1 : !done.availability ? 2 : 3));
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 401) router.replace("/login?next=/onboarding");
      else setStep(0);
    }
  };
  // Runs once on mount; refresh only reads state setters.
  useEffect(() => { void refresh(); }, []);
  const next = async (to: number) => { await refresh(); setStep(to); };

  if (step === undefined) return <LoadingState label="Loading your setup…" className="grid gap-4"><Skeleton className="h-8" /><Skeleton className="h-8 w-2/3" /><Skeleton className="h-48" /></LoadingState>;
  return (
    <div className="grid gap-6">
      <Stepper steps={steps} current={step} />
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">Step {Math.min(step + 1, 4)} of 4</p>
      {step === 0 && <ProfileStep onDone={() => void next(1)} />}
      {step === 1 && <div className="grid gap-4"><div className="grid gap-1"><h1 className="text-2xl">Add your first service</h1><p className="text-sm text-muted">What can clients book? You can add more and fine-tune refunds and terms later.</p></div><ServiceForm compact submitLabel="Save and continue" onSaved={() => void next(2)} /><Button variant="ghost" size="sm" className="w-fit" onClick={() => setStep(2)}>Skip for now</Button></div>}
      {step === 2 && <HoursStep dailyOnly={Boolean(profile?.services.length) && profile!.services.every(service => service.booking_mode === "daily")} onDone={() => void next(3)} onSkip={() => setStep(3)} />}
      {step === 3 && profile && <PublishStep profile={profile} onBack={setStep} onPublished={() => void refresh()} />}
    </div>
  );
}

function ProfileStep({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState({ business_name: "", slug: "", city: "", description: "", category: "other", timezone: "Asia/Kolkata" });
  const [slugEdited, setSlugEdited] = useState(false); const [submitted, setSubmitted] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [server, setServer] = useState<Record<string, string>>({});
  const slug = slugEdited ? form.slug : suggestSlug(form.business_name);
  const errors: Record<string, string | undefined> = { business_name: form.business_name.trim().length < 2 ? "Use at least 2 characters." : undefined, slug: slugProblem(slug) ?? undefined, city: form.city.trim().length < 2 ? "Use at least 2 characters." : undefined, ...server };
  const shown = (name: string) => submitted || name === "slug" && slug ? errors[name] : server[name];
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSubmitted(true); setServer({});
    if (errors.business_name || errors.slug || errors.city) return;
    setBusy(true); setError("");
    try { await api("/v1/vendor/me", { body: { business_name: form.business_name, slug, city: form.city, description: form.description, categories: [form.category], timezone: form.timezone } }); onDone(); }
    catch (failure) { if (failure instanceof ApiError && failure.code === "SLUG_TAKEN") setServer({ slug: failure.message }); else { setServer(fieldErrors(failure)); setError(humanMessage(failure)); } }
    finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      <div className="grid gap-1"><h1 className="text-2xl">Tell clients who you are</h1><p className="text-sm text-muted">This appears at the top of your booking page.</p></div>
      <Field label="Business name" error={shown("business_name")}>{p => <Input {...p} value={form.business_name} onChange={event => setForm({ ...form, business_name: event.target.value })} placeholder="Studio Sunday" autoFocus />}</Field>
      <Field label="Your link" error={shown("slug")} hint={!shown("slug") && slug ? `bayana.in/${slug}` : "Lowercase letters, numbers and hyphens."}>{p => <Input {...p} value={slug} onChange={event => { setSlugEdited(true); setForm({ ...form, slug: event.target.value.toLowerCase() }); setServer({}); }} placeholder="studio-sunday" />}</Field>
      <Field label="Category">{p => <Select {...p} value={form.category} onChange={event => setForm({ ...form, category: event.target.value })}>{categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select>}</Field>
      <Field label="City" error={shown("city")}>{p => <Input {...p} value={form.city} onChange={event => setForm({ ...form, city: event.target.value })} placeholder="Mumbai" />}</Field>
      <Field label="Timezone" hint="Your hours and bookings use this timezone.">{p => <Select {...p} value={form.timezone} onChange={event => setForm({ ...form, timezone: event.target.value })}>{timezones.map(zone => <option key={zone}>{zone}</option>)}</Select>}</Field>
      <Field label="Short description" optional>{p => <Textarea {...p} value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} placeholder="What you do, in one or two sentences." />}</Field>
      {error && <Notice tone="danger">{error}</Notice>}
      <Button size="lg" block loading={busy} loadingText="Saving…">Save and continue</Button>
    </form>
  );
}

/** Weekdays and hours. A vendor whose services are all per day only chooses open days (a day is open when it has any hours). */
function HoursStep({ dailyOnly = false, onDone, onSkip }: { dailyOnly?: boolean; onDone: () => void; onSkip: () => void }) {
  const [days, setDays] = useState<boolean[]>([false, true, true, true, true, true, false]); const [from, setFrom] = useState("09:00"); const [to, setTo] = useState("18:00");
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const windows = days.flatMap((on, weekday) => on ? [{ weekday, start_time: from, end_time: to }] : []);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); const parsed = weeklyScheduleSchema.safeParse({ windows });
    if (!windows.length) { setError("Choose at least one day."); return; }
    if (!parsed.success) { setError(parsed.error.issues[0].message); return; }
    setBusy(true); setError("");
    try { await api("/v1/vendor/availability/rules", { method: "PUT", body: { windows } }); onDone(); } catch (failure) { setError(humanMessage(failure)); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="grid gap-4">
      <div className="grid gap-1"><h1 className="text-2xl">{dailyOnly ? "Which days are you open?" : "When do you take bookings?"}</h1><p className="text-sm text-muted">{dailyOnly ? "Your services are booked by the whole day, so only open or closed matters. You can close single dates and add time off later." : "Start simple. You can add split hours, holidays and time off later."}</p></div>
      <fieldset className="grid gap-2"><legend className="mb-1 text-sm font-medium">Days</legend>
        <div className="flex flex-wrap gap-2">{weekdayNames.map((name, weekday) => <button key={name} type="button" aria-pressed={days[weekday]} onClick={() => setDays(days.map((value, at) => at === weekday ? !value : value))} className={`min-h-11 min-w-14 rounded-input px-3 text-sm font-semibold ring-1 transition-colors ${days[weekday] ? "bg-primary text-primary-foreground ring-primary" : "bg-surface text-ink ring-border"}`}>{name.slice(0, 3)}</button>)}</div>
      </fieldset>
      {!dailyOnly && <div className="grid grid-cols-2 gap-3"><Field label="From">{p => <Input {...p} type="time" value={from} onChange={event => setFrom(event.target.value)} />}</Field><Field label="To">{p => <Input {...p} type="time" value={to} onChange={event => setTo(event.target.value)} />}</Field></div>}
      {error && <Notice tone="danger">{error}</Notice>}
      <Button size="lg" block loading={busy} loadingText="Saving…">Save and continue</Button>
      <Button type="button" variant="ghost" size="sm" className="w-fit" onClick={onSkip}>Skip for now</Button>
    </form>
  );
}

function PublishStep({ profile, onBack, onPublished }: { profile: Profile; onBack: (step: number) => void; onPublished: () => void }) {
  const [policies, setPolicies] = useState({ terms: profile.terms, cancellation_policy: profile.cancellation_policy, rescheduling_policy: profile.rescheduling_policy, description: profile.description });
  const [busy, setBusy] = useState(false); const [missing, setMissing] = useState<string[]>([]); const [error, setError] = useState("");
  if (profile.published) return (
    <div className="grid justify-items-center gap-4 py-4 text-center">
      <CheckCircle2 className="size-12 text-success" aria-hidden />
      <h1 className="text-2xl">Your page is live</h1>
      <p className="break-all rounded-input bg-surface-muted px-3 py-2.5 font-mono text-sm">bayana.in/{profile.slug}</p>
      <div className="flex flex-wrap justify-center gap-2"><Button asChild variant="secondary"><a href={`/${profile.slug}`} target="_blank" rel="noreferrer"><ExternalLink aria-hidden />View page</a></Button><Button asChild><Link href="/dashboard">Go to dashboard</Link></Button></div>
    </div>
  );
  const publish = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(""); setMissing([]);
    try { await api("/v1/vendor/me", { method: "PATCH", body: policies }); await api("/v1/vendor/publish", { body: {} }); onPublished(); }
    catch (failure) { if (failure instanceof ApiError && Array.isArray(failure.details.missing)) setMissing(failure.details.missing as string[]); else setError(humanMessage(failure)); }
    finally { setBusy(false); }
  };
  const stepFor: Record<string, number> = { active_service: 1, valid_advance_rules: 1, availability: 2 };
  return (
    <form onSubmit={publish} className="grid gap-4">
      <div className="grid gap-1"><h1 className="text-2xl">Your terms, then publish</h1><p className="text-sm text-muted">Clients read these before they pay. Plain language works best.</p></div>
      <Field label="Short description">{p => <Textarea {...p} value={policies.description} onChange={event => setPolicies({ ...policies, description: event.target.value })} />}</Field>
      <Field label="Booking terms">{p => <Textarea {...p} value={policies.terms} onChange={event => setPolicies({ ...policies, terms: event.target.value })} placeholder="The advance confirms your date. The balance is due on the day." />}</Field>
      <Field label="Cancellation policy">{p => <Textarea {...p} value={policies.cancellation_policy} onChange={event => setPolicies({ ...policies, cancellation_policy: event.target.value })} placeholder="Full refund of the advance up to 7 days before." />}</Field>
      <Field label="Rescheduling policy">{p => <Textarea {...p} value={policies.rescheduling_policy} onChange={event => setPolicies({ ...policies, rescheduling_policy: event.target.value })} placeholder="One free reschedule with 48 hours' notice." />}</Field>
      {missing.length > 0 && <Notice tone="warning"><p className="mb-1 font-semibold">A few things before you publish:</p><ul className="grid gap-1">{missing.map(key => <li key={key} className="flex flex-wrap items-center justify-between gap-2"><span>{requirementCopy[key] ?? key}</span>{stepFor[key] !== undefined && <Button type="button" size="sm" variant="secondary" onClick={() => onBack(stepFor[key])}>Fix</Button>}</li>)}</ul></Notice>}
      {error && <Notice tone="danger">{error}</Notice>}
      <Button size="lg" block loading={busy} loadingText="Publishing…">Publish my page</Button>
    </form>
  );
}
