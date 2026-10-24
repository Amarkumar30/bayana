"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CloudOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/display";

/** Only reached when there is no cached copy yet and the API cannot answer; a cached page is served instead whenever one exists. */
export default function VendorPageError({ reset }: { reset: () => void }) {
  const path = usePathname();
  return <EmptyState icon={<CloudOff />} title="This booking page is taking a moment to load" description="Bayana is waking up after a quiet spell. It usually takes under a minute."
    action={<div className="flex flex-wrap justify-center gap-2"><Button asChild><Link href={`/waking?next=${encodeURIComponent(path)}`}>Wait and continue</Link></Button><Button variant="secondary" onClick={reset}>Try again</Button></div>} />;
}
