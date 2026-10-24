import Link from "next/link";
import { cn } from "@/lib/utils";

export function Brand({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <Link href="/" className={cn("inline-flex min-h-11 items-center gap-2 text-ink no-underline", className)} aria-label="Bayana home">
      <svg viewBox="0 0 32 32" className="size-8 shrink-0" aria-hidden><rect width="32" height="32" rx="9" fill="var(--primary)" /><path d="M10 8h7.2c3.4 0 5.3 1.7 5.3 4.2 0 1.7-1 3-2.5 3.5 2 .5 3.3 2 3.3 4 0 2.9-2.2 4.8-5.8 4.8H10V8Zm4 6.6h2.6c1.3 0 2-.6 2-1.6s-.7-1.6-2-1.6H14v3.2Zm0 6.6h3.1c1.4 0 2.2-.7 2.2-1.8s-.8-1.8-2.2-1.8H14v3.6Z" fill="var(--primary-foreground)" /><circle cx="24.5" cy="8.5" r="2.5" fill="var(--accent)" /></svg>
      {!compact && <span className="text-lg font-semibold tracking-tight">Bayana</span>}
    </Link>
  );
}

export function PageHeader({ eyebrow, title, description, actions, className }: { eyebrow?: string; title: string; description?: React.ReactNode; actions?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("mb-6 flex flex-wrap items-end justify-between gap-4", className)}>
      <div className="grid gap-1">
        {eyebrow && <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">{eyebrow}</p>}
        <h1 className="text-2xl sm:text-4xl">{title}</h1>
        {description && <p className="max-w-2xl text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
