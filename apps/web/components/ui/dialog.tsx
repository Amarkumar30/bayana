"use client";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "@/lib/utils";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

const overlay = "fixed inset-0 z-40 bg-[rgb(20_24_31/0.45)] backdrop-blur-[2px]";
const panel = cva("fixed z-50 flex flex-col gap-4 bg-surface p-6 text-ink shadow-raised focus-visible:outline-none", {
  variants: {
    side: {
      center: "left-1/2 top-1/2 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-card",
      right: "inset-y-0 right-0 h-dvh w-[min(22rem,88vw)] overflow-y-auto",
      left: "inset-y-0 left-0 h-dvh w-[min(22rem,88vw)] overflow-y-auto",
      bottom: "inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-card pb-[max(1.5rem,env(safe-area-inset-bottom))]"
    }
  },
  defaultVariants: { side: "center" }
});

type ContentProps = ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & VariantProps<typeof panel> & { title: ReactNode; description?: ReactNode; hideClose?: boolean };
/** Radix handles focus trapping, Escape, scroll locking and returning focus to the trigger. */
function Content({ className, side, title, description, hideClose, children, ...props }: ContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className={overlay} />
      <DialogPrimitive.Content className={cn(panel({ side }), className)} {...props}>
        <div className="flex items-start justify-between gap-4">
          <div className="grid gap-1">
            <DialogPrimitive.Title className="text-lg font-semibold">{title}</DialogPrimitive.Title>
            {description ? <DialogPrimitive.Description className="text-sm text-muted">{description}</DialogPrimitive.Description> : <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>}
          </div>
          {!hideClose && <DialogPrimitive.Close className="-m-2 inline-flex size-11 shrink-0 items-center justify-center rounded-input text-muted hover:bg-surface-muted hover:text-ink" aria-label="Close"><X className="size-5" aria-hidden /></DialogPrimitive.Close>}
        </div>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
export const DialogContent = (props: Omit<ContentProps, "side">) => <Content {...props} side="center" />;

export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;
export const SheetContent = ({ side = "right", ...props }: Omit<ContentProps, "side"> & { side?: "left" | "right" | "bottom" }) => <Content {...props} side={side} />;
