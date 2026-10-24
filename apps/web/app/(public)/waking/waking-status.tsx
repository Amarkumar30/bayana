"use client";
import { Loader2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { env } from "@/env";
import { safeNext } from "@/lib/api";

const POLL_MS = 3_000;
const EXPECTED_SECONDS = 60;

export function WakingStatus() {
  const router = useRouter(); const next = safeNext(useSearchParams().get("next"), "/");
  const [elapsed, setElapsed] = useState(0); const [awake, setAwake] = useState(false);
  useEffect(() => {
    const started = Date.now(); let stopped = false;
    const tick = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    const poll = async () => {
      while (!stopped) {
        await new Promise(resolve => setTimeout(resolve, POLL_MS));
        if (stopped) return;
        // Any healthy answer means the API is up; a timeout or an error just waits for the next round.
        const healthy = await fetch(`${env.NEXT_PUBLIC_API_URL}/health`, { cache: "no-store", signal: AbortSignal.timeout(POLL_MS) }).then(response => response.ok, () => false);
        if (healthy && !stopped) { setAwake(true); router.replace(next); return; }
      }
    };
    void poll();
    return () => { stopped = true; clearInterval(tick); };
  }, [next, router]);
  const progress = Math.min(95, Math.round((elapsed / EXPECTED_SECONDS) * 100));
  return (
    <div role="status" aria-live="polite" className="grid justify-items-center gap-4 py-16 text-center">
      <Loader2 className="size-10 animate-spin text-primary" aria-hidden />
      <h1 className="text-2xl">{awake ? "Ready. Taking you back…" : "Getting things ready…"}</h1>
      <p className="max-w-sm text-muted">This page was resting and is waking up. It usually takes under a minute. You don't need to refresh; we'll continue automatically.</p>
      <div className="h-1.5 w-64 max-w-full overflow-hidden rounded-full bg-surface-muted" role="progressbar" aria-label="Waking up" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><div className="h-full rounded-full bg-primary transition-[width] duration-1000" style={{ width: `${Math.max(8, progress)}%` }} /></div>
      {elapsed >= 90 && <p className="max-w-sm text-sm text-muted">This is taking longer than usual. Keep this page open, or <a href={next}>try again now</a>.</p>}
    </div>
  );
}
