import { env } from "@/env";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Clock, MapPin, ChevronRight } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge, Card, EmptyState, Money } from "@/components/ui/display";
const api = env.NEXT_PUBLIC_API_URL;
type Service = { id: string; name: string; description: string; price_paise: string; duration_minutes: number; advance_paise: number; remaining_paise: number };
type Vendor = { slug: string; canonical_slug: string; display_name: string; city: string; bio: string; service_area: string | null; timezone: string; categories: string[]; terms: string; cancellation_policy: string; rescheduling_policy: string; services: Service[] };
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) { const { slug } = await params; const response = await fetch(`${api}/v1/vendors/${slug}`, { cache: "no-store" }); if (!response.ok) return { robots: { index: false } }; const vendor = await response.json() as Vendor; return { title: `${vendor.display_name} | Bayana`, description: vendor.bio || `Book ${vendor.display_name} on Bayana` }; }
export default async function VendorPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params; const response = await fetch(`${api}/v1/vendors/${slug}`, { cache: "no-store" }); if (!response.ok) notFound(); const vendor = await response.json() as Vendor; if (vendor.canonical_slug !== slug) redirect(`/${vendor.canonical_slug}`);
  const policies = [{ title: "Booking terms", body: vendor.terms }, { title: "Cancellation", body: vendor.cancellation_policy }, { title: "Rescheduling", body: vendor.rescheduling_policy }].filter(policy => policy.body);
  return (
    <div className="grid gap-8">
      <section className="grid gap-4">
        <div className="flex items-center gap-4"><Avatar name={vendor.display_name} size="lg" /><div className="grid gap-1"><h1 className="text-2xl sm:text-4xl">{vendor.display_name}</h1><div className="flex flex-wrap gap-1.5">{(vendor.categories.length ? vendor.categories : ["Independent service"]).map(category => <Badge key={category} tone="primary">{category}</Badge>)}</div></div></div>
        {vendor.bio && <p className="max-w-2xl text-lg text-muted">{vendor.bio}</p>}
        <p className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted"><span className="inline-flex items-center gap-1.5"><MapPin className="size-4" aria-hidden />{vendor.service_area || vendor.city}</span><span className="inline-flex items-center gap-1.5"><Clock className="size-4" aria-hidden />Times in {vendor.timezone}</span></p>
      </section>
      <section aria-labelledby="services" className="grid gap-3">
        <h2 id="services" className="text-lg">Choose a service</h2>
        {vendor.services.length === 0 ? <EmptyState title="No services are open for booking yet" description={`${vendor.display_name} hasn't listed any services. Please check back soon.`} /> :
          <ul className="grid gap-3">{vendor.services.map(service => (
            <li key={service.id}>
              <Link href={`/${vendor.slug}/book?service=${service.id}`} className="group block rounded-card bg-surface p-5 text-ink no-underline shadow-soft ring-1 ring-border/70 transition-shadow hover:shadow-raised hover:ring-primary/40">
                <div className="flex items-start justify-between gap-4"><div className="grid gap-1"><strong className="text-base">{service.name}</strong>{service.description && <p className="text-sm text-muted">{service.description}</p>}<span className="text-sm text-muted">{service.duration_minutes} min</span></div><div className="grid shrink-0 justify-items-end gap-1"><Money paise={service.price_paise} size="lg" /><ChevronRight className="size-5 text-muted transition-transform group-hover:translate-x-0.5" aria-hidden /></div></div>
                <p className="mt-3 border-t border-border pt-3 text-sm text-muted">Advance <Money paise={service.advance_paise} size="sm" className="font-semibold text-ink" /> · Balance <Money paise={service.remaining_paise} size="sm" /></p>
              </Link>
            </li>
          ))}</ul>}
      </section>
      {policies.length > 0 && <section aria-labelledby="policies"><Card><h2 id="policies" className="mb-4 text-lg">Policies</h2><dl className="grid gap-4">{policies.map(policy => <div key={policy.title} className="grid gap-1"><dt className="text-sm font-semibold">{policy.title}</dt><dd className="whitespace-pre-line text-sm text-muted">{policy.body}</dd></div>)}</dl></Card></section>}
    </div>
  );
}
