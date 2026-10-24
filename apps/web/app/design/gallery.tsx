"use client";
import { CalendarDays, Moon, Plus, Sun } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Brand } from "@/components/layout/brand";
import { PreviewBanner } from "@/components/layout/preview-banner";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger, Sheet, SheetContent, SheetTrigger } from "@/components/ui/dialog";
import { Badge, Card, CardHeader, EmptyState, LoadingState, Money, Notice, Skeleton, StatusBadge, Stepper, Table, Td, Th } from "@/components/ui/display";
import { DatePicker, monthKey } from "@/components/ui/date-picker";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { contrast, tokenPairs } from "./contrast";

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return <section aria-labelledby={id} className="grid gap-4"><h2 id={id} className="border-b border-border pb-2 text-2xl">{title}</h2>{children}</section>;
}
const swatches = ["background", "surface", "surface-muted", "ink", "muted", "border", "primary", "primary-hover", "accent", "success", "warning", "danger"];
const statuses = ["held", "pending", "confirmed", "completed", "cancelled", "expired"];

export function DesignGallery() {
  const toast = useToast();
  const [theme, setTheme] = useState<"system" | "light" | "dark">("system");
  const [loading, setLoading] = useState(false);
  const [month, setMonth] = useState(() => monthKey(new Date(Date.UTC(2026, 10, 1))));
  const [date, setDate] = useState("2026-11-12");
  const applyTheme = (next: "system" | "light" | "dark") => { setTheme(next); if (next === "system") document.documentElement.removeAttribute("data-theme"); else document.documentElement.setAttribute("data-theme", next); };
  return (
    <main id="main" className="mx-auto grid max-w-5xl gap-12 px-4 py-8 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="grid gap-1"><Brand /><h1 className="text-2xl sm:text-4xl">Design system</h1><p className="text-muted">Every component and state. Development only.</p></div>
        <div className="flex gap-1 rounded-card bg-surface-muted p-1" aria-label="Theme">
          {(["system", "light", "dark"] as const).map(value => <button key={value} type="button" aria-pressed={theme === value} onClick={() => applyTheme(value)} className={`inline-flex min-h-11 items-center gap-1.5 rounded-input px-3 text-sm font-medium capitalize ${theme === value ? "bg-surface text-ink shadow-soft" : "text-muted"}`}>{value === "dark" ? <Moon className="size-4" aria-hidden /> : value === "light" ? <Sun className="size-4" aria-hidden /> : null}{value}</button>)}
        </div>
      </header>

      <Section id="colour" title="Colour">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">{swatches.map(name => <div key={name} className="grid gap-1.5"><div className="h-14 rounded-input ring-1 ring-border" style={{ background: `var(--${name})` }} /><code className="text-xs text-muted">--{name}</code></div>)}</div>
        {tokenPairs.map(group => (
          <div key={group.theme} className="grid gap-2"><h3 className="text-base capitalize">{group.theme} theme contrast (WCAG AA: 4.5 text, 3.0 large/icons)</h3>
            <Table><thead><tr><Th>Pair</Th><Th>Sample</Th><Th className="text-right">Ratio</Th><Th>AA</Th></tr></thead><tbody>{group.pairs.map(pair => { const ratio = contrast(pair.fg, pair.bg); const pass = ratio >= (pair.large ? 3 : 4.5); return (
              <tr key={pair.name}><Td>{pair.name}</Td><Td><span className="rounded px-2 py-1 text-sm font-medium" style={{ color: pair.fg, background: pair.bg }}>Aa ₹1,250</span></Td><Td className="text-right tabular-nums">{ratio.toFixed(2)}</Td><Td><Badge tone={pass ? "success" : "danger"}>{pass ? "Pass" : "Fail"}</Badge></Td></tr>
            ); })}</tbody></Table>
          </div>
        ))}
      </Section>

      <Section id="type" title="Typography">
        <div className="grid gap-3">
          <p className="font-serif text-6xl font-medium">Fraunces 48 · headlines</p>
          <p className="text-4xl font-semibold">Inter 32 · page titles</p><p className="text-2xl font-semibold">Inter 24 · section titles</p><p className="text-lg">Inter 18 · lead text</p><p className="text-base">Inter 16 · body, line-height 1.5. Clients see the advance, the balance and the cancellation rules before they pay.</p><p className="text-sm text-muted">Inter 14 · secondary text</p><p className="text-xs text-muted">Inter 12 · captions</p>
        </div>
      </Section>

      <Section id="buttons" title="Buttons">
        <div className="flex flex-wrap gap-3"><Button>Primary</Button><Button variant="secondary">Secondary</Button><Button variant="ghost">Ghost</Button><Button variant="danger">Danger</Button></div>
        <div className="flex flex-wrap gap-3"><Button loading={loading} loadingText="Saving…" onClick={() => { setLoading(true); setTimeout(() => setLoading(false), 1500); }}>Click to load</Button><Button loading loadingText="Verifying…" variant="secondary">x</Button><Button disabled>Disabled</Button><Button size="sm">Small</Button><Button size="lg">Large</Button><Button size="icon" variant="secondary" aria-label="Add"><Plus aria-hidden /></Button></div>
      </Section>

      <Section id="forms" title="Form controls">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Business name" hint="Shown at the top of your page.">{p => <Input {...p} placeholder="Studio Sunday" />}</Field>
          <Field label="Email" error="Enter an email address like name@example.com.">{p => <Input {...p} type="email" defaultValue="ananya@" />}</Field>
          <Field label="Disabled">{p => <Input {...p} disabled defaultValue="Can't edit this" />}</Field>
          <Field label="Category">{p => <Select {...p} defaultValue="tutoring"><option value="photography">Photography</option><option value="tutoring">Tutoring</option><option value="fitness">Fitness</option></Select>}</Field>
          <Field label="Notes" optional className="sm:col-span-2">{p => <Textarea {...p} placeholder="Anything the vendor should know" />}</Field>
          <Checkbox label="I accept the booking terms." hint="You can read the full text before paying." />
          <Checkbox label="Disabled checkbox" disabled defaultChecked />
          <Switch label="Show my phone number publicly" />
          <Switch label="Email me for new bookings" defaultChecked />
        </div>
      </Section>

      <Section id="status" title="Badges and money">
        <div className="flex flex-wrap gap-2">{statuses.map(status => <StatusBadge key={status} status={status} />)}</div>
        <div className="flex flex-wrap gap-2"><Badge>Neutral</Badge><Badge tone="primary">Primary</Badge><Badge tone="accent">Accent</Badge><Badge tone="success">Success</Badge><Badge tone="warning">Warning</Badge><Badge tone="danger">Danger</Badge></div>
        <div className="flex flex-wrap items-baseline gap-6"><Money paise={99} size="sm" /><Money paise={250000} /><Money paise={1250050} size="lg" /><Money paise={350000000} size="xl" /></div>
        <div className="grid gap-2"><Notice tone="info">Online payments are not enabled yet.</Notice><Notice tone="success">Profile saved.</Notice><Notice tone="warning">This hold expires in 4 minutes.</Notice><Notice tone="danger">This time was just booked. Pick another time below.</Notice></div>
      </Section>

      <Section id="overlays" title="Dialog, sheet and toast">
        <div className="flex flex-wrap gap-3">
          <Dialog><DialogTrigger asChild><Button variant="secondary">Open dialog</Button></DialogTrigger><DialogContent title="Cancel this booking?" description="The client gets an email and the advance is refunded in full."><div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><DialogClose asChild><Button variant="secondary">Keep booking</Button></DialogClose><DialogClose asChild><Button variant="danger">Cancel booking</Button></DialogClose></div></DialogContent></Dialog>
          <Sheet><SheetTrigger asChild><Button variant="secondary">Open sheet</Button></SheetTrigger><SheetContent title="Booking details" description="Side panel on desktop, full height on phones."><p className="text-sm text-muted">Sheet content.</p></SheetContent></Sheet>
          <Sheet><SheetTrigger asChild><Button variant="secondary">Bottom sheet</Button></SheetTrigger><SheetContent side="bottom" title="Choose an action"><div className="grid gap-2"><Button block variant="secondary">Record payment</Button><Button block variant="ghost">Share link</Button></div></SheetContent></Sheet>
          <Button variant="secondary" onClick={() => toast({ title: "Booking confirmed", description: "Ananya Iyer · Mon 2 Nov, 10:00", tone: "success" })}>Success toast</Button>
          <Button variant="secondary" onClick={() => toast({ title: "Could not save", description: "Check your connection and try again.", tone: "danger" })}>Error toast</Button>
        </div>
      </Section>

      <Section id="navigation" title="Tabs and stepper">
        <Tabs defaultValue="upcoming"><TabsList aria-label="Bookings view"><TabsTrigger value="upcoming">Upcoming</TabsTrigger><TabsTrigger value="past">Past</TabsTrigger><TabsTrigger value="cancelled">Cancelled</TabsTrigger></TabsList><TabsContent value="upcoming"><p className="text-sm text-muted">Upcoming bookings panel.</p></TabsContent><TabsContent value="past"><p className="text-sm text-muted">Past bookings panel.</p></TabsContent><TabsContent value="cancelled"><p className="text-sm text-muted">Cancelled bookings panel.</p></TabsContent></Tabs>
        <Stepper steps={["Verify email", "Pick a time", "Your details", "Pay advance"]} current={2} />
      </Section>

      <Section id="data" title="Cards, table and avatars">
        <div className="grid gap-4 sm:grid-cols-3"><Card><CardHeader title="Today" description="3 bookings" /><Money paise={1185000} size="xl" /></Card><Card><CardHeader title="Balances due" /><Money paise={1065000} size="xl" /></Card><Card className="flex items-center gap-3"><Avatar name="Ananya Iyer" size="lg" /><Avatar name="Rohit Malhotra" /><Avatar name="Fatima Shaikh" size="sm" /></Card></div>
        <Table><thead><tr><Th>Customer</Th><Th>Status</Th><Th className="text-right">Balance</Th></tr></thead><tbody><tr><Td>Ananya Iyer</Td><Td><StatusBadge status="confirmed" /></Td><Td className="text-right"><Money paise={315000} size="sm" /></Td></tr><tr><Td>Rohit Malhotra</Td><Td><StatusBadge status="held" /></Td><Td className="text-right"><Money paise={800000} size="sm" /></Td></tr></tbody></Table>
      </Section>

      <Section id="states" title="Loading and empty states">
        <div className="grid gap-4 sm:grid-cols-2">
          <LoadingState label="Loading bookings…" className="grid gap-2"><Skeleton className="h-6 w-1/2" /><Skeleton className="h-4" /><Skeleton className="h-4 w-5/6" /><Skeleton className="h-24 rounded-card" /></LoadingState>
          <EmptyState icon={<CalendarDays />} title="No bookings yet" description="Share your page link on WhatsApp or Instagram to get your first booking." action={<Button size="sm">Copy page link</Button>} />
        </div>
        <PreviewBanner />
      </Section>

      <Section id="date" title="Date picker">
        <div className="max-w-sm"><DatePicker month={month} onMonthChange={setMonth} value={date} onSelect={setDate} disabledReason={value => value < "2026-11-03" ? "past date" : value.endsWith("15") || value.endsWith("22") ? "fully booked" : null} /></div>
        <p className="text-sm text-muted">Selected: {date}. Arrow keys skip unavailable dates; Home and End jump within the week.</p>
      </Section>
    </main>
  );
}
