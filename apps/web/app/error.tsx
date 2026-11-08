"use client";
import Link from "next/link";
import { Brand } from "@/components/layout/brand";
import { Button } from "@/components/ui/button";

/** Any page that fails to render: say so plainly, offer to try again, and a way home. Never the raw error. */
export default function PageError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="main" className="mx-auto grid min-h-dvh max-w-md content-center justify-items-center gap-4 px-4 text-center">
      <Brand />
      <h1 className="text-2xl">This page didn't load</h1>
      <p className="text-muted">Something went wrong on our side, not yours. Try again; if it keeps happening, go back to the start and try once more in a few minutes.</p>
      <div className="flex flex-wrap justify-center gap-2"><Button onClick={reset}>Try again</Button><Button asChild variant="secondary"><Link href="/">Go to Bayana</Link></Button></div>
    </main>
  );
}
