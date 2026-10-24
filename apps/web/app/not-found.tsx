import Link from "next/link";
import { Brand } from "@/components/layout/brand";
import { Button } from "@/components/ui/button";

/** One 404 for unknown and unpublished pages alike, so nothing reveals whether a slug exists. */
export default function NotFound() {
  return (
    <main id="main" className="mx-auto grid min-h-dvh max-w-md content-center justify-items-center gap-4 px-4 text-center">
      <Brand />
      <h1 className="text-2xl">This page isn't available</h1>
      <p className="text-muted">The link may be mistyped, or the page isn't published. Check the link you were sent, or ask the business for a new one.</p>
      <Button asChild variant="secondary"><Link href="/">Go to Bayana</Link></Button>
    </main>
  );
}
