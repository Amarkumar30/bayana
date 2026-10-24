"use client";
import { Timer } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const remaining = (until: string) => Math.max(0, Math.floor((new Date(until).getTime() - Date.now()) / 1000));
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

/** The hold countdown. Calls onExpire once when it reaches zero; screen readers hear it each minute, not each second. */
export function HoldCountdown({ until, onExpire, className }: { until: string; onExpire?: () => void; className?: string }) {
  const [seconds, setSeconds] = useState(() => remaining(until));
  useEffect(() => {
    setSeconds(remaining(until));
    const timer = setInterval(() => { const left = remaining(until); setSeconds(left); if (left === 0) { clearInterval(timer); onExpire?.(); } }, 1000);
    return () => clearInterval(timer);
  }, [until, onExpire]);
  const urgent = seconds < 120;
  return (
    <p className={cn("flex items-center gap-2 rounded-input px-3 py-2 text-sm", urgent ? "bg-warning-soft text-ink" : "bg-primary-soft text-ink", className)} data-testid="hold-countdown">
      <Timer className="size-4 shrink-0" aria-hidden />
      <span>Your time is held for <strong className="tabular-nums">{clock(seconds)}</strong><span className="sr-only" aria-live="polite">{seconds % 60 === 0 ? ` ${Math.round(seconds / 60)} minutes left` : ""}</span></span>
    </p>
  );
}
