import { Suspense } from "react";
import { SignupForm } from "@/components/auth/signup-form";
import { Skeleton } from "@/components/ui/display";

export const metadata = { title: "Create your account | Bayana", robots: { index: false, follow: false } };
export default function Page() {
  return <Suspense fallback={<div role="status" className="grid gap-4"><span className="sr-only">Loading…</span><Skeleton className="h-8 w-48" /><Skeleton className="h-11" /><Skeleton className="h-12" /></div>}><SignupForm /></Suspense>;
}
