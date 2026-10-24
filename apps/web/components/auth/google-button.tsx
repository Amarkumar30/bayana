"use client";
import { useEffect, useState } from "react";
import { googleNextPath } from "@bayana/shared";
import { env } from "@/env";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/display";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

/** Google's "G" mark in its own colours (brand guidelines ask for the multicolour mark on a light button). */
const GoogleMark = () => (
  <svg viewBox="0 0 18 18" aria-hidden className="size-4.5 shrink-0">
    <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92a8.78 8.78 0 0 0 2.68-6.62Z" />
    <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z" />
    <path fill="#FBBC05" d="M3.97 10.72a5.41 5.41 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z" />
    <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z" />
  </svg>
);

let cached: boolean | undefined;
/** Whether the API has Google sign-in configured (GET /v1/auth/providers). Unknown while loading; off if the call fails. */
export function useGoogleEnabled() {
  const [enabled, setEnabled] = useState<boolean | undefined>(cached);
  useEffect(() => {
    if (cached !== undefined) return;
    api<{ google: boolean }>("/v1/auth/providers").then(value => { cached = value.google; setEnabled(value.google); }).catch(() => setEnabled(false));
  }, []);
  return enabled;
}

/** A full-page navigation to the API, which redirects to Google; the API only accepts return paths from the shared allowlist. */
export const googleStartUrl = (next?: string | null, mode?: "link") => {
  const params = new URLSearchParams({ ...(googleNextPath(next) ? { next: next! } : {}), ...(mode ? { mode } : {}) });
  return `${env.NEXT_PUBLIC_API_URL}/v1/auth/google/start${params.size ? `?${params}` : ""}`;
};

/** "Continue with Google", shown only when the API has it switched on. */
export function GoogleButton({ next, label = "Continue with Google" }: { next?: string | null; label?: string }) {
  const enabled = useGoogleEnabled();
  if (enabled === undefined) return <Skeleton className="h-12 w-full" />;
  if (!enabled) return null;
  return <a href={googleStartUrl(next)} className={cn(buttonVariants({ variant: "secondary", size: "lg", block: true }), "gap-3")}><GoogleMark />{label}</a>;
}
