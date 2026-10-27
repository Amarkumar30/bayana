import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CalendarCheck, ChevronRight, Clock, Mail, MapPin, Phone, ShieldCheck } from "lucide-react";
import { formatINR, tiersInWords } from "@bayana/shared";
import { env } from "@/env";
import { fetchPublicVendor, type PublicVendor } from "@/lib/public-vendor";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge, Card, EmptyState, Money } from "@/components/ui/display";
import { priceUnit, serviceLength } from "@/lib/service-label";
import { vendorUrl } from "@/lib/site";

// Incremental Static Regeneration: rendered on first visit, cached, refreshed in the background every 5 minutes.
export const revalidate = 300;
export const dynamicParams = true;
export function generateStaticParams() { return []; }

const pageUrl = (slug: string) => vendorUrl(env.NEXT_PUBLIC_SITE_URL, slug);
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const vendor = await fetchPublicVendor(slug);
  if (!vendor) return { title: "Page not found | Bayana", robots: { index: false } };
  const title = `${vendor.display_name}: book online | Bayana`;
  const description = vendor.bio || `Book ${vendor.display_name}${vendor.city ? ` in ${vendor.city}` : ""}. See services, prices and open times, then reserve with a small advance.`;
  return {
    title, description, alternates: { canonical: pageUrl(vendor.canonical_slug) },
    openGraph: { type: "profile", siteName: "Bayana", title: vendor.display_name, description, url: pageUrl(vendor.canonical_slug), locale: "en_IN" },
    twitter: { card: "summary", title: vendor.display_name, description }
  };
}

function faq(vendor: PublicVendor) {
  const example = vendor.services[0];
  return [
    { q: "How does booking work?", a: "Choose a service and a time, confirm your email with a one-time code, then read and agree to the terms. Your time is held for 15 minutes while you finish." },
    example && { q: "How much do I pay now?", a: example.advance_paise > 0 ? `Each service shows its advance. For example, ${example.name} needs ${formatINR(example.advance_paise)} now and ${formatINR(example.remaining_paise)} later.` : `${example.name} needs no advance; your booking is confirmed when you agree to the terms.` },
    { q: "What if I need to cancel?", a: vendor.cancellation_policy || (example ? tiersInWords(example.cancellation_tiers) : "") },
    vendor.rescheduling_policy && { q: "Can I change the time later?", a: vendor.rescheduling_policy },
    { q: "Is paying safe?", a: vendor.payments_enabled ? "Payments are handled by Razorpay. Bayana and the business never see your card details, and your booking is confirmed only after the payment is verified." : `Online payment is not switched on for ${vendor.display_name} yet. After you agree to the terms, they will contact you to arrange the advance, and your time stays reserved meanwhile.` }
  ].filter((item): item is { q: string; a: string } => Boolean(item && item.a));
}

