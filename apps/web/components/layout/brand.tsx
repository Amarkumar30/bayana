import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * The Bayana symbol (public/brand/bayana-symbol.svg): a saffron circle with an upright bar, a lower-case "b".
 * Drawn inline so the bar follows the text colour (ink on light, light on dark); the circle is always brand saffron.
 */
export function BrandMark({ className }: { className?: string }) {
  return <svg viewBox="0 20 56 80" className={cn("h-8 w-auto shrink-0", className)} aria-hidden focusable="false"><circle cx="28" cy="72" r="28" fill="var(--brand-saffron)" /><rect x="0" y="20" width="12" height="80" fill="currentColor" /></svg>;
}

export function Brand({ className, compact, prefetch }: { className?: string; compact?: boolean; prefetch?: boolean }) {
  return (
    <Link href="/" prefetch={prefetch} className={cn("inline-flex min-h-11 items-center gap-2 text-ink no-underline", className)} aria-label="Bayana home">
      <BrandMark className={compact ? "h-6" : undefined} />
      {!compact && <span className="text-xl font-semibold tracking-tight">Bayana</span>}
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
