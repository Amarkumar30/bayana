"use client";
import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Copy, ExternalLink, Rocket } from "lucide-react";
import { PageHeader } from "@/components/layout/brand";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, EmptyState, LoadingState, Notice, Skeleton } from "@/components/ui/display";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { ChecklistCard } from "@/components/vendor/checklist-card";
import { timezones, type Checklist, type Profile } from "@/components/vendor/types";
import { ApiError, api, humanMessage, requirementCopy } from "@/lib/api";

type State = { kind: "loading" } | { kind: "signed-out" } | { kind: "no-profile" } | { kind: "error"; message: string } | { kind: "ready"; profile: Profile; checklist: Checklist };

export default function Dashboard() {
  const toast = useToast();
  const [state, setState] = useState<State>({ kind: "loading" }); const [notice, setNotice] = useState<{ tone: "danger" | "warning"; text: string }>(); const [busy, setBusy] = useState("");
  const load = useCallback(async () => {
    try { const [profile, checklist] = await Promise.all([api<Profile>("/v1/vendor/me"), api<Checklist>("/v1/vendor/checklist")]); setState({ kind: "ready", profile, checklist }); }
    catch (failure) { setState(failure instanceof ApiError && failure.status === 401 ? { kind: "signed-out" } : failure instanceof ApiError && failure.code === "PROFILE_NOT_FOUND" ? { kind: "no-profile" } : { kind: "error", message: humanMessage(failure) }); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (state.kind === "loading") return <LoadingState label="Loading your dashboard…" className="grid gap-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-48 rounded-card" /><Skeleton className="h-64 rounded-card" /></LoadingState>;
  if (state.kind === "signed-out") return <EmptyState className="mx-auto max-w-xl" title="Sign in to manage your business" description="Your dashboard is private. Sign in with your password or an email code." action={<div className="flex flex-wrap justify-center gap-2"><Button asChild><Link href="/login?next=/dashboard">Sign in</Link></Button><Button asChild variant="secondary"><Link href="/signup">Create an account</Link></Button></div>} />;
  if (state.kind === "no-profile") return <EmptyState className="mx-auto max-w-xl" icon={<Rocket />} title="Let's set up your booking page" description="Four short steps: your business, a first service, your hours, then publish." action={<Button asChild><Link href="/onboarding">Start setup</Link></Button>} />;
  if (state.kind === "error") return <Notice tone="danger">{state.message}</Notice>;
  const { profile, checklist } = state;

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = new FormData(event.currentTarget); setBusy("profile"); setNotice(undefined);
    try {
      await api("/v1/vendor/me", { method: "PATCH", body: { business_name: form.get("business_name"), description: form.get("description"), city: form.get("city"), service_area: String(form.get("service_area") ?? "") || null, timezone: form.get("timezone"), terms: form.get("terms"), cancellation_policy: form.get("cancellation_policy"), rescheduling_policy: form.get("rescheduling_policy"), phone_required: form.get("phone_required") === "on" } });
      toast({ title: "Profile saved", tone: "success" }); await load();
    } catch (failure) { setNotice({ tone: "danger", text: humanMessage(failure) }); } finally { setBusy(""); }
  };
  const togglePublish = async () => {
    setBusy("publish"); setNotice(undefined);
    try { await api(`/v1/vendor/${profile.published ? "unpublish" : "publish"}`, { body: {} }); toast({ title: profile.published ? "Your page is hidden" : "Your page is live", tone: "success" }); await load(); }
    catch (failure) { const missing = failure instanceof ApiError ? (failure.details.missing as string[] | undefined) : undefined; setNotice({ tone: missing ? "warning" : "danger", text: missing ? `Before publishing: ${missing.map(key => requirementCopy[key] ?? key).join("; ")}.` : humanMessage(failure) }); }
    finally { setBusy(""); }
  };

  return (
    <div className="grid gap-6">
      <PageHeader eyebrow={profile.published ? "Live" : "Not published yet"} title={profile.business_name} actions={<Button variant={profile.published ? "secondary" : "primary"} loading={busy === "publish"} onClick={() => void togglePublish()}>{profile.published ? "Unpublish" : "Publish"}</Button>} />
      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
      {!checklist.steps.every(step => step.done) && <ChecklistCard checklist={checklist} />}
      <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
        <Card><CardHeader title="Business profile and policies" description="Shown on your public page before anyone books." />
          <form onSubmit={saveProfile} className="grid gap-4 sm:grid-cols-2">
            <Field label="Business name">{p => <Input {...p} name="business_name" defaultValue={profile.business_name} required />}</Field>
            <Field label="City">{p => <Input {...p} name="city" defaultValue={profile.city} required />}</Field>
            <Field label="Description" className="sm:col-span-2">{p => <Textarea {...p} name="description" defaultValue={profile.description} />}</Field>
            <Field label="Service area" optional>{p => <Input {...p} name="service_area" defaultValue={profile.service_area ?? ""} />}</Field>
            <Field label="Timezone">{p => <Select {...p} name="timezone" defaultValue={profile.timezone}>{[...new Set([profile.timezone, ...timezones])].map(zone => <option key={zone}>{zone}</option>)}</Select>}</Field>
            <Field label="Booking terms" className="sm:col-span-2">{p => <Textarea {...p} name="terms" defaultValue={profile.terms} />}</Field>
            <Field label="Cancellation policy">{p => <Textarea {...p} name="cancellation_policy" defaultValue={profile.cancellation_policy} />}</Field>
            <Field label="Rescheduling policy">{p => <Textarea {...p} name="rescheduling_policy" defaultValue={profile.rescheduling_policy} />}</Field>
            <Checkbox name="phone_required" defaultChecked={profile.phone_required} label="Require customer phone number" className="sm:col-span-2" />
            <div className="sm:col-span-2"><Button loading={busy === "profile"} loadingText="Saving…">Save profile</Button></div>
          </form>
        </Card>
        <aside className="grid content-start gap-6">
          <Card><CardHeader title="Your public page" description={profile.published ? "Live. Share it anywhere." : "Publish when the checklist is done."} />
            <p className="mb-4 break-all rounded-input bg-surface-muted px-3 py-2.5 font-mono text-sm">bayana.in/{profile.slug}</p>
            <div className="grid gap-2"><Button asChild variant="secondary"><a href={`/${profile.slug}`} target="_blank" rel="noreferrer"><ExternalLink aria-hidden />Preview</a></Button><Button type="button" variant="ghost" onClick={() => void navigator.clipboard.writeText(`${location.origin}/${profile.slug}`)}><Copy aria-hidden />Copy public link</Button></div>
          </Card>
          <Card><CardHeader title="Services" description={`${profile.services.length} service${profile.services.length === 1 ? "" : "s"}`} /><Button asChild variant="secondary" block><Link href="/dashboard/services">Manage services</Link></Button></Card>
          <Card><CardHeader title="Availability" description="Weekly hours, date changes and time off." /><Button asChild variant="secondary" block><Link href="/dashboard/availability">Manage availability</Link></Button></Card>
        </aside>
      </div>
    </div>
  );
}
