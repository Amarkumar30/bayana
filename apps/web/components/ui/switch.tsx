"use client";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import { useId, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Switch({ label, hint, className, id, ...props }: ComponentPropsWithoutRef<typeof SwitchPrimitive.Root> & { label: ReactNode; hint?: ReactNode }) {
  const generated = useId(); const switchId = id ?? generated;
  return (
    <div className={cn("flex min-h-11 items-center justify-between gap-4", className)}>
      <label htmlFor={switchId} className="text-sm text-ink">{label}{hint && <span className="block text-xs text-muted">{hint}</span>}</label>
      <SwitchPrimitive.Root id={switchId} className="relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full bg-input transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary before:absolute before:-inset-2 before:content-['']" {...props}>
        <SwitchPrimitive.Thumb className="block size-5 translate-x-1 rounded-full bg-surface shadow-soft transition-transform data-[state=checked]:translate-x-6" />
      </SwitchPrimitive.Root>
    </div>
  );
}
