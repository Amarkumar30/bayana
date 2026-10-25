import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/brand";
import { Notice } from "@/components/ui/display";

/** Draft legal pages stay out of search results until a lawyer has reviewed them (SPEC 12.6, decision D6). */
export const legalMetadata = (title: string): Metadata => ({ title: `${title} (draft) | Bayana`, robots: { index: false, follow: true } });

/** Layout for the legal pages. The wording is a working draft; the banner stays until a lawyer has reviewed it. */
export function LegalPage({ title, version, intro, sections }: { title: string; version: string; intro: string; sections: { heading: string; body: string[] }[] }) {
  return (
    <article className="mx-auto max-w-3xl">
      <Notice tone="warning" className="mb-6"><strong className="font-semibold">Draft: needs lawyer review.</strong> This text describes how Bayana works today but has not been reviewed by a lawyer and may change before launch.</Notice>
      <PageHeader eyebrow="Legal" title={title} description={`Version ${version}`} />
      <p className="mb-6 leading-relaxed">{intro}</p>
      <nav aria-label="On this page" className="mb-8 rounded-card bg-surface p-4 ring-1 ring-border"><p className="mb-2 text-sm font-semibold">On this page</p><ol className="grid gap-1 text-sm">{sections.map((section, index) => <li key={section.heading}><a href={`#s${index + 1}`} className="inline-flex min-h-11 items-center sm:min-h-0">{index + 1}. {section.heading}</a></li>)}</ol></nav>
      <div className="grid gap-8">{sections.map((section, index) => <section key={section.heading} id={`s${index + 1}`} className="grid scroll-mt-24 gap-2"><h2 className="text-lg">{index + 1}. {section.heading}</h2>{section.body.map(paragraph => <p key={paragraph} className="leading-relaxed text-muted">{paragraph}</p>)}</section>)}</div>
    </article>
  );
}
