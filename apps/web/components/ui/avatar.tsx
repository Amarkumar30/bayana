"use client";
import * as AvatarPrimitive from "@radix-ui/react-avatar";
import { cn } from "@/lib/utils";

export const initials = (name: string) => name.split(/\s+/).filter(Boolean).map(part => part[0]).join("").slice(0, 2).toUpperCase();
const sizes = { sm: "size-8 text-xs", md: "size-11 text-sm", lg: "size-16 text-lg" };

/** Image when available, otherwise initials. The name is always the accessible label. */
export function Avatar({ name, src, size = "md", className }: { name: string; src?: string; size?: keyof typeof sizes; className?: string }) {
  return (
    <AvatarPrimitive.Root className={cn("inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-soft font-semibold text-primary", sizes[size], className)}>
      {src && <AvatarPrimitive.Image src={src} alt={name} className="size-full object-cover" />}
      <AvatarPrimitive.Fallback delayMs={src ? 300 : 0} aria-label={name} role="img">{initials(name)}</AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
}
