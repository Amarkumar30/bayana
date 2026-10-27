import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/brand";
import { Notice } from "@/components/ui/display";
import { loadServerEnv } from "@/env-schema";
import { indexingAllowed } from "@/lib/site";
import { businessDetails as business } from "@/lib/business-details";

/** Legal pages are public; indexable only when the whole site is (APP_ENV=production and LEGAL_REVIEWED=true). */
export const legalMetadata = (title: string, description: string): Metadata => ({ title: `${title} | Bayana`, description, robots: indexingAllowed(loadServerEnv()) ? { index: true, follow: true } : { index: false, follow: false } });

/** A paragraph, or a bulleted list. */
export type LegalBlock = string | { list: string[] };
export type LegalSection = { heading: string; body: LegalBlock[] };

/** Shown on every legal page until LEGAL_REVIEWED=true (set once a lawyer has reviewed the text). */
export function DraftNotice() {
  if (loadServerEnv().LEGAL_REVIEWED === "true") return null;
  return <Notice tone="warning" className="mb-6"><strong className="font-semibold">Draft: needs lawyer review.</strong> This text describes how Bayana works today but has not yet been reviewed by a lawyer and may change before launch.</Notice>;
}

/** Who publishes the policy: the legal entity users contract with. */
export function PublishedBy() {
  return (
    <p className="mb-6 rounded-card bg-surface p-4 text-sm leading-relaxed ring-1 ring-border" data-testid="published-by">
      Published by <strong className="font-semibold text-ink">{business.legalName}</strong> (&ldquo;{business.tradingName}&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;), a {business.entityType} with its registered office at {business.address}. Contact: <a href={`mailto:${business.supportEmail}`}>{business.supportEmail}</a>.
    </p>
  );
}

function Block({ block }: { block: LegalBlock }) {
  if (typeof block === "string") return <p className="leading-relaxed text-muted">{block}</p>;
  return <ul className="grid list-disc gap-1.5 pl-5 leading-relaxed text-muted">{block.list.map(item => <li key={item}>{item}</li>)}</ul>;
}

/** Layout for the legal pages: draft notice, version, publisher, contents, numbered sections. Server-rendered. */
export function LegalPage({ title, version, intro, sections }: { title: string; version?: string; intro: string; sections: LegalSection[] }) {
  return (
    <article className="mx-auto max-w-3xl">
      <DraftNotice />
      <PageHeader eyebrow="Legal" title={title} description={`${version ? `Version ${version} · ` : ""}Effective ${business.effectiveDate}`} />
      <PublishedBy />
      <p className="mb-6 leading-relaxed">{intro}</p>
      <nav aria-label="On this page" className="mb-8 rounded-card bg-surface p-4 ring-1 ring-border"><p className="mb-2 text-sm font-semibold">On this page</p><ol className="grid gap-1 text-sm">{sections.map((section, index) => <li key={section.heading}><a href={`#s${index + 1}`} className="inline-flex min-h-11 items-center sm:min-h-0">{index + 1}. {section.heading}</a></li>)}</ol></nav>
      <div className="grid gap-8">{sections.map((section, index) => (
        <section key={section.heading} id={`s${index + 1}`} className="grid scroll-mt-24 gap-3"><h2 className="text-lg">{index + 1}. {section.heading}</h2>{section.body.map((block, blockIndex) => <Block key={blockIndex} block={block} />)}</section>
      ))}</div>
    </article>
  );
}
