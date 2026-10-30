"use client";
import { useCallback, useEffect, useState } from "react";
import { googleCustomerNextPath, googleNextPath, type GoogleIntent } from "@bayana/shared";
import { env } from "@/env";
import { buttonVariants } from "@/components/ui/button";
import { LoadingState, Skeleton } from "@/components/ui/display";
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

/**
 * Whether the API has Google sign-in on (GET /v1/auth/providers), shared by every button on the page. Only a real answer is
 * kept: a failed or timed-out call (a sleeping API, a network blip, a blocked request) is "error", never "off", so the button
 * stays visible with a way to check again instead of disappearing for good.
 */
export type GoogleStatus = "loading" | "on" | "off" | "error";
let known: "on" | "off" | undefined;
let inflight: Promise<"on" | "off" | "error"> | null = null;
const listeners = new Set<(status: GoogleStatus) => void>();
const announce = (status: GoogleStatus) => { for (const listener of listeners) listener(status); };
function checkProviders() {
  inflight ??= api<{ google: boolean }>("/v1/auth/providers")
    .then(value => { known = value.google ? "on" : "off"; return known; })
    .catch(() => "error" as const)
    .finally(() => { inflight = null; });
  return inflight;
}
export function useGoogleStatus() {
  const [status, setStatus] = useState<GoogleStatus>(known ?? "loading");
  useEffect(() => {
    listeners.add(setStatus);
    if (!known) void checkProviders().then(announce);
    return () => { listeners.delete(setStatus); };
  }, []);
  const retry = useCallback(() => { announce("loading"); void checkProviders().then(announce); }, []);
  return { status, retry };
}
/** Unknown while loading; true when the button shows (on, or the check failed and it shows with a retry); false when off. */
export function useGoogleEnabled() {
  const { status } = useGoogleStatus();
  return status === "loading" ? undefined : status !== "off";
}

/**
 * A full-page navigation to the API, which redirects to Google. vendor (default): the API accepts return paths from the shared
 * allowlist only. customer: the return path is a booking page (/<slug>/book?...), validated the same way on both sides.
 */
export const googleStartUrl = (next?: string | null, mode?: "link", intent: GoogleIntent = "vendor") => {
  const safe = intent === "customer" ? googleCustomerNextPath(next) : googleNextPath(next);
  const params = new URLSearchParams({ ...(intent === "customer" ? { intent } : {}), ...(safe ? { next: safe } : {}), ...(mode ? { mode } : {}) });
  return `${env.NEXT_PUBLIC_API_URL}/v1/auth/google/start${params.size ? `?${params}` : ""}`;
};

/**
 * "Continue with Google". Hidden only when the API says Google is off. If the check failed, the button still shows (it is a
 * plain navigation, which works even when the check could not reach the API) with a link to check again.
 */
export function GoogleButton({ next, label = "Continue with Google", intent = "vendor", onLeave }: { next?: string | null; label?: string; intent?: GoogleIntent; onLeave?: () => void }) {
  const { status, retry } = useGoogleStatus();
  if (status === "loading") return <LoadingState label="Checking Google sign-in…"><Skeleton className="h-12 w-full" /></LoadingState>;
  if (status === "off") return null;
  return (
    <div className="grid gap-1.5">
      <a href={googleStartUrl(next, undefined, intent)} onClick={onLeave} className={cn(buttonVariants({ variant: "secondary", size: "lg", block: true }), "gap-3")}><GoogleMark />{label}</a>
      {status === "error" && <p className="text-center text-xs text-muted" role="status">We couldn&apos;t check Google sign-in just now. <button type="button" onClick={retry} className="min-h-11 font-medium text-primary underline">Check again</button></p>}
    </div>
  );
}
