import Link from "next/link";
import { PreviewBanner } from "@/components/layout/preview-banner";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

type Mode = "login" | "signup" | "forgot";
const copy: Record<Mode, { title: string; description: string; fields: { label: string; type: string; autoComplete: string; hint?: string }[]; submit: string; working: string }> = {
  login: { title: "Welcome back", description: "Sign in with your password or a one-time email code.", fields: [{ label: "Email", type: "email", autoComplete: "email" }, { label: "Password", type: "password", autoComplete: "current-password" }], submit: "Sign in", working: "/auth?next=/dashboard" },
  signup: { title: "Create your account", description: "We'll email you a code, then you'll choose a password.", fields: [{ label: "Email", type: "email", autoComplete: "email" }], submit: "Send code", working: "/auth?next=/dashboard" },
  forgot: { title: "Reset your password", description: "Enter your email and we'll send a code to reset it.", fields: [{ label: "Email", type: "email", autoComplete: "email" }], submit: "Send reset code", working: "/auth?next=/dashboard" }
};

/** Spec routes /login, /signup and /forgot. The working flow is /auth until the Auth phase moves it here. */
export function AuthPreview({ mode }: { mode: Mode }) {
  const value = copy[mode];
  return (
    <div className="grid gap-6">
      <PreviewBanner className="mb-0">Use the <Link href={value.working}>working sign-in page</Link> for now.</PreviewBanner>
      <div className="grid gap-1"><h1 className="text-2xl">{value.title}</h1><p className="text-sm text-muted">{value.description}</p></div>
      <form className="grid gap-4" action={value.working}>
        {value.fields.map(field => <Field key={field.label} label={field.label} hint={field.hint}>{p => <Input {...p} type={field.type} autoComplete={field.autoComplete} disabled />}</Field>)}
        <Button block size="lg" disabled>{value.submit}</Button>
      </form>
      <p className="text-center text-sm text-muted">{mode === "login" ? <>New to Bayana? <Link href="/signup">Create an account</Link> · <Link href="/forgot">Forgot password?</Link></> : <>Already have an account? <Link href="/login">Sign in</Link></>}</p>
    </div>
  );
}
