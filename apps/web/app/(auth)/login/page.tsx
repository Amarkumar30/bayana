import { Suspense } from "react";
import { LoginForm } from "@/components/auth/login-form";
import { Skeleton } from "@/components/ui/display";

export const metadata = { title: "Sign in | Bayana", robots: { index: false, follow: false } };
export default function Page() {
  return <Suspense fallback={<div role="status" className="grid gap-4"><span className="sr-only">Loading…</span><Skeleton className="h-8 w-48" /><Skeleton className="h-11" /><Skeleton className="h-12" /></div>}><LoginForm /></Suspense>;
}
