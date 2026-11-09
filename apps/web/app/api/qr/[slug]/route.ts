import { NextResponse } from "next/server";
import { renderSVG } from "uqr";
import { isValidSlug, vendorShareLinks } from "@bayana/shared";
import { env } from "@/env";

/**
 * The QR code for a vendor's page, drawn here so the library adds nothing to client bundles. It encodes only the public URL of an
 * address (no lookup, nothing about the vendor), and never needs the API, so it works while the API sleeps. Black on white with
 * its quiet zone, in every theme: phone cameras read a QR code reliably only this way. The target is the share card's own link.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!isValidSlug(slug)) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(renderSVG(vendorShareLinks(env.NEXT_PUBLIC_SITE_URL, slug).qrTarget, { ecc: "M", border: 2, pixelSize: 8, whiteColor: "#fff", blackColor: "#000" }), { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=86400" } });
}
