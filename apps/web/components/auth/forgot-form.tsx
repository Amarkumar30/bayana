"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/display";
import { useToast } from "@/components/ui/toast";
import { api, humanMessage } from "@/lib/api";
import { CodeField, EmailField, PasswordField, ResendButton, codeError, emailError, passwordError, useTouched } from "./auth-fields";

/** Reset by email code. Every other signed-in device is signed out; this browser is signed in afterwards. */
export function ForgotForm() {
  const router = useRouter(); const toast = useToast();
  const [email, setEmail] = useState(""); const [code, setCode] = useState(""); const [password, setPassword] = useState("");
  const [sent, setSent] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const touched = useTouched();
  const errors = { email: emailError(email), code: codeError(code), password: passwordError(password) };
  const shown = (name: keyof typeof errors) => touched.show(name) ? errors[name] : undefined;
  const run = async (action: () => Promise<unknown>) => { setBusy(true); setError(""); try { await action(); return true; } catch (failure) { setError(humanMessage(failure)); return false; } finally { setBusy(false); } };
  const sendCode = () => run(() => api("/v1/auth/otp/request", { body: { email, purpose: "reset" } }));

  const submit = async (event: FormEvent) => {
    event.preventDefault(); touched.submitAll();
    if (!sent) { if (errors.email) return; if (await sendCode()) { setSent(true); touched.reset(); } return; }
    if (errors.code || errors.password) return;
    if (await run(() => api("/v1/auth/password/reset", { body: { email, code, newPassword: password } }))) { toast({ title: "Password updated", description: "You've been signed out everywhere else.", tone: "success" }); router.push("/dashboard"); }
  };

  return (
    <div className="grid gap-6">
      <div className="grid gap-1"><h1 className="text-2xl">Reset your password</h1><p className="text-sm text-muted">{sent ? "If an account uses this email, we've sent it a code." : "Enter your email and we'll send a code to reset your password."}</p></div>
      <form onSubmit={submit} noValidate className="grid gap-4">
        <EmailField value={email} onChange={setEmail} onBlur={() => touched.touch("email")} error={shown("email")} disabled={sent} />
        {sent && <>
          <CodeField email={email} value={code} onChange={setCode} onBlur={() => touched.touch("code")} error={shown("code")} />
          <PasswordField label="New password" hint="At least 10 characters. You'll be signed out on other devices." autoComplete="new-password" value={password} onChange={setPassword} onBlur={() => touched.touch("password")} error={shown("password")} />
        </>}
        {error && <Notice tone="danger">{error}</Notice>}
        <Button size="lg" block loading={busy} loadingText={sent ? "Saving…" : "Sending…"}>{sent ? "Set new password" : "Email me a code"}</Button>
        {sent && <div className="flex justify-end"><ResendButton onResend={sendCode} /></div>}
      </form>
      <p className="text-center text-sm text-muted">Remembered it? <Link href="/login">Sign in</Link></p>
    </div>
  );
}
