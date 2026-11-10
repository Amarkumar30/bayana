"use client";
import { Copy, ExternalLink, MessageCircle } from "lucide-react";
import { vendorShareLinks } from "@bayana/shared";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/display";
import { useToast } from "@/components/ui/toast";
import { env } from "@/env";

/** The vendor's first share: the link to copy, a WhatsApp message and a QR code for a counter or a business card. */
export function ShareCard({ slug, businessName, published }: { slug: string; businessName: string; published: boolean }) {
  const toast = useToast();
  // One call for the shown link, Copy link, WhatsApp and (in /api/qr) the QR code, all from NEXT_PUBLIC_SITE_URL.
  const links = vendorShareLinks(env.NEXT_PUBLIC_SITE_URL, slug);
  return (
    <Card><CardHeader title="Share your page" description={published ? "Live. Send it to your customers." : "You can share it once it is published."} />
      <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-start">
        <div className="grid min-w-0 gap-2">
          <p className="break-all rounded-input bg-surface-muted px-3 py-2.5 font-mono text-sm">{links.label}</p>
          <Button type="button" onClick={() => void navigator.clipboard.writeText(links.url).then(() => toast({ title: "Link copied", tone: "success" }))}><Copy aria-hidden />Copy link</Button>
          <Button asChild variant="secondary"><a href={links.whatsapp(businessName)} target="_blank" rel="noreferrer"><MessageCircle aria-hidden />Share on WhatsApp</a></Button>
          <Button asChild variant="ghost"><a href={`/${slug}`} target="_blank" rel="noreferrer"><ExternalLink aria-hidden />Preview</a></Button>
        </div>
        <img src={`/api/qr/${encodeURIComponent(slug)}`} alt={`QR code for ${businessName}'s booking page`} width={176} height={176} className="size-44 justify-self-center rounded-input" />
      </div>
    </Card>
  );
}
