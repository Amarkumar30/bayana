import { Loader2 } from "lucide-react";
import { PreviewBanner, previewMetadata } from "@/components/layout/preview-banner";

export const metadata = previewMetadata("One moment");
/** Shown while the API wakes from a cold start (SPEC 16.6). The retry loop is wired in a later phase. */
export default function Waking() {
  return (
    <div className="grid gap-6">
      <PreviewBanner>The automatic retry is not wired yet; this shows the layout only.</PreviewBanner>
      <div role="status" aria-live="polite" className="grid justify-items-center gap-4 py-16 text-center">
        <Loader2 className="size-10 animate-spin text-primary" aria-hidden />
        <h1 className="text-2xl">Getting things ready…</h1>
        <p className="max-w-sm text-muted">This page was resting and is waking up. It usually takes under a minute. You don't need to refresh; we'll continue automatically.</p>
        <div className="h-1.5 w-64 overflow-hidden rounded-full bg-surface-muted" aria-hidden><div className="h-full w-1/3 rounded-full bg-primary" /></div>
      </div>
    </div>
  );
}
