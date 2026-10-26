"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { googleErrorCopy } from "@bayana/shared";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/display";
import { api, humanMessage, safeNext } from "@/lib/api";
import { CodeField, EmailField, PasswordField, ResendButton, codeError, emailError, useTouched } from "./auth-fields";
import { GoogleButton, useGoogleEnabled } from "./google-button";

/** AU-02, passwordless first: Continue with Google, then an email code; a password only if the account has one. */
export function LoginForm() {
  const router = useRouter(); const params = useSearchParams(); const next = safeNext(params.get("next"));
  const googleError = googleErrorCopy[params.get("error") ?? ""];
  const google = useGoogleEnabled();
  const [method, setMethod] = useState<"code" | "password">("code");
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const touched = useTouched();
  const errors = { email: emailError(email), password: password ? undefined : "Enter your password.", code: codeError(code) };
  const shown = (name: keyof typeof errors) => touched.show(name) ? errors[name] : undefined;
  const run = async (action: () => Promise<unknown>) => { setBusy(true); setError(""); try { await action(); return true; } catch (failure) { setError(humanMessage(failure)); return false; } finally { setBusy(false); } };

  const withPassword = async (event: FormEvent) => {
    event.preventDefault(); touched.submitAll(); if (errors.email || errors.password) return;
    if (await run(() => api("/v1/auth/login", { body: { email, password } }))) router.push(next);
  };
  const sendCode = () => run(() => api("/v1/auth/otp/request", { body: { email, purpose: "login" } }));
  const withCode = async (event: FormEvent) => {
    event.preventDefault(); touched.submitAll();
    if (!codeSent) { if (errors.email) return; if (await sendCode()) { setCodeSent(true); touched.reset(); } return; }
    if (errors.code) return;
    if (await run(() => api("/v1/auth/login", { body: { email, code } }))) router.push(next);
  };
  const switchTo = (value: "code" | "password") => { setMethod(value); setError(""); setCodeSent(false); setCode(""); touched.reset(); };

  return (
    <div className="grid gap-6">
      <div className="grid gap-1"><h1 className="text-2xl">Welcome back</h1><p className="text-sm text-muted">Sign in to manage your bookings.</p></div>
      {googleError && <Notice tone="warning">{googleError}</Notice>}
      <GoogleButton next={next} />
      {google && <p className="-mt-3 text-center text-xs text-muted">New to Bayana? Continuing with Google creates your account and agrees to the <Link href="/terms">terms</Link> and <Link href="/vendor-terms">vendor agreement</Link>; see the <Link href="/privacy">privacy policy</Link>.</p>}
      {google && <p className="flex items-center gap-3 text-xs uppercase tracking-wide text-muted" aria-hidden><span className="h-px flex-1 bg-border" />or<span className="h-px flex-1 bg-border" /></p>}
      {method === "code" ? (
        <form onSubmit={withCode} noValidate className="grid gap-4" aria-label="Sign in with an email code">
          <EmailField value={email} onChange={setEmail} onBlur={() => touched.touch("email")} error={shown("email")} disabled={codeSent} />
          {codeSent && <CodeField email={email} value={code} onChange={setCode} onBlur={() => touched.touch("code")} error={shown("code")} />}
          {error && <Notice tone="danger">{error}</Notice>}
          <Button size="lg" block variant={google ? "secondary" : "primary"} loading={busy} loadingText={codeSent ? "Checking…" : "Sending…"}>{codeSent ? "Sign in" : "Email me a code"}</Button>
          {codeSent && <div className="flex flex-wrap justify-between gap-2"><Button type="button" variant="ghost" size="sm" onClick={() => { setCodeSent(false); setCode(""); setError(""); }}>Use a different email</Button><ResendButton onResend={sendCode} /></div>}
          <Button type="button" variant="ghost" className="justify-self-center" onClick={() => switchTo("password")}>Use password</Button>
        </form>
      ) : (
        <form onSubmit={withPassword} noValidate className="grid gap-4" aria-label="Sign in with a password">
          <EmailField value={email} onChange={setEmail} onBlur={() => touched.touch("email")} error={shown("email")} />
          <PasswordField label="Password" autoComplete="current-password" value={password} onChange={setPassword} onBlur={() => touched.touch("password")} error={shown("password")} />
          {error && <Notice tone="danger">{error}</Notice>}
          <Button size="lg" block loading={busy} loadingText="Signing in…">Sign in</Button>
          <div className="flex flex-wrap justify-between gap-2"><Button type="button" variant="ghost" size="sm" onClick={() => switchTo("code")}>Use an email code instead</Button><Link href="/forgot" className="inline-flex min-h-11 items-center text-sm">Forgot your password?</Link></div>
        </form>
      )}
      <p className="text-center text-sm text-muted">New to Bayana? <Link href="/signup">Create an account</Link></p>
    </div>
  );
}
