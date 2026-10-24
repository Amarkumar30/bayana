"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { KeyRound, Mail } from "lucide-react";
import { googleErrorCopy } from "@bayana/shared";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Badge, Card, CardHeader, LoadingState, Notice, Skeleton } from "@/components/ui/display";
import { useToast } from "@/components/ui/toast";
import { ApiError, api, humanMessage } from "@/lib/api";
import { PasswordField, passwordError } from "./auth-fields";
import { googleStartUrl } from "./google-button";

type Methods = { email_code: boolean; password: { set: boolean }; google: { available: boolean; connected: boolean; email: string | null } };
const methodMessage = (failure: unknown) => failure instanceof ApiError && failure.code === "LAST_SIGN_IN_METHOD" ? failure.message : failure instanceof ApiError && failure.code === "INVALID_CREDENTIALS" ? "Your current password is not right." : humanMessage(failure);

/** Settings > Sign-in methods: Google, email code (always on), password. The last way in can never be removed (the API checks too). */
export function SignInMethods({ result }: { result?: { connected?: boolean; error?: string } }) {
  const toast = useToast();
  const [methods, setMethods] = useState<Methods>(); const [error, setError] = useState(""); const [busy, setBusy] = useState("");
  const load = useCallback(() => api<Methods>("/v1/auth/methods").then(setMethods).catch(failure => setError(humanMessage(failure))), []);
  useEffect(() => { void load(); }, [load]);
  if (!methods) return error ? <Notice tone="danger">{error}</Notice> : <LoadingState label="Loading sign-in methods…"><Skeleton className="h-64 rounded-card" /></LoadingState>;
  const others = Number(methods.email_code) + Number(methods.password.set);
  const disconnect = async () => {
    setBusy("google"); setError("");
    try { await api("/v1/auth/google", { method: "DELETE" }); toast({ title: "Google disconnected", tone: "success" }); await load(); } catch (failure) { setError(methodMessage(failure)); } finally { setBusy(""); }
  };
  return (
    <Card className="grid gap-4"><CardHeader title="Sign-in methods" description="Ways you can sign in to Bayana. You always need at least one." />
      {result?.connected && <Notice tone="success">Google is connected. You can now sign in with it.</Notice>}
      {result?.error && <Notice tone="warning">{googleErrorCopy[result.error] ?? "Google could not be connected. Please try again."}</Notice>}
      {error && <Notice tone="danger">{error}</Notice>}
      <ul className="grid divide-y divide-border">
        <li className="flex flex-wrap items-center justify-between gap-3 py-3">
          <span className="grid"><span className="font-medium">Google</span><span className="text-sm text-muted">{methods.google.connected ? `Connected as ${methods.google.email}` : methods.google.available ? "Not connected" : "Not available right now"}</span></span>
          {methods.google.connected ? <Button variant="secondary" loading={busy === "google"} disabled={others === 0} onClick={() => void disconnect()}>Disconnect</Button>
            : methods.google.available ? <a href={googleStartUrl("/dashboard/settings", "link")} className={buttonVariants({ variant: "secondary" })}>Connect Google</a> : null}
        </li>
        <li className="flex flex-wrap items-center justify-between gap-3 py-3">
          <span className="grid"><span className="inline-flex items-center gap-2 font-medium"><Mail className="size-4" aria-hidden />Email code</span><span className="text-sm text-muted">A six-digit code sent to your email each time.</span></span>
          <Badge tone={methods.email_code ? "success" : "neutral"}>{methods.email_code ? "Always on" : "After you verify your email"}</Badge>
        </li>
        <li className="flex flex-wrap items-center justify-between gap-3 py-3">
          <span className="grid"><span className="inline-flex items-center gap-2 font-medium"><KeyRound className="size-4" aria-hidden />Password</span><span className="text-sm text-muted">{methods.password.set ? "Set. Changing or removing it signs out your other devices." : "Optional. Add one if you prefer typing a password."}</span></span>
          <span className="flex flex-wrap gap-2"><PasswordDialog hasPassword={methods.password.set} onDone={() => void load()} />{methods.password.set && (methods.email_code || methods.google.connected) && <RemovePasswordDialog onDone={() => void load()} />}</span>
        </li>
      </ul>
    </Card>
  );
}

function PasswordDialog({ hasPassword, onDone }: { hasPassword: boolean; onDone: () => void }) {
  const toast = useToast();
  const [open, setOpen] = useState(false); const [current, setCurrent] = useState(""); const [next, setNext] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const problem = (hasPassword && !current ? "Enter your current password." : undefined) ?? passwordError(next);
    if (problem) { setError(problem); return; }
    setBusy(true); setError("");
    try { await api("/v1/auth/password", { method: "PUT", body: { ...(hasPassword ? { current_password: current } : {}), new_password: next } }); toast({ title: hasPassword ? "Password changed" : "Password added", description: "Your other devices were signed out.", tone: "success" }); setOpen(false); setCurrent(""); setNext(""); onDone(); }
    catch (failure) { setError(methodMessage(failure)); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="secondary">{hasPassword ? "Change" : "Add a password"}</Button></DialogTrigger>
      <DialogContent title={hasPassword ? "Change your password" : "Add a password"} description="At least 10 characters. Your other devices will be signed out.">
        <form onSubmit={submit} noValidate className="grid gap-3">
          {hasPassword && <PasswordField label="Current password" autoComplete="current-password" value={current} onChange={setCurrent} />}
          <PasswordField label="New password" autoComplete="new-password" value={next} onChange={setNext} />
          {error && <Notice tone="danger">{error}</Notice>}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><DialogClose asChild><Button type="button" variant="secondary">Cancel</Button></DialogClose><Button loading={busy} loadingText="Saving…">Save password</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RemovePasswordDialog({ onDone }: { onDone: () => void }) {
  const toast = useToast();
  const [open, setOpen] = useState(false); const [current, setCurrent] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (!current) { setError("Enter your current password."); return; }
    setBusy(true); setError("");
    try { await api("/v1/auth/password", { method: "DELETE", body: { current_password: current } }); toast({ title: "Password removed", description: "Sign in with Google or an email code from now on.", tone: "success" }); setOpen(false); setCurrent(""); onDone(); }
    catch (failure) { setError(methodMessage(failure)); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="ghost">Remove</Button></DialogTrigger>
      <DialogContent title="Remove your password?" description="You'll sign in with Google or an email code instead. Your other devices will be signed out.">
        <form onSubmit={submit} noValidate className="grid gap-3">
          <PasswordField label="Current password" autoComplete="current-password" value={current} onChange={setCurrent} />
          {error && <Notice tone="danger">{error}</Notice>}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><DialogClose asChild><Button type="button" variant="secondary">Keep password</Button></DialogClose><Button variant="danger" loading={busy} loadingText="Removing…">Remove password</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
