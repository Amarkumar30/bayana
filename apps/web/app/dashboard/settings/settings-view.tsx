"use client";
import { useState, type FormEvent } from "react";
import { CalendarPlus, Copy, Download } from "lucide-react";
import { env } from "@/env";
import { SessionsCard } from "@/components/auth/sessions-card";
import { Gate, useVendorData } from "@/components/dashboard/load";
import type { Settings } from "@/components/dashboard/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Card, CardHeader, LoadingState, Notice, Skeleton } from "@/components/ui/display";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { timezones, type Profile } from "@/components/vendor/types";
import { api, humanMessage, vendorMessage } from "@/lib/api";

type Data = { profile: Profile; settings: Settings };

/** SPEC 5.3 settings: profile and public page, notifications, calendar feed, sessions, export and delete. */
export function SettingsView() {
  const [state, reload] = useVendorData<Data>("settings", async () => { const [profile, settings] = await Promise.all([api<Profile>("/v1/vendor/me"), api<Settings>("/v1/vendor/settings")]); return { profile, settings }; });
  const skeleton = <LoadingState label="Loading settings…" className="grid gap-4"><Skeleton className="h-11 w-full max-w-md" /><Skeleton className="h-96 rounded-card" /></LoadingState>;
  return <Gate state={state} skeleton={skeleton} retry={() => void reload()} next="/dashboard/settings">{({ profile, settings }) => (
    <Tabs defaultValue="profile">
      <TabsList aria-label="Settings sections"><TabsTrigger value="profile">Profile</TabsTrigger><TabsTrigger value="notifications">Notifications</TabsTrigger><TabsTrigger value="calendar">Calendar feed</TabsTrigger><TabsTrigger value="account">Account</TabsTrigger></TabsList>
      <TabsContent value="profile"><ProfileForm profile={profile} onSaved={() => void reload()} /></TabsContent>
      <TabsContent value="notifications"><NotificationsCard initial={settings.notify_prefs} /></TabsContent>
      <TabsContent value="calendar"><CalendarFeedCard enabled={settings.ical_enabled} /></TabsContent>
      <TabsContent value="account" className="grid gap-4"><SessionsCard /><ExportCard /><DeleteCard slug={profile.slug} email={settings.account_email} /></TabsContent>
    </Tabs>
  )}</Gate>;
}

function ProfileForm({ profile, onSaved }: { profile: Profile; onSaved: () => void }) {
  const toast = useToast(); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true); setError("");
    try {
      await api("/v1/vendor/me", { method: "PATCH", body: { business_name: form.get("business_name"), description: form.get("description"), city: form.get("city"), service_area: String(form.get("service_area") ?? "") || null, timezone: form.get("timezone"), terms: form.get("terms"), cancellation_policy: form.get("cancellation_policy"), rescheduling_policy: form.get("rescheduling_policy"), phone_required: form.get("phone_required") === "on", public_contact_email: form.get("public_contact_email") === "on", public_contact_phone: form.get("public_contact_phone") === "on" } });
      toast({ title: "Profile saved", tone: "success" }); onSaved();
    } catch (failure) { setError(humanMessage(failure)); } finally { setBusy(false); }
  };
  return (
    <Card><CardHeader title="Business profile and policies" description="Shown on your public page before anyone books. Changes apply to new bookings; existing bookings keep the terms they agreed to." />
      <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
        <Field label="Business name">{p => <Input {...p} name="business_name" defaultValue={profile.business_name} required />}</Field>
        <Field label="City">{p => <Input {...p} name="city" defaultValue={profile.city} required />}</Field>
        <Field label="Description" className="sm:col-span-2">{p => <Textarea {...p} name="description" defaultValue={profile.description} />}</Field>
        <Field label="Service area" optional>{p => <Input {...p} name="service_area" defaultValue={profile.service_area ?? ""} />}</Field>
        <Field label="Timezone">{p => <Select {...p} name="timezone" defaultValue={profile.timezone}>{[...new Set([profile.timezone, ...timezones])].map(zone => <option key={zone}>{zone}</option>)}</Select>}</Field>
        <Field label="Booking terms" className="sm:col-span-2">{p => <Textarea {...p} name="terms" defaultValue={profile.terms} />}</Field>
        <Field label="Cancellation policy">{p => <Textarea {...p} name="cancellation_policy" defaultValue={profile.cancellation_policy} />}</Field>
        <Field label="Rescheduling policy">{p => <Textarea {...p} name="rescheduling_policy" defaultValue={profile.rescheduling_policy} />}</Field>
        <div className="grid sm:col-span-2">
          <Checkbox name="phone_required" defaultChecked={profile.phone_required} label="Require a phone number from customers" />
          <Checkbox name="public_contact_email" defaultChecked={profile.public_contact_email} label="Show my account email on my public page" hint="Off by default. Customers can always reach you through their booking." />
          <Checkbox name="public_contact_phone" defaultChecked={profile.public_contact_phone} label="Show my phone number on my public page" />
        </div>
        {error && <Notice tone="danger" className="sm:col-span-2">{error}</Notice>}
        <div className="sm:col-span-2"><Button loading={busy} loadingText="Saving…">Save profile</Button></div>
      </form>
    </Card>
  );
}

