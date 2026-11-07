"use client";
import { Copy, ExternalLink, MessageCircle } from "lucide-react";
import { encode } from "uqr";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/display";
import { useToast } from "@/components/ui/toast";
import { vendorLinkLabel, vendorUrl } from "@/lib/site";
import { env } from "@/env";

/** Black on white in every theme, with its quiet zone: phone cameras read a QR code reliably only this way. */
function QrCode({ value, label }: { value: string; label: string }) {
  const { data, size } = encode(value, { ecc: "M", border: 2 });
  const modules = data.flatMap((row, y) => row.flatMap((dark, x) => dark ? [`M${x} ${y}h1v1h-1z`] : []));
  return <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label} shapeRendering="crispEdges" className="size-44 rounded-input bg-white"><path d={modules.join("")} fill="black" /></svg>;
}

/** The vendor's first share: the link to copy, a WhatsApp message and a QR code for a counter or a business card. */
export function ShareCard({ slug, businessName, published }: { slug: string; businessName: string; published: boolean }) {
  const toast = useToast();
  const url = vendorUrl(env.NEXT_PUBLIC_SITE_URL, slug);
  const whatsapp = `https://wa.me/?text=${encodeURIComponent(`Book ${businessName} here: ${url}`)}`;
  return (
    <Card><CardHeader title="Share your page" description={published ? "Live. Send it to your customers." : "You can share it once it is published."} />
      <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-start">
        <div className="grid min-w-0 gap-2">
          <p className="break-all rounded-input bg-surface-muted px-3 py-2.5 font-mono text-sm">{vendorLinkLabel(env.NEXT_PUBLIC_SITE_URL, slug)}</p>
          <Button type="button" onClick={() => void navigator.clipboard.writeText(url).then(() => toast({ title: "Link copied", tone: "success" }))}><Copy aria-hidden />Copy link</Button>
          <Button asChild variant="secondary"><a href={whatsapp} target="_blank" rel="noreferrer"><MessageCircle aria-hidden />Share on WhatsApp</a></Button>
          <Button asChild variant="ghost"><a href={`/${slug}`} target="_blank" rel="noreferrer"><ExternalLink aria-hidden />Preview</a></Button>
        </div>
        <div className="justify-self-center"><QrCode value={url} label={`QR code for ${businessName}'s booking page`} /></div>
      </div>
    </Card>
  );
}
