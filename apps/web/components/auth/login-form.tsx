"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/display";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, humanMessage, safeNext } from "@/lib/api";
import { CodeField, EmailField, PasswordField, ResendButton, codeError, emailError, useTouched } from "./auth-fields";

export function LoginForm() {
  const router = useRouter(); const next = safeNext(useSearchParams().get("next"));
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
  const switchTab = () => { setError(""); touched.reset(); };

  return (
    <div className="grid gap-6">
      <div className="grid gap-1"><h1 className="text-2xl">Welcome back</h1><p className="text-sm text-muted">Sign in to manage your bookings.</p></div>
      <Tabs defaultValue="password" onValueChange={switchTab}>
        <TabsList aria-label="Sign-in method" className="w-full"><TabsTrigger value="password">Password</TabsTrigger><TabsTrigger value="code">Email code</TabsTrigger></TabsList>
        <TabsContent value="password">
          <form onSubmit={withPassword} noValidate className="grid gap-4">
            <EmailField value={email} onChange={setEmail} onBlur={() => touched.touch("email")} error={shown("email")} />
            <PasswordField label="Password" autoComplete="current-password" value={password} onChange={setPassword} onBlur={() => touched.touch("password")} error={shown("password")} />
            {error && <Notice tone="danger">{error}</Notice>}
            <Button size="lg" block loading={busy} loadingText="Signing in…">Sign in</Button>
            <Link href="/forgot" className="justify-self-center py-2 text-sm">Forgot your password?</Link>
          </form>
        </TabsContent>
        <TabsContent value="code">
          <form onSubmit={withCode} noValidate className="grid gap-4">
            <EmailField value={email} onChange={setEmail} onBlur={() => touched.touch("email")} error={shown("email")} disabled={codeSent} />
            {codeSent && <CodeField email={email} value={code} onChange={setCode} onBlur={() => touched.touch("code")} error={shown("code")} />}
            {error && <Notice tone="danger">{error}</Notice>}
            <Button size="lg" block loading={busy} loadingText={codeSent ? "Checking…" : "Sending…"}>{codeSent ? "Sign in" : "Email me a code"}</Button>
            {codeSent && <div className="flex flex-wrap justify-between gap-2"><Button type="button" variant="ghost" size="sm" onClick={() => { setCodeSent(false); setCode(""); setError(""); }}>Use a different email</Button><ResendButton onResend={sendCode} /></div>}
          </form>
        </TabsContent>
      </Tabs>
      <p className="text-center text-sm text-muted">New to Bayana? <Link href="/signup">Create an account</Link></p>
    </div>
  );
}
