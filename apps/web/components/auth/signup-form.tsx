"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Notice, Stepper } from "@/components/ui/display";
import { api, humanMessage } from "@/lib/api";
import { CodeField, EmailField, PasswordField, ResendButton, codeError, emailError, passwordError, useTouched } from "./auth-fields";

/** Two steps: email, then code and password together. The account is created only when both are accepted. */
export function SignupForm() {
  const router = useRouter();
  const [email, setEmail] = useState(""); const [code, setCode] = useState(""); const [password, setPassword] = useState("");
  const [step, setStep] = useState<0 | 1>(0); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const touched = useTouched();
  const errors = { email: emailError(email), code: codeError(code), password: passwordError(password) };
  const shown = (name: keyof typeof errors) => touched.show(name) ? errors[name] : undefined;
  const run = async (action: () => Promise<unknown>) => { setBusy(true); setError(""); try { await action(); return true; } catch (failure) { setError(humanMessage(failure)); return false; } finally { setBusy(false); } };
  const sendCode = () => run(() => api("/v1/auth/otp/request", { body: { email, purpose: "signup" } }));

  const submit = async (event: FormEvent) => {
    event.preventDefault(); touched.submitAll();
    if (step === 0) { if (errors.email) return; if (await sendCode()) { setStep(1); touched.reset(); } return; }
    if (errors.code || errors.password) return;
    if (await run(() => api("/v1/auth/signup", { body: { email, code, password } }))) router.push("/dashboard");
  };

  return (
    <div className="grid gap-6">
      <Stepper steps={["Your email", "Code and password"]} current={step} />
      <div className="grid gap-1"><h1 className="text-2xl">{step === 0 ? "Create your account" : "Check your email"}</h1><p className="text-sm text-muted">{step === 0 ? "We'll email you a six-digit code to confirm it's you." : "Enter the code and choose a password. Your account is created when both are accepted."}</p></div>
      <form onSubmit={submit} noValidate className="grid gap-4">
        <EmailField value={email} onChange={setEmail} onBlur={() => touched.touch("email")} error={shown("email")} disabled={step === 1} />
        {step === 1 && <>
          <CodeField email={email} value={code} onChange={setCode} onBlur={() => touched.touch("code")} error={shown("code")} />
          <PasswordField label="Choose a password" hint="At least 10 characters. Avoid common passwords." autoComplete="new-password" value={password} onChange={setPassword} onBlur={() => touched.touch("password")} error={shown("password")} />
        </>}
        {error && <Notice tone="danger">{error}</Notice>}
        <Button size="lg" block loading={busy} loadingText={step === 0 ? "Sending…" : "Creating your account…"}>{step === 0 ? "Email me a code" : "Create account"}</Button>
        {step === 1 && <div className="flex flex-wrap justify-between gap-2"><Button type="button" variant="ghost" size="sm" onClick={() => { setStep(0); setCode(""); setError(""); }}>Change email</Button><ResendButton onResend={sendCode} /></div>}
      </form>
      <p className="text-center text-sm text-muted">Already have an account? <Link href="/login">Sign in</Link></p>
    </div>
  );
}
