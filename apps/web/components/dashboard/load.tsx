"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, Notice } from "@/components/ui/display";
import { ApiError, api, humanMessage } from "@/lib/api";

export type Loaded<T> = { kind: "loading" } | { kind: "signed-out" } | { kind: "no-profile" } | { kind: "error"; message: string } | { kind: "ready"; data: T };

/** Loads one dashboard endpoint and maps failures to the states every dashboard screen shows (AGENTS.md 8). */
/** A null path waits (state stays loading), for example until a client-only value is known after mount. */
export function useVendorData<T>(path: string | null, fetcher?: () => Promise<T>) {
  const [state, setState] = useState<Loaded<T>>({ kind: "loading" });
  // A custom fetcher (several endpoints at once) is keyed by `path`, so a new function identity does not reload.
  const fetcherRef = useRef(fetcher); fetcherRef.current = fetcher;
  const load = useCallback(async () => {
    if (path === null) return;
    try { setState({ kind: "ready", data: await (fetcherRef.current ? fetcherRef.current() : api<T>(path)) }); }
    catch (failure) { setState(failure instanceof ApiError && failure.status === 401 ? { kind: "signed-out" } : failure instanceof ApiError && failure.code === "PROFILE_NOT_FOUND" ? { kind: "no-profile" } : { kind: "error", message: humanMessage(failure) }); }
  }, [path]);
  useEffect(() => { void load(); }, [load]);
  return [state, load] as const;
}

/** Skeleton while loading, the sign-in and set-up prompts, an error with a retry, else the content. */
export function Gate<T>({ state, skeleton, retry, next, children }: { state: Loaded<T>; skeleton: ReactNode; retry: () => void; next: string; children: (data: T) => ReactNode }) {
  if (state.kind === "loading") return <>{skeleton}</>;
  if (state.kind === "signed-out") return <EmptyState className="mx-auto max-w-xl" title="Sign in to manage your business" description="Your dashboard is private. Sign in with your password or an email code." action={<div className="flex flex-wrap justify-center gap-2"><Button asChild><Link href={`/login?next=${encodeURIComponent(next)}`}>Sign in</Link></Button><Button asChild variant="secondary"><Link href="/signup">Create an account</Link></Button></div>} />;
  if (state.kind === "no-profile") return <EmptyState className="mx-auto max-w-xl" icon={<Rocket />} title="Let's set up your booking page" description="Four short steps: your business, a first service, your hours, then publish." action={<Button asChild><Link href="/onboarding">Start setup</Link></Button>} />;
  if (state.kind === "error") return <div className="grid gap-3"><Notice tone="danger">{state.message}</Notice><Button variant="secondary" className="w-fit" onClick={retry}>Try again</Button></div>;
  return <>{children(state.data)}</>;
}
