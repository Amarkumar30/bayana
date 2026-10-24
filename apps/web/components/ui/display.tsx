import { formatINR } from "@bayana/shared";
import type { HTMLAttributes, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) { return <div className={cn("rounded-card bg-surface p-5 shadow-soft ring-1 ring-border/70 sm:p-6", className)} {...props} />; }
export function CardHeader({ title, description, action, className }: { title: ReactNode; description?: ReactNode; action?: ReactNode; className?: string }) {
  return <div className={cn("mb-4 flex flex-wrap items-start justify-between gap-3", className)}><div className="grid gap-1"><h2 className="text-lg font-semibold">{title}</h2>{description && <p className="text-sm text-muted">{description}</p>}</div>{action}</div>;
}

export type BookingStatus = "held" | "pending" | "confirmed" | "completed" | "cancelled" | "expired" | "expired_paid";
const statusStyles: Record<BookingStatus, { label: string; className: string }> = {
  held: { label: "Held", className: "bg-warning-soft text-warning" },
  pending: { label: "Pending", className: "bg-primary-soft text-primary" },
  confirmed: { label: "Confirmed", className: "bg-success-soft text-success" },
  completed: { label: "Completed", className: "bg-surface-muted text-ink" },
  cancelled: { label: "Cancelled", className: "bg-danger-soft text-danger" },
  expired: { label: "Expired", className: "bg-surface-muted text-muted" },
  expired_paid: { label: "Expired, paid", className: "bg-danger-soft text-danger" }
};
const tones = { neutral: "bg-surface-muted text-ink", primary: "bg-primary-soft text-primary", accent: "bg-accent-soft text-accent-ink", success: "bg-success-soft text-success", warning: "bg-warning-soft text-warning", danger: "bg-danger-soft text-danger" };
export function Badge({ tone = "neutral", className, children }: { tone?: keyof typeof tones; className?: string; children: ReactNode }) {
  return <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold", tones[tone], className)}>{children}</span>;
}
/** Status is shown as a dot plus text, never colour alone. Unknown statuses fall back to the raw label. */
export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const key = status.toLowerCase() as BookingStatus; const style = statusStyles[key];
  return <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold", style?.className ?? tones.neutral, className)}><span aria-hidden className="size-1.5 rounded-full bg-current" />{style?.label ?? status}</span>;
}

/** Paise in, INR out. Integer paise only; the formatting itself lives in @bayana/shared. */
export function Money({ paise, className, size = "base" }: { paise: number | string; className?: string; size?: "sm" | "base" | "lg" | "xl" }) {
  const sizes = { sm: "text-sm", base: "text-base", lg: "text-lg font-semibold", xl: "text-2xl font-semibold" };
  return <span className={cn("tabular-nums", sizes[size], className)}>{formatINR(Number(paise))}</span>;
}

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) { return <div aria-hidden className={cn("animate-pulse rounded-input bg-surface-muted", className)} {...props} />; }
/** A labelled loading region: visual skeletons plus one status message for assistive tech. */
export function LoadingState({ label, children, className }: { label: string; children: ReactNode; className?: string }) { return <div role="status" aria-live="polite" className={className}><span className="sr-only">{label}</span>{children}</div>; }

export function EmptyState({ icon, title, description, action, className }: { icon?: ReactNode; title: ReactNode; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center gap-3 rounded-card border border-dashed border-border bg-surface px-6 py-10 text-center", className)}>
      {icon && <div className="flex size-12 items-center justify-center rounded-full bg-primary-soft text-primary [&_svg]:size-6" aria-hidden>{icon}</div>}
      <h3 className="text-lg font-semibold">{title}</h3>
      {description && <p className="max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Table({ className, ...props }: HTMLAttributes<HTMLTableElement>) { return <div className="w-full overflow-x-auto rounded-card ring-1 ring-border"><table className={cn("w-full border-collapse bg-surface text-sm", className)} {...props} /></div>; }
export function Th({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) { return <th scope="col" className={cn("bg-surface-muted px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted", className)} {...props} />; }
export function Td({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) { return <td className={cn("border-t border-border px-4 py-3 align-middle", className)} {...props} />; }

export function Stepper({ steps, current, className }: { steps: string[]; current: number; className?: string }) {
  return (
    <ol className={cn("flex items-center gap-2", className)} aria-label="Progress">
      {steps.map((step, index) => { const state = index < current ? "complete" : index === current ? "current" : "upcoming"; return (
        <li key={step} className="flex flex-1 items-center gap-2" aria-current={state === "current" ? "step" : undefined}>
          <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold", state === "complete" && "bg-primary text-primary-foreground", state === "current" && "bg-primary-soft text-primary ring-2 ring-primary", state === "upcoming" && "bg-surface-muted text-muted")}>{state === "complete" ? "✓" : index + 1}</span>
          <span className={cn("hidden text-sm sm:inline", state === "upcoming" ? "text-muted" : "font-medium text-ink")}>{step}<span className="sr-only">{state === "complete" ? " (done)" : state === "current" ? " (current step)" : ""}</span></span>
          {index < steps.length - 1 && <span aria-hidden className={cn("h-px flex-1", index < current ? "bg-primary" : "bg-border")} />}
        </li>
      ); })}
    </ol>
  );
}

export function Notice({ tone = "info", children, className }: { tone?: "info" | "success" | "warning" | "danger"; children: ReactNode; className?: string }) {
  const styles = { info: "bg-primary-soft text-ink", success: "bg-success-soft text-ink", warning: "bg-warning-soft text-ink", danger: "bg-danger-soft text-ink" };
  return <div role={tone === "danger" ? "alert" : "status"} className={cn("rounded-input px-4 py-3 text-sm", styles[tone], className)}>{children}</div>;
}