function NotificationsCard({ initial }: { initial: Settings["notify_prefs"] }) {
  const toast = useToast(); const [prefs, setPrefs] = useState(initial); const [error, setError] = useState("");
  const toggle = async (key: keyof Settings["notify_prefs"], value: boolean) => {
    const next = { ...prefs, [key]: value }; setPrefs(next); setError("");
    try { await api("/v1/vendor/settings/notifications", { method: "PUT", body: next }); toast({ title: "Saved", tone: "success" }); }
    catch (failure) { setPrefs(prefs); setError(humanMessage(failure)); }
  };
  return (
    <Card className="grid gap-1"><CardHeader title="Email me when" description="New booking requests that need your action are always emailed." />
      <Switch label="A booking is confirmed" checked={prefs.booking_confirmed} onCheckedChange={value => void toggle("booking_confirmed", value)} />
      <Switch label="A booking is cancelled" checked={prefs.booking_cancelled} onCheckedChange={value => void toggle("booking_cancelled", value)} />
      <Switch label="A booking is tomorrow (reminder)" checked={prefs.reminder_24h} onCheckedChange={value => void toggle("reminder_24h", value)} />
      {error && <Notice tone="danger">{error}</Notice>}
    </Card>
  );
}

/** iCal feed: the secret address is shown once (only its hash is stored); a new one replaces it. */
function CalendarFeedCard({ enabled }: { enabled: boolean }) {
  const toast = useToast(); const [on, setOn] = useState(enabled); const [url, setUrl] = useState(""); const [busy, setBusy] = useState(""); const [error, setError] = useState("");
  const create = async () => {
    setBusy("create"); setError("");
    try { const { path } = await api<{ path: string }>("/v1/vendor/settings/ical", { body: {} }); setUrl(`${env.NEXT_PUBLIC_API_URL}${path}`); setOn(true); }
    catch (failure) { setError(humanMessage(failure)); } finally { setBusy(""); }
  };
  const disable = async () => {
    setBusy("off"); setError("");
    try { await api("/v1/vendor/settings/ical", { method: "DELETE" }); setOn(false); setUrl(""); toast({ title: "Calendar feed turned off", tone: "success" }); }
    catch (failure) { setError(humanMessage(failure)); } finally { setBusy(""); }
  };
  return (
    <Card className="grid gap-3"><CardHeader title="Calendar feed" description="See your bookings in Google Calendar, Apple Calendar or Outlook. Calendar apps refresh it every few hours." />
      {url ? <div className="grid gap-2"><Field label="Your private feed address" hint="Copy it now: for your privacy it is not shown again. Anyone with this address can see your bookings.">{p => <Input {...p} readOnly value={url} onFocus={event => event.currentTarget.select()} />}</Field>
        <Button variant="secondary" className="w-fit" onClick={() => void navigator.clipboard.writeText(url).then(() => toast({ title: "Address copied", tone: "success" }))}><Copy aria-hidden />Copy address</Button></div>
        : <Notice tone="info">{on ? "A feed is on. Its address was shown when you created it. Make a new address if you lost it; the old one stops working." : "The feed is off."}</Notice>}
      {error && <Notice tone="danger">{error}</Notice>}
      <div className="flex flex-wrap gap-2"><Button loading={busy === "create"} onClick={() => void create()}><CalendarPlus aria-hidden />{on ? "Make a new address" : "Turn on the feed"}</Button>{on && <Button variant="secondary" loading={busy === "off"} onClick={() => void disable()}>Turn off</Button>}</div>
    </Card>
  );
}

function ExportCard() {
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const download = async () => {
    setBusy(true); setError("");
    try {
      const data = await api<Record<string, unknown> & { profile: { slug: string } }>("/v1/vendor/export");
      const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })); link.download = `bayana-export-${data.profile.slug}.json`; link.click(); URL.revokeObjectURL(link.href);
    } catch (failure) { setError(humanMessage(failure)); } finally { setBusy(false); }
  };
  return (
    <Card className="grid gap-3"><CardHeader title="Download your data" description="Your profile, services, hours, bookings, payments and refunds as one JSON file." />
      {error && <Notice tone="danger">{error}</Notice>}
      <Button variant="secondary" className="w-fit" loading={busy} loadingText="Preparing…" onClick={() => void download()}><Download aria-hidden />Download my data</Button>
    </Card>
  );
}

function DeleteCard({ slug, email }: { slug: string; email: string }) {
  const [confirm, setConfirm] = useState(""); const [understood, setUnderstood] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const remove = async () => {
    setBusy(true); setError("");
    try { await api("/v1/vendor/account/delete", { body: { confirm_slug: confirm.trim() } }); window.location.assign("/"); }
    catch (failure) { setError(vendorMessage(failure)); setBusy(false); }
  };
  return (
    <Card className="grid gap-3"><CardHeader title="Delete account" description={`Signed in as ${email}.`} />
      <Dialog><DialogTrigger asChild><Button variant="danger" className="w-fit">Delete account</Button></DialogTrigger>
        <DialogContent title="Delete your account?" description="Your page goes offline immediately and you are signed out everywhere. Bookings, payments and refunds are kept for the period tax law requires; your sign-in email and password are removed.">
          <Notice tone="warning">You can't delete your account while bookings are still coming up. Cancel or complete them first.</Notice>
          <Field label={`Type your page address (${slug}) to confirm`}>{p => <Input {...p} value={confirm} autoComplete="off" onChange={event => setConfirm(event.target.value)} />}</Field>
          <Checkbox label="I understand this can't be undone" checked={understood} onChange={event => setUnderstood(event.target.checked)} />
          {error && <Notice tone="danger">{error}</Notice>}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><DialogClose asChild><Button variant="secondary">Keep my account</Button></DialogClose><Button variant="danger" disabled={confirm.trim() !== slug || !understood} loading={busy} loadingText="Deleting…" onClick={() => void remove()}>Delete for good</Button></div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
