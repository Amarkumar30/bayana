"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

export const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const emailError = (value: string) => !value ? "Enter your email address." : emailPattern.test(value.trim()) ? undefined : "Enter an email address like name@example.com.";
export const passwordError = (value: string) => value.length < 10 ? "Use at least 10 characters." : value.length > 128 ? "Use 128 characters or fewer." : undefined;
export const codeError = (value: string) => /^\d{6}$/.test(value) ? undefined : "Enter the six-digit code from the email.";

/** Inline validation shows only after a field has been touched or the form was submitted, never while typing the first character. */
export function useTouched() {
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  return { show: (name: string) => Boolean(touched[name] || touched.__submit), touch: (name: string) => setTouched(current => ({ ...current, [name]: true })), submitAll: () => setTouched(current => ({ ...current, __submit: true })), reset: () => setTouched({}) };
}

export function EmailField({ value, onChange, error, disabled, onBlur }: { value: string; onChange: (value: string) => void; error?: string; disabled?: boolean; onBlur?: () => void }) {
  return <Field label="Email" error={error}>{props => <Input {...props} name="email" type="email" inputMode="email" autoComplete="email" value={value} onChange={event => onChange(event.target.value)} onBlur={onBlur} disabled={disabled} required />}</Field>;
}
export function CodeField({ value, onChange, error, email, onBlur }: { value: string; onChange: (value: string) => void; error?: string; email: string; onBlur?: () => void }) {
  return <Field label="Six-digit code" hint={`Sent to ${email}. It expires in 10 minutes.`} error={error}>{props => <Input {...props} name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={value} onChange={event => onChange(event.target.value.replace(/\D/g, "").slice(0, 6))} onBlur={onBlur} required autoFocus className="text-center text-lg tracking-[0.5em] tabular-nums" />}</Field>;
}
export function PasswordField({ label, value, onChange, error, autoComplete, onBlur, hint }: { label: string; value: string; onChange: (value: string) => void; error?: string; autoComplete: "current-password" | "new-password"; onBlur?: () => void; hint?: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <Field label={label} hint={hint} error={error}>{props => (
      <div className="relative">
        <Input {...props} name="password" type={visible ? "text" : "password"} autoComplete={autoComplete} value={value} onChange={event => onChange(event.target.value)} onBlur={onBlur} required className="pr-20" />
        <button type="button" onClick={() => setVisible(current => !current)} aria-pressed={visible} className="absolute inset-y-0 right-0 min-w-16 px-3 text-sm font-medium text-primary">{visible ? "Hide" : "Show"}</button>
      </div>
    )}</Field>
  );
}

/** "Send a new code" with the server's 60 s cooldown counted down on screen. */
export function ResendButton({ onResend, startSeconds = 60 }: { onResend: () => Promise<boolean>; startSeconds?: number }) {
  const [seconds, setSeconds] = useState(startSeconds); const [busy, setBusy] = useState(false);
  useEffect(() => { if (seconds <= 0) return; const timer = setTimeout(() => setSeconds(value => value - 1), 1000); return () => clearTimeout(timer); }, [seconds]);
  return <Button type="button" variant="ghost" size="sm" disabled={seconds > 0} loading={busy} onClick={async () => { setBusy(true); const sent = await onResend(); setBusy(false); if (sent) setSeconds(startSeconds); }}>{seconds > 0 ? `Send a new code in ${seconds}s` : "Send a new code"}</Button>;
}
