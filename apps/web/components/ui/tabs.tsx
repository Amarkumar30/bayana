"use client";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils";

export const Tabs = TabsPrimitive.Root;
export function TabsList({ className, ...props }: ComponentPropsWithoutRef<typeof TabsPrimitive.List>) {
  return <TabsPrimitive.List className={cn("inline-flex w-full gap-1 overflow-x-auto rounded-card bg-surface-muted p-1 sm:w-auto", className)} {...props} />;
}
export function TabsTrigger({ className, ...props }: ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>) {
  return <TabsPrimitive.Trigger className={cn("inline-flex min-h-11 flex-1 items-center justify-center whitespace-nowrap rounded-input px-4 text-sm font-medium text-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-ring data-[state=active]:bg-surface data-[state=active]:text-ink data-[state=active]:shadow-soft sm:flex-none", className)} {...props} />;
}
export function TabsContent({ className, ...props }: ComponentPropsWithoutRef<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn("mt-4 focus-visible:outline-2 focus-visible:outline-ring", className)} {...props} />;
}
