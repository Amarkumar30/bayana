"use client";
import * as ToastPrimitive from "@radix-ui/react-toast";
import { CheckCircle2, AlertTriangle, Info, X } from "lucide-react";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type Tone = "info" | "success" | "danger";
type ToastItem = { id: number; title: string; description?: string; tone: Tone };
const ToastContext = createContext<(toast: Omit<ToastItem, "id" | "tone"> & { tone?: Tone }) => void>(() => undefined);
const icons = { info: Info, success: CheckCircle2, danger: AlertTriangle };
const tones = { info: "text-primary", success: "text-success", danger: "text-danger" };

/** Polite live-region toasts; errors use the assertive "foreground" type so screen readers announce them immediately. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((toast: Omit<ToastItem, "id" | "tone"> & { tone?: Tone }) => setItems(current => [...current, { id: Date.now() + Math.random(), tone: "info", ...toast }]), []);
  return (
    <ToastContext.Provider value={push}>
      <ToastPrimitive.Provider swipeDirection="down" duration={5000}>
        {children}
        {items.map(item => { const Icon = icons[item.tone]; return (
          <ToastPrimitive.Root key={item.id} type={item.tone === "danger" ? "foreground" : "background"} onOpenChange={open => { if (!open) setItems(current => current.filter(value => value.id !== item.id)); }} className="flex items-start gap-3 rounded-card bg-surface p-4 shadow-raised ring-1 ring-border data-[swipe=end]:translate-y-full">
            <Icon className={cn("mt-0.5 size-5 shrink-0", tones[item.tone])} aria-hidden />
            <div className="grid flex-1 gap-0.5"><ToastPrimitive.Title className="text-sm font-semibold">{item.title}</ToastPrimitive.Title>{item.description && <ToastPrimitive.Description className="text-sm text-muted">{item.description}</ToastPrimitive.Description>}</div>
            <ToastPrimitive.Close aria-label="Dismiss" className="-m-2 inline-flex size-11 items-center justify-center rounded-input text-muted hover:text-ink"><X className="size-4" aria-hidden /></ToastPrimitive.Close>
          </ToastPrimitive.Root>
        ); })}
        <ToastPrimitive.Viewport className="fixed inset-x-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-[60] flex flex-col gap-2 outline-none sm:inset-x-auto sm:bottom-6 sm:right-6 sm:w-96" />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  );
}
export const useToast = () => useContext(ToastContext);
