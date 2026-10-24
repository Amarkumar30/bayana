import { PageHeader } from "@/components/layout/brand";
import { PreviewBanner } from "@/components/layout/preview-banner";

/** Layout for legal pages. The wording is a placeholder until a lawyer reviews it (SPEC decision D6). */
export function LegalPage({ title, sections }: { title: string; sections: { heading: string; body: string }[] }) {
  return (
    <article className="mx-auto max-w-3xl">
      <PreviewBanner>This is placeholder wording for layout review. It is not Bayana's legal text and has not been reviewed by a lawyer.</PreviewBanner>
      <PageHeader eyebrow="Legal" title={title} description="Last updated: not yet published" />
      <nav aria-label="On this page" className="mb-8 rounded-card bg-surface p-4 ring-1 ring-border"><p className="mb-2 text-sm font-semibold">On this page</p><ol className="grid gap-1 text-sm">{sections.map((section, index) => <li key={section.heading}><a href={`#s${index + 1}`}>{index + 1}. {section.heading}</a></li>)}</ol></nav>
      <div className="grid gap-8">{sections.map((section, index) => <section key={section.heading} id={`s${index + 1}`} className="grid scroll-mt-24 gap-2"><h2 className="text-lg">{index + 1}. {section.heading}</h2><p className="leading-relaxed text-muted">{section.body}</p></section>)}</div>
    </article>
  );
}
