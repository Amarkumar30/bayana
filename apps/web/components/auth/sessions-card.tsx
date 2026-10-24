"use client";
import { useRouter } from "next/navigation";
import { Monitor, Smartphone } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardHeader, LoadingState, Notice, Skeleton } from "@/components/ui/display";
import { useToast } from "@/components/ui/toast";
import { api, humanMessage } from "@/lib/api";

type Session = { id: string; created_at: string; last_used_at: string; ip: string | null; user_agent: string | null; current: boolean };
const describe = (agent: string | null) => {
  if (!agent) return { label: "Unknown device", mobile: false };
  const browser = /Edg\//.test(agent) ? "Edge" : /Chrome\//.test(agent) ? "Chrome" : /Firefox\//.test(agent) ? "Firefox" : /Safari\//.test(agent) ? "Safari" : "Browser";
  const os = /Android/.test(agent) ? "Android" : /iPhone|iPad/.test(agent) ? "iOS" : /Windows/.test(agent) ? "Windows" : /Mac OS X/.test(agent) ? "macOS" : /Linux/.test(agent) ? "Linux" : "";
  return { label: os ? `${browser} on ${os}` : browser, mobile: /Android|iPhone|iPad|Mobile/.test(agent) };
};

/** Live list of this account's signed-in devices (AU-08), with sign-out per device. */
export function SessionsCard() {
  const router = useRouter(); const toast = useToast();
  const [sessions, setSessions] = useState<Session[]>(); const [error, setError] = useState(""); const [busy, setBusy] = useState("");
  const load = useCallback(() => api<{ sessions: Session[] }>("/v1/auth/sessions").then(data => { setSessions(data.sessions); setError(""); }).catch(failure => setError(humanMessage(failure))), []);
  useEffect(() => { void load(); }, [load]);
  const revoke = async (session: Session) => {
    setBusy(session.id);
    try { await api(`/v1/auth/sessions/${session.id}`, { method: "DELETE" }); if (session.current) { router.push("/login"); return; } toast({ title: "Signed out that device", tone: "success" }); await load(); }
    catch (failure) { setError(humanMessage(failure)); } finally { setBusy(""); }
  };
  return (
    <Card className="grid gap-4">
      <CardHeader title="Signed-in devices" description="Sign out anywhere you don't recognise. Changing your password signs out every device." />
      {error && <Notice tone="danger">{error}</Notice>}
      {!sessions && !error ? <LoadingState label="Loading devices…" className="grid gap-2"><Skeleton className="h-16" /><Skeleton className="h-16" /></LoadingState> : (
        <ul className="grid gap-2">{sessions?.map(session => { const device = describe(session.user_agent); const Icon = device.mobile ? Smartphone : Monitor; return (
          <li key={session.id} className="flex flex-wrap items-center gap-3 rounded-input bg-surface-muted px-4 py-3">
            <Icon className="size-5 text-muted" aria-hidden />
            <div className="grid min-w-0 flex-1"><span className="font-medium">{device.label} {session.current && <Badge tone="success" className="ml-1">This device</Badge>}</span><span className="text-xs text-muted">Last active {new Date(session.last_used_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}{session.ip ? ` · ${session.ip}` : ""}</span></div>
            <Button size="sm" variant={session.current ? "secondary" : "ghost"} loading={busy === session.id} onClick={() => void revoke(session)}>{session.current ? "Sign out" : "Sign out device"}</Button>
          </li>
        ); })}</ul>
      )}
    </Card>
  );
}
