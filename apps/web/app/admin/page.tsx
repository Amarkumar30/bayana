"use client";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { PageHeader } from "@/components/layout/brand";
import { SearchForm, Show, useAdmin, when } from "@/components/admin/admin-data";
import { Button } from "@/components/ui/button";
import { Badge, Card, Notice } from "@/components/ui/display";
import { humanMessage, api } from "@/lib/api";

type Health = {
  database: string; payment_mode: string; tick_age_minutes: number | null; tick_stale: boolean; last_tick: string | null; last_tick_status: string | null; last_reconcile: string | null; last_reconcile_status: string | null;
  failed_jobs_24h: number; outbox_queued: number; outbox_oldest: string | null; outbox_failed_7d: number; last_webhook: string | null; webhooks_review: number; webhooks_waiting: number; holds_overdue: number;
};
function Tile({ title, tone, value, children }: { title: string; tone: "success" | "warning" | "danger" | "neutral"; value: ReactNode; children?: ReactNode }) {
  return <Card className="grid content-start gap-1"><div className="flex items-start justify-between gap-2"><span className="text-sm text-muted">{title}</span><Badge tone={tone}>{tone === "success" ? "OK" : tone === "warning" ? "Check" : tone === "danger" ? "Problem" : "Info"}</Badge></div><span className="text-2xl font-semibold tabular-nums">{value}</span>{children && <span className="text-xs text-muted">{children}</span>}</Card>;
}

/** AD-03 health: database, last tick (red after 30 minutes), outbox backlog, last webhook, last reconcile. */
export default function AdminHealth() {
  const router = useRouter();
  const [state, reload] = useAdmin<Health>("/v1/admin/health");
  const [busy, setBusy] = useState(""); const [result, setResult] = useState<{ tone: "success" | "danger"; text: string }>();
  const run = async (kind: "tick" | "nightly") => {
    setBusy(kind); setResult(undefined);
    try { const outcome = await api<{ ok: boolean; results: { job: string; status: string }[] }>(`/v1/admin/jobs/${kind}`, { body: {} }); setResult({ tone: outcome.ok ? "success" : "danger", text: `${kind === "tick" ? "Tick" : "Nightly"} finished: ${outcome.results.map(item => `${item.job} ${item.status}`).join(", ")}.` }); await reload(); }
    catch (failure) { setResult({ tone: "danger", text: humanMessage(failure) }); } finally { setBusy(""); }
  };
  return (
    <>
      <PageHeader eyebrow="Admin" title="Health" description="Is everything running? Open a booking to see why it might be stuck." actions={<><Button variant="secondary" loading={busy === "tick"} onClick={() => void run("tick")}>Run tick now</Button><Button variant="secondary" loading={busy === "nightly"} onClick={() => void run("nightly")}>Run nightly</Button></>} />
      <SearchForm value="" placeholder="Booking id, customer email or vendor slug" onSearch={value => router.push(`/admin/bookings?q=${encodeURIComponent(value)}`)} />
      {result && <Notice tone={result.tone} className="mb-4">{result.text}</Notice>}
      <Show state={state} retry={() => void reload()}>{health => (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Tile title="Database" tone="success" value="Reachable">Payment mode: {health.payment_mode}</Tile>
          <Tile title="Last tick" tone={health.tick_stale ? "danger" : health.last_tick_status === "failed" ? "warning" : "success"} value={health.tick_age_minutes === null ? "Never" : `${health.tick_age_minutes} min ago`}>{health.tick_stale ? "Stale: over 30 minutes. Check the GitHub Actions tick workflow (JOBS_ENABLED) or run it now." : `${when(health.last_tick)} · ${health.last_tick_status}`}</Tile>
          <Tile title="Email outbox" tone={health.outbox_failed_7d ? "warning" : health.outbox_queued > 50 ? "warning" : "success"} value={`${health.outbox_queued} queued`}>{health.outbox_oldest ? `Oldest ${when(health.outbox_oldest)}. ` : ""}{health.outbox_failed_7d} failed in 7 days</Tile>
          <Tile title="Webhooks" tone={health.webhooks_review ? "danger" : health.webhooks_waiting ? "warning" : "success"} value={`${health.webhooks_review} to review`}>{health.webhooks_waiting} waiting · last received {when(health.last_webhook)}</Tile>
          <Tile title="Last reconcile" tone={health.last_reconcile_status === "failed" ? "danger" : health.last_reconcile ? "success" : "neutral"} value={health.last_reconcile ? when(health.last_reconcile) : "Never"}>{health.last_reconcile_status ?? "Runs nightly when payments are on"}</Tile>
          <Tile title="Jobs and holds" tone={health.failed_jobs_24h || health.holds_overdue ? "warning" : "success"} value={`${health.failed_jobs_24h} failed jobs`}>{health.holds_overdue} holds still open more than an hour after expiry</Tile>
        </div>
      )}</Show>
    </>
  );
}
