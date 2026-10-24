import Link from "next/link";
import { BadgeCheck, CalendarCheck2, FileText, IndianRupee, Link2, ShieldCheck } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge, Card, Money } from "@/components/ui/display";

const steps = [
  { icon: Link2, title: "Share one link", body: "Your page at bayana.in/your-name lists services, prices, policies and open times." },
  { icon: CalendarCheck2, title: "Clients pick a time", body: "They choose a slot that fits your hours and buffers. No back-and-forth on WhatsApp." },
  { icon: IndianRupee, title: "Advance, then confirmed", body: "The booking confirms only when the advance is verified, with the balance shown to both sides." }
];
const promises = [
  { icon: ShieldCheck, title: "Verified email first", body: "Every client confirms their email before a slot is held." },
  { icon: FileText, title: "Terms they actually see", body: "Advance, balance and cancellation rules sit above the pay button." },
  { icon: BadgeCheck, title: "No double bookings", body: "The database itself refuses overlapping bookings." }
];

export default function Home() {
  return (
    <div className="grid gap-16 sm:gap-24">
      <section className="grid items-center gap-10 pt-2 md:grid-cols-[1.15fr_1fr] md:pt-8">
        <div className="grid gap-6">
          <Badge tone="accent" className="w-fit">For photographers, salons, tutors, trainers and more</Badge>
          <h1 className="font-serif text-4xl font-medium leading-[1.1] sm:text-6xl">Get booked. <span className="text-primary">Get the advance.</span> Stay calm.</h1>
          <p className="max-w-xl text-lg text-muted">Bayana gives independent professionals in India one link where clients choose a service, pick a time, accept your terms and pay an advance, all before you lift a finger.</p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg"><Link href="/dashboard">Set up your page</Link></Button>
            <Button asChild size="lg" variant="secondary"><Link href="/auth?next=/dashboard">Sign in to your workspace</Link></Button>
          </div>
        </div>
        <Card className="relative grid gap-5 p-5 sm:p-6" aria-label="Example booking summary">
          <div className="flex items-center gap-3"><Avatar name="Studio Sunday" /><div className="grid"><strong>Studio Sunday</strong><span className="text-sm text-muted">Event styling · Mumbai</span></div><Badge tone="success" className="ml-auto">Open</Badge></div>
          <div className="grid grid-cols-3 gap-2 text-center text-sm">
            {["10:00", "11:30", "14:00"].map((time, index) => <span key={time} className={index === 1 ? "rounded-input bg-primary py-2.5 font-semibold text-primary-foreground" : "rounded-input bg-primary-soft py-2.5 font-medium"}>{time}</span>)}
          </div>
          <dl className="grid gap-2 rounded-input bg-surface-muted p-4 text-sm">
            <div className="flex justify-between"><dt className="text-muted">Design consultation · 60 min</dt><dd><Money paise={250000} /></dd></div>
            <div className="flex justify-between"><dt className="text-muted">Advance today</dt><dd><Money paise={50000} className="font-semibold" /></dd></div>
            <div className="flex justify-between border-t border-border pt-2"><dt className="text-muted">Balance on the day</dt><dd><Money paise={200000} /></dd></div>
          </dl>
          <span className="pointer-events-none absolute -right-2 -top-3 rotate-3 rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent-ink shadow-soft ring-1 ring-accent/40" aria-hidden>Sample</span>
        </Card>
      </section>

      <section aria-labelledby="how" className="grid gap-8">
        <div className="grid gap-2"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">How it works</p><h2 id="how" className="text-2xl sm:text-4xl">Three steps, then it runs itself</h2></div>
        <ol className="grid gap-4 md:grid-cols-3">
          {steps.map(({ icon: Icon, title, body }, index) => (
            <li key={title}><Card className="h-full"><div className="mb-4 flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-full bg-primary-soft text-primary"><Icon className="size-5" aria-hidden /></span><span className="text-sm font-semibold text-muted">Step {index + 1}</span></div><h3 className="mb-1 text-lg">{title}</h3><p className="text-muted">{body}</p></Card></li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="trust" className="grid gap-6 rounded-card bg-surface p-6 shadow-soft ring-1 ring-border/70 sm:p-10 md:grid-cols-[1fr_2fr]">
        <div className="grid content-start gap-2"><h2 id="trust" className="font-serif text-2xl font-medium sm:text-4xl">Built for trust on both sides</h2><p className="text-muted">Clients feel safe paying. You stop chasing.</p></div>
        <ul className="grid gap-5 sm:grid-cols-3">{promises.map(({ icon: Icon, title, body }) => <li key={title} className="grid content-start gap-2"><Icon className="size-6 text-success" aria-hidden /><h3 className="text-base">{title}</h3><p className="text-sm text-muted">{body}</p></li>)}</ul>
      </section>

      <section className="grid justify-items-center gap-4 text-center">
        <h2 className="max-w-2xl font-serif text-2xl font-medium sm:text-4xl">Your next client is one link away</h2>
        <Button asChild size="lg"><Link href="/dashboard">Create your booking page</Link></Button>
      </section>
    </div>
  );
}
