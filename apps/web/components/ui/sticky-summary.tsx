import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * What is being booked and what it costs, kept in view while the customer works through the steps. On a phone it sticks to
 * the bottom of the screen; from the sm breakpoint up it sits in the page above the step. Put it after the step's content so
 * it never covers the last button once the page is scrolled to the end.
 */
export function StickySummary({ title, detail, children, className }: { title: ReactNode; detail?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <aside aria-label="Your booking" data-testid="booking-summary" className={cn("sticky bottom-0 z-10 -mx-4 grid gap-0.5 border-t border-border bg-surface px-4 py-3 text-sm shadow-soft sm:static sm:mx-0 sm:rounded-input sm:border-0 sm:bg-surface-muted sm:shadow-none", className)}>
      <p className="min-w-0 break-words"><strong className="font-semibold">{title}</strong>{detail && <span className="text-muted"> · {detail}</span>}</p>
      {children && <p className="min-w-0 break-words tabular-nums">{children}</p>}
    </aside>
  );
}
