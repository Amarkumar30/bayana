"use client";
import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { KeyRound, SearchX, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, EmptyState, LoadingState, Notice, Skeleton, Table, Td, Th } from "@/components/ui/display";
import { Field, Input } from "@/components/ui/field";
import { ApiError, api, humanMessage } from "@/lib/api";
import { cn } from "@/lib/utils";

type Loaded<T> = { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; data: T };
/** One admin endpoint. Access problems are handled once by AdminGate, so here they are ordinary errors. */
export function useAdmin<T>(path: string | null) {
  const [state, setState] = useState<Loaded<T>>({ kind: "loading" });
  const load = useCallback(async () => {
    if (path === null) return;
    try { setState({ kind: "ready", data: await api<T>(path) }); } catch (failure) { setState({ kind: "error", message: humanMessage(failure) }); }
  }, [path]);
  useEffect(() => { void load(); }, [load]);
  return [state, load] as const;
}
export function Show<T>({ state, retry, children, rows = 4 }: { state: Loaded<T>; retry: () => void; children: (data: T) => ReactNode; rows?: number }) {
  if (state.kind === "loading") return <LoadingState label="Loading…" className="grid gap-2">{Array.from({ length: rows }, (_, index) => <Skeleton key={index} className="h-14" />)}</LoadingState>;
  if (state.kind === "error") return <div className="grid gap-3"><Notice tone="danger">{state.message}</Notice><Button variant="secondary" className="w-fit" onClick={retry}>Try again</Button></div>;
  return <>{children(state.data)}</>;
}

type Access = { kind: "checking" } | { kind: "signed-out" } | { kind: "not-found" } | { kind: "enrol" } | { kind: "verify" } | { kind: "ok" } | { kind: "error"; message: string };
/**
 * Asks GET /v1/admin/2fa who this is: not signed in (sign in first), not an admin (the same "not found" as any unknown page),
 * an admin without the second factor on this session (enrol or enter a code), or through.
 */
export function AdminGate({ children }: { children: ReactNode }) {
  const [access, setAccess] = useState<Access>({ kind: "checking" });
  const check = useCallback(async () => {
    try { const state = await api<{ enrolled: boolean; verified: boolean }>("/v1/admin/2fa"); setAccess({ kind: state.verified ? "ok" : state.enrolled ? "verify" : "enrol" }); }
    catch (failure) { setAccess(failure instanceof ApiError && failure.status === 401 ? { kind: "signed-out" } : failure instanceof ApiError && failure.status === 404 ? { kind: "not-found" } : { kind: "error", message: humanMessage(failure) }); }
  }, []);
  useEffect(() => { void check(); }, [check]);
  if (access.kind === "checking") return <LoadingState label="Checking access…" className="grid gap-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-48 rounded-card" /></LoadingState>;
  if (access.kind === "signed-out") return <EmptyState className="mx-auto max-w-xl" icon={<KeyRound />} title="Sign in first" description="Sign in with your account, then confirm it's you with your authenticator app." action={<Button asChild><Link href="/login?next=/admin">Sign in</Link></Button>} />;
  if (access.kind === "not-found") return <EmptyState className="mx-auto max-w-xl" icon={<SearchX />} title="Page not found" description="This page doesn't exist." action={<Button asChild variant="secondary"><Link href="/dashboard">Go to your dashboard</Link></Button>} />;
  if (access.kind === "error") return <div className="grid gap-3"><Notice tone="danger">{access.message}</Notice><Button variant="secondary" className="w-fit" onClick={() => void check()}>Try again</Button></div>;
  if (access.kind === "enrol" || access.kind === "verify") return <SecondFactor enrolled={access.kind === "verify"} onVerified={() => setAccess({ kind: "ok" })} />;
  return <>{children}</>;
}

