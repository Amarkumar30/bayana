import Link from "next/link";
import { Brand } from "./brand";
import { businessDetails as business, filledDetail } from "@/lib/business-details";

/** Every legal and product page, as one list: the footer, the sitemap and the link tests use it. */
export const footerLinks = {
  product: [{ href: "/pricing", label: "Pricing" }, { href: "/about", label: "About" }, { href: "/contact", label: "Contact" }, { href: "/login?next=/dashboard", label: "Vendor sign in" }],
  legal: [{ href: "/terms", label: "Terms of service" }, { href: "/vendor-terms", label: "Vendor agreement" }, { href: "/privacy", label: "Privacy policy" }, { href: "/refunds", label: "Cancellation and refunds" }, { href: "/shipping", label: "Shipping and delivery" }]
} as const;

/**
 * The footer on every public page: links, and who operates Bayana. Server-rendered. Links do not prefetch, so a phone opening a
 * cached vendor page does not fetch every legal page as well.
 */
export function SiteFooter({ narrow = false, slim = false }: { narrow?: boolean; slim?: boolean }) {
  // Details still in [PLACEHOLDER] form are left out, never printed; the production build refuses to finish while any remain.
  const legalName = filledDetail(business.legalName), address = filledDetail(business.address), officer = filledDetail(business.grievanceOfficer.name);
  const width = narrow ? "max-w-3xl" : "max-w-6xl";
  const link = "inline-flex min-h-11 items-center text-muted no-underline hover:text-ink sm:min-h-0 sm:py-1.5";
  const operator = <p>© {new Date().getFullYear()} {legalName ? <>{legalName}. {business.tradingName} is</> : <>{business.tradingName},</>} a technology platform; services are provided by the businesses you book.</p>;
  const contact = <p>{address && <>{address} · </>}{business.gstin && <>GSTIN {business.gstin} · </>}<a href={`mailto:${business.supportEmail}`} className="text-muted">{business.supportEmail}</a> · {officer ? <>Grievance officer: {officer}, </> : "Grievances: "}<a href={`mailto:${business.grievanceOfficer.email}`} className="text-muted">{business.grievanceOfficer.email}</a></p>;
  // Booking pages: the same links and details in a few lines, so the steps are not followed by a screen of footer.
  if (slim) return (
    <footer className="mt-12 border-t border-border bg-surface" data-testid="site-footer">
      <div className="mx-auto grid max-w-3xl gap-2 px-4 py-4 text-xs text-muted sm:px-6">
        <nav aria-label="Bayana" className="flex flex-wrap gap-x-4">{[...footerLinks.product, ...footerLinks.legal].map(item => <Link key={item.href} href={item.href} prefetch={false} className={link}>{item.label}</Link>)}</nav>
        {operator}{contact}
      </div>
    </footer>
  );
  return (
    <footer className="mt-16 border-t border-border bg-surface" data-testid="site-footer">
      <div className={`mx-auto grid ${width} gap-8 px-4 py-10 sm:grid-cols-[2fr_1fr_1fr] sm:px-6`}>
        <div className="grid content-start gap-2"><Brand prefetch={false} /><p className="max-w-xs text-sm text-muted">Advance bookings for independent service professionals across India. Clear terms, verified payments.</p></div>
        <nav aria-label="Product" className="grid content-start gap-0.5 text-sm"><strong className="mb-1 text-ink">Product</strong>{footerLinks.product.map(item => <Link key={item.href} href={item.href} prefetch={false} className={link}>{item.label}</Link>)}</nav>
        <nav aria-label="Legal" className="grid content-start gap-0.5 text-sm"><strong className="mb-1 text-ink">Legal</strong>{footerLinks.legal.map(item => <Link key={item.href} href={item.href} prefetch={false} className={link}>{item.label}</Link>)}</nav>
      </div>
      <div className="border-t border-border">
        <div className={`mx-auto grid ${width} gap-1 px-4 py-4 text-xs text-muted sm:px-6`}>
          {operator}
          {contact}
        </div>
      </div>
    </footer>
  );
}