export default async function VendorPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const vendor = await fetchPublicVendor(slug);
  if (!vendor) notFound();
  if (vendor.canonical_slug !== slug) redirect(`/${vendor.canonical_slug}`);
  const policies = [{ title: "Booking terms", body: vendor.terms }, { title: "Cancellation", body: vendor.cancellation_policy }, { title: "Rescheduling", body: vendor.rescheduling_policy }].filter(policy => policy.body);
  const bookHref = `/${vendor.slug}/book`;
  const lowest = vendor.services.reduce<number | null>((min, service) => min === null ? Number(service.price_paise) : Math.min(min, Number(service.price_paise)), null);
  return (
    <div className="grid gap-8 pb-24 sm:pb-0">
      <section className="grid gap-4">
        <div className="flex items-center gap-4"><Avatar name={vendor.display_name} size="lg" /><div className="grid gap-1"><h1 className="text-2xl sm:text-4xl">{vendor.display_name}</h1><div className="flex flex-wrap gap-1.5">{(vendor.categories.length ? vendor.categories : ["Independent service"]).map(category => <Badge key={category} tone="primary">{category}</Badge>)}</div></div></div>
        <p className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted"><span className="inline-flex items-center gap-1.5"><MapPin className="size-4" aria-hidden />{vendor.service_area || vendor.city}</span><span className="inline-flex items-center gap-1.5"><Clock className="size-4" aria-hidden />Times in {vendor.timezone}</span></p>
        {vendor.services.length > 0 && <div className="hidden flex-wrap items-center gap-4 sm:flex"><Button asChild size="lg"><Link prefetch={false} href={bookHref}><CalendarCheck aria-hidden />Book a time</Link></Button>{lowest !== null && <span className="text-sm text-muted">From <Money paise={lowest} size="sm" className="font-semibold text-ink" /></span>}</div>}
      </section>

      {vendor.bio && <section aria-labelledby="about" className="grid gap-2"><h2 id="about" className="text-lg">About</h2><p className="max-w-2xl whitespace-pre-line text-muted">{vendor.bio}</p>
        {(vendor.contact_email || vendor.contact_phone) && <p className="flex flex-wrap gap-x-5 gap-y-1 text-sm">{vendor.contact_email && <a href={`mailto:${vendor.contact_email}`} className="inline-flex items-center gap-1.5"><Mail className="size-4" aria-hidden />{vendor.contact_email}</a>}{vendor.contact_phone && <a href={`tel:${vendor.contact_phone}`} className="inline-flex items-center gap-1.5"><Phone className="size-4" aria-hidden />{vendor.contact_phone}</a>}</p>}
      </section>}

      <section aria-labelledby="services" className="grid gap-3">
        <h2 id="services" className="text-lg">Services and prices</h2>
        {vendor.services.length === 0 ? <EmptyState title="No services are open for booking yet" description={`${vendor.display_name} hasn't listed any services. Please check back soon.`} /> :
          <ul className="grid gap-3">{vendor.services.map(service => (
            <li key={service.id}>
              <Link prefetch={false} href={`${bookHref}?service=${service.id}`} className="group block rounded-card bg-surface p-5 text-ink no-underline shadow-soft ring-1 ring-border/70 transition-shadow hover:shadow-raised hover:ring-primary/40">
                <div className="flex items-start justify-between gap-4"><div className="grid gap-1"><strong className="text-base">{service.name}</strong>{service.description && <p className="text-sm text-muted">{service.description}</p>}<span className="text-sm text-muted">{service.booking_mode === "daily" ? `Booked by the day · ${serviceLength(service)}` : serviceLength(service)}</span></div><div className="grid shrink-0 justify-items-end gap-1"><Money paise={service.price_paise} size="lg" />{priceUnit(service) && <span className="text-xs text-muted">{priceUnit(service)}</span>}<span className="inline-flex items-center gap-0.5 text-sm font-semibold text-primary">Book<ChevronRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden /></span></div></div>
                <p className="mt-3 border-t border-border pt-3 text-sm text-muted">{service.advance_paise > 0 ? <>Pay <Money paise={service.advance_paise} size="sm" className="font-semibold text-ink" /> now · <Money paise={service.remaining_paise} size="sm" /> later</> : "No advance needed"}</p>
              </Link>
            </li>
          ))}</ul>}
      </section>

      {policies.length > 0 && <section aria-labelledby="policies"><Card><h2 id="policies" className="mb-4 text-lg">Policies</h2><dl className="grid gap-4">{policies.map(policy => <div key={policy.title} className="grid gap-1"><dt className="text-sm font-semibold">{policy.title}</dt><dd className="whitespace-pre-line text-sm text-muted">{policy.body}</dd></div>)}</dl></Card></section>}

      <section aria-labelledby="faq" className="grid gap-3">
        <h2 id="faq" className="text-lg">Questions</h2>
        <div className="grid divide-y divide-border rounded-card bg-surface ring-1 ring-border/70">{faq(vendor).map(item => (
          <details key={item.q} className="group px-5 py-1"><summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 py-2 font-medium">{item.q}<ChevronRight className="size-4 shrink-0 text-muted transition-transform group-open:rotate-90" aria-hidden /></summary><p className="whitespace-pre-line pb-4 text-sm text-muted">{item.a}</p></details>
        ))}</div>
        <p className="inline-flex items-start gap-2 text-sm text-muted"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />Your email is verified before anything is held, and you see the full terms before you agree.</p>
      </section>

      {vendor.services.length > 0 && <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/95 px-4 py-3 backdrop-blur sm:hidden">
        <Button asChild size="lg" block><Link prefetch={false} href={bookHref}><CalendarCheck aria-hidden />Book {vendor.display_name}</Link></Button>
      </div>}
    </div>
  );
}