function SecondFactor({ enrolled, onVerified }: { enrolled: boolean; onVerified: () => void }) {
  const [setup, setSetup] = useState<{ secret: string; otpauth_url: string }>(); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const start = async () => { setBusy(true); setError(""); try { setSetup(await api("/v1/admin/2fa/enroll", { body: {} })); } catch (failure) { setError(humanMessage(failure)); } finally { setBusy(false); } };
  const verify = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const code = String(new FormData(event.currentTarget).get("code") ?? "").replace(/\s/g, "");
    if (!/^\d{6}$/.test(code)) { setError("Enter the 6-digit code from your authenticator app."); return; }
    setBusy(true); setError("");
    try { await api("/v1/admin/2fa/verify", { body: { code } }); onVerified(); }
    catch (failure) { setError(failure instanceof ApiError && failure.code === "OTP_INVALID" ? "That code is wrong or was already used. Wait for the next code in your app and try again." : humanMessage(failure)); }
    finally { setBusy(false); }
  };
  return (
    <Card className="mx-auto grid w-full max-w-lg gap-4">
      <CardHeader title={enrolled ? "Confirm it's you" : "Set up your authenticator"} description={enrolled ? "Enter the 6-digit code from your authenticator app. You'll be asked again every 12 hours and on each new device." : "Admin access needs a second factor. Use Google Authenticator, Microsoft Authenticator, 1Password or any TOTP app."} />
      {!enrolled && !setup && <Button className="w-fit" loading={busy} onClick={() => void start()}><ShieldCheck aria-hidden />Start setup</Button>}
      {setup && <div className="grid gap-2 text-sm">
        <p>Add an account in your app with this setup key (time-based), or open the link on the phone that has the app:</p>
        <p className="break-all rounded-input bg-surface-muted px-3 py-2.5 font-mono tracking-wider" aria-label="Setup key">{setup.secret.match(/.{1,4}/g)?.join(" ")}</p>
        <a href={setup.otpauth_url} className="inline-flex min-h-11 w-fit items-center font-medium">Open in authenticator app</a>
        <Notice tone="warning">This key is shown once. If you lose your phone, another admin has to reset it.</Notice>
      </div>}
      {(enrolled || setup) && <form onSubmit={verify} noValidate className="grid gap-3"><Field label="6-digit code">{p => <Input {...p} name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} required />}</Field><Button loading={busy} loadingText="Checking…">{enrolled ? "Continue" : "Finish setup"}</Button></form>}
      {error && <Notice tone="danger">{error}</Notice>}
    </Card>
  );
}

export type Column<T> = { label: string; render: (row: T) => ReactNode; className?: string };
/** Cards on phones (label and value pairs), a table from md up. */
export function AdminTable<T>({ rows, columns, rowKey, caption, empty }: { rows: T[]; columns: Column<T>[]; rowKey: (row: T) => string; caption: string; empty: string }) {
  if (!rows.length) return <p className="rounded-card bg-surface-muted px-4 py-3 text-sm text-muted">{empty}</p>;
  return (
    <>
      <ul className="grid gap-3 md:hidden" aria-label={caption}>{rows.map(row => <li key={rowKey(row)} className="rounded-card bg-surface p-4 shadow-soft ring-1 ring-border/70">
        <dl className="grid gap-1.5 text-sm">{columns.map(column => <div key={column.label} className="grid grid-cols-[7rem_1fr] gap-2"><dt className="text-muted">{column.label}</dt><dd className="min-w-0 break-words">{column.render(row)}</dd></div>)}</dl>
      </li>)}</ul>
      <div className="hidden md:block"><Table><caption className="sr-only">{caption}</caption><thead><tr>{columns.map(column => <Th key={column.label}>{column.label}</Th>)}</tr></thead><tbody>{rows.map(row => <tr key={rowKey(row)}>{columns.map(column => <Td key={column.label} className={cn("align-top", column.className)}>{column.render(row)}</Td>)}</tr>)}</tbody></Table></div>
    </>
  );
}

/** A search box that keeps its value in the URL (?q=), for the admin lists. */
export function SearchForm({ value, placeholder, onSearch, children }: { value: string; placeholder: string; onSearch: (value: string) => void; children?: ReactNode }) {
  return (
    <form role="search" aria-label="Search" className="mb-4 flex flex-wrap items-end gap-3" onSubmit={event => { event.preventDefault(); onSearch(String(new FormData(event.currentTarget).get("q") ?? "").trim()); }}>
      <Field label="Search" className="min-w-0 flex-1">{p => <Input {...p} name="q" type="search" defaultValue={value} placeholder={placeholder} />}</Field>
      {children}
      <Button type="submit" variant="secondary">Search</Button>
    </form>
  );
}

/** Operational times across vendors, shown in the admin's own timezone (only ever rendered after data loads in the browser). */
export const when = (iso: string | null | undefined) => iso ? new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true }).format(new Date(iso)) : "—";
