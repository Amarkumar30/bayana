"use client";
import { Plus, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { MAX_BLOCKS, MAX_BOOKING_DAYS, MAX_BUFFER_DAYS, TERMS_VARIABLES, advancePaise, advanceRuleProblem, formatINR, paiseFromRupees, rupeesFromPaise, serviceCreateSchema, type CancellationTier } from "@bayana/shared";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/display";
import { Checkbox, Field, Input, RadioCards, Select, Textarea } from "@/components/ui/field";
import { api, fieldErrors, humanMessage } from "@/lib/api";
import { dailyPreview, sessionPreview } from "@/lib/service-label";
import type { AdvanceType, Service } from "./types";

type Mode = "hourly" | "daily";
type Draft = { name: string; description: string; price: string; duration: string; bufferBefore: string; bufferAfter: string; mode: Mode; minBlocks: string; maxBlocks: string; minDays: string; maxDays: string; bufferDays: string; advanceType: AdvanceType; advanceValue: string; tiers: { hours: string; percent: string }[]; terms: string; active: boolean };
const fromService = (service?: Service): Draft => ({
  name: service?.name ?? "", description: service?.description ?? "", price: service ? rupeesFromPaise(Number(service.price_paise)) : "", duration: String(service?.duration_minutes ?? 60),
  bufferBefore: String(service?.buffer_before_minutes ?? 0), bufferAfter: String(service?.buffer_after_minutes ?? 0), mode: service?.booking_mode ?? "hourly",
  minBlocks: String(service?.min_blocks ?? 1), maxBlocks: String(service?.max_blocks ?? 1), minDays: String(service?.min_days ?? 1), maxDays: String(service?.max_days ?? 1), bufferDays: String(service?.buffer_days ?? 0),
  advanceType: service?.advance_type ?? "PERCENT", advanceValue: service ? (service.advance_type === "FIXED" ? rupeesFromPaise(service.advance_value) : String(service.advance_value)) : "25",
  tiers: (service?.cancellation_tiers ?? []).map(tier => ({ hours: String(tier.min_hours_before), percent: String(tier.refund_percent) })), terms: service?.terms_template ?? "", active: service?.active ?? true
});
const toNumber = (value: string) => value.trim() === "" ? NaN : Number(value);
const rupeesToPaise = (value: string) => { try { return paiseFromRupees(value.trim()); } catch { return NaN; } };

/** Builds the API body from the form: amounts in rupees become integer paise, and only the chosen mode's fields are sent. */
function toBody(draft: Draft) {
  const price = rupeesToPaise(draft.price);
  const modeFields = draft.mode === "daily"
    ? { min_days: toNumber(draft.minDays), max_days: toNumber(draft.maxDays), buffer_days: toNumber(draft.bufferDays || "0") }
    : { duration_minutes: toNumber(draft.duration), buffer_before_minutes: toNumber(draft.bufferBefore || "0"), buffer_after_minutes: toNumber(draft.bufferAfter || "0"), min_blocks: toNumber(draft.minBlocks || "1"), max_blocks: toNumber(draft.maxBlocks || "1") };
  return {
    name: draft.name, description: draft.description, price_paise: price, ...modeFields,
    booking_mode: draft.mode, advance_type: draft.advanceType, advance_value: draft.advanceType === "NONE" ? 0 : draft.advanceType === "FIXED" ? rupeesToPaise(draft.advanceValue) : toNumber(draft.advanceValue),
    cancellation_tiers: draft.tiers.map((tier): CancellationTier => ({ min_hours_before: toNumber(tier.hours), refund_percent: toNumber(tier.percent) })), terms_template: draft.terms, active: draft.active
  };
}

export function ServiceForm({ service, onSaved, compact = false, submitLabel }: { service?: Service; onSaved: (service: Service) => void; compact?: boolean; submitLabel?: string }) {
  const [draft, setDraft] = useState<Draft>(() => fromService(service)); const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [serverFields, setServerFields] = useState<Record<string, string>>({});
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft(current => ({ ...current, [key]: value }));
  const body = toBody(draft);
  const parsed = serviceCreateSchema.safeParse(body);
  const clientErrors: Record<string, string> = parsed.success ? {} : Object.fromEntries(parsed.error.issues.map(issue => [String(issue.path[0]), issue.message]).reverse());
  if (Number.isNaN(body.price_paise)) clientErrors.price_paise = "Enter a price like 2500 or 2500.50.";
  const errors = { ...(submitted ? clientErrors : {}), ...serverFields };
  const price = Number.isNaN(body.price_paise) ? 0 : body.price_paise;
  const advanceProblem = advanceRuleProblem(price, draft.advanceType, Number.isNaN(body.advance_value) ? -1 : body.advance_value);
  const daily = draft.mode === "daily";
  const preview = price > 0 && !advanceProblem ? advancePaise(price, draft.advanceType, body.advance_value) : null;
  const advanceInput = draft.advanceType === "NONE" ? 0 : draft.advanceType === "FIXED" ? rupeesToPaise(draft.advanceValue) : toNumber(draft.advanceValue);
  // Several sessions in a row: the line shows a sample range and its price; one session keeps the plain "now and later" line.
  const sessions = !daily && toNumber(draft.maxBlocks) > 1;
  const previewLine = daily ? dailyPreview(price, toNumber(draft.minDays), toNumber(draft.maxDays), draft.advanceType, advanceInput)
    : sessions ? sessionPreview(price, toNumber(draft.duration), toNumber(draft.minBlocks), toNumber(draft.maxBlocks), draft.advanceType, advanceInput)
    : preview !== null ? `Customers pay ${formatINR(preview)} now and ${formatINR(price - preview)} later.` : null;

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSubmitted(true); setServerFields({});
    if (Object.keys(clientErrors).length) return;
    setBusy(true); setError("");
    try { onSaved(await api<Service>(service ? `/v1/vendor/services/${service.id}` : "/v1/vendor/services", { method: service ? "PATCH" : "POST", body })); }
    catch (failure) { setServerFields(fieldErrors(failure)); setError(humanMessage(failure)); } finally { setBusy(false); }
  };
  const insertVariable = (name: string) => set("terms", `${draft.terms}{{${name}}}`);

  return (
    <form onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
      <Field label="Service name" error={errors.name} className="sm:col-span-2">{p => <Input {...p} value={draft.name} onChange={event => set("name", event.target.value)} placeholder="Portrait session" />}</Field>
      {!compact && <Field label="Description" optional className="sm:col-span-2">{p => <Textarea {...p} value={draft.description} onChange={event => set("description", event.target.value)} />}</Field>}
      <RadioCards legend="How do you charge?" name="booking_mode" value={draft.mode} onChange={mode => set("mode", mode)} className="sm:col-span-2" options={[
        { value: "hourly", label: "Per session", description: "Customers pick a start time and book one session, or several in a row. You set how long a session is." },
        { value: "daily", label: "Per day", description: "Customers pick dates, for one day or several. For shoots, events and decor." }
      ]} />
      <Field label={daily ? "Price per day (₹)" : "Price (₹)"} error={errors.price_paise} hint={daily ? undefined : "For one session."}>{p => <Input {...p} inputMode="decimal" value={draft.price} onChange={event => set("price", event.target.value)} placeholder={daily ? "12000" : "2500"} />}</Field>
      {daily ? (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Minimum days" error={errors.min_days}>{p => <Input {...p} type="number" min={1} max={MAX_BOOKING_DAYS} value={draft.minDays} onChange={event => set("minDays", event.target.value)} />}</Field>
          <Field label="Maximum days" error={errors.max_days} hint={`Up to ${MAX_BOOKING_DAYS}.`}>{p => <Input {...p} type="number" min={1} max={MAX_BOOKING_DAYS} value={draft.maxDays} onChange={event => set("maxDays", event.target.value)} />}</Field>
        </div>
      ) : (
        <>
          <Field label="Session length (minutes)" error={errors.duration_minutes} hint="One session. Customers can book several in a row if you allow it below.">{p => <Input {...p} type="number" min={5} value={draft.duration} onChange={event => set("duration", event.target.value)} />}</Field>
          <div className="grid grid-cols-2 gap-3 sm:col-span-2">
            <Field label="Minimum sessions" error={errors.min_blocks}>{p => <Input {...p} type="number" min={1} max={MAX_BLOCKS} value={draft.minBlocks} onChange={event => set("minBlocks", event.target.value)} />}</Field>
            <Field label="Maximum sessions" error={errors.max_blocks} hint={`In a row, on one day. Up to ${MAX_BLOCKS}.`}>{p => <Input {...p} type="number" min={1} max={MAX_BLOCKS} value={draft.maxBlocks} onChange={event => set("maxBlocks", event.target.value)} />}</Field>
          </div>
        </>
      )}
      <Field label="Advance" error={errors.advance_type}>{p => <Select {...p} value={draft.advanceType} onChange={event => { set("advanceType", event.target.value as AdvanceType); set("advanceValue", event.target.value === "NONE" ? "0" : event.target.value === "PERCENT" ? "25" : ""); }}><option value="PERCENT">Percentage of price</option><option value="FIXED">Fixed amount</option><option value="NONE">No advance</option></Select>}</Field>
      {draft.advanceType !== "NONE" && <Field label={draft.advanceType === "PERCENT" ? "Advance (%)" : "Advance (₹)"} error={errors.advance_value ?? (submitted ? advanceProblem ?? undefined : undefined)} hint={previewLine ?? undefined}>{p => <Input {...p} inputMode="decimal" value={draft.advanceValue} onChange={event => set("advanceValue", event.target.value)} />}</Field>}
      {!compact && <>
        {daily ? (
          <Field label="Buffer days" optional error={errors.buffer_days} hint="Days kept free before and after each booking, for travel or setup.">{p => <Input {...p} type="number" min={0} max={MAX_BUFFER_DAYS} value={draft.bufferDays} onChange={event => set("bufferDays", event.target.value)} />}</Field>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Buffer before (min)" error={errors.buffer_before_minutes}>{p => <Input {...p} type="number" min={0} value={draft.bufferBefore} onChange={event => set("bufferBefore", event.target.value)} />}</Field>
            <Field label="Buffer after (min)" error={errors.buffer_after_minutes}>{p => <Input {...p} type="number" min={0} value={draft.bufferAfter} onChange={event => set("bufferAfter", event.target.value)} />}</Field>
          </div>
        )}
        <fieldset className="grid gap-2 sm:col-span-2">
          <legend className="mb-1 text-sm font-medium">Cancellation refunds</legend>
          <p className="text-xs text-muted">From the earliest cancellation to the latest. For example: 168 hours before → 100%, 48 hours → 50%, 0 → 0%.</p>
          {draft.tiers.map((tier, index) => (
            <div key={index} className="flex items-end gap-2">
              <Field label={`Hours before (tier ${index + 1})`} className="flex-1">{p => <Input {...p} type="number" min={0} value={tier.hours} onChange={event => set("tiers", draft.tiers.map((item, at) => at === index ? { ...item, hours: event.target.value } : item))} />}</Field>
              <Field label="Refund %" className="flex-1">{p => <Input {...p} type="number" min={0} max={100} value={tier.percent} onChange={event => set("tiers", draft.tiers.map((item, at) => at === index ? { ...item, percent: event.target.value } : item))} />}</Field>
              <Button type="button" variant="ghost" size="icon" aria-label={`Remove tier ${index + 1}`} onClick={() => set("tiers", draft.tiers.filter((_, at) => at !== index))}><Trash2 aria-hidden /></Button>
            </div>
          ))}
          {errors.cancellation_tiers && <p className="text-xs font-medium text-danger">{errors.cancellation_tiers}</p>}
          {draft.tiers.length < 6 && <Button type="button" variant="secondary" size="sm" className="w-fit" onClick={() => set("tiers", [...draft.tiers, { hours: "", percent: "" }])}><Plus aria-hidden />Add a tier</Button>}
        </fieldset>
        <div className="grid gap-2 sm:col-span-2">
          <Field label="Terms for this service" optional error={errors.terms_template} hint="Plain text. Insert details with the buttons below; anything else in {{ }} is rejected.">{p => <Textarea {...p} value={draft.terms} onChange={event => set("terms", event.target.value)} placeholder="The advance of {{advance}} confirms {{service_name}} on {{date}} at {{time}}." />}</Field>
          <div className="flex flex-wrap gap-1.5" aria-label="Insert a variable">{Object.entries(TERMS_VARIABLES).map(([name, label]) => <button key={name} type="button" title={label} onClick={() => insertVariable(name)} className="min-h-9 rounded-full bg-primary-soft px-3 text-xs font-medium text-primary hover:bg-primary hover:text-primary-foreground">{`{{${name}}}`}</button>)}</div>
        </div>
        <Checkbox checked={draft.active} onChange={event => set("active", event.target.checked)} label="Bookable" hint="Turn off to hide this service without deleting it." className="sm:col-span-2" />
      </>}
      {error && <Notice tone="danger" className="sm:col-span-2">{error}</Notice>}
      <div className="sm:col-span-2"><Button loading={busy} loadingText="Saving…">{submitLabel ?? (service ? "Save service" : "Add service")}</Button></div>
    </form>
  );
}
