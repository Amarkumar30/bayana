"use client";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRef, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";

const pad = (value: number) => String(value).padStart(2, "0");
export const monthKey = (date: Date) => `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}`;
export const shiftMonth = (month: string, by: number) => { const [year, value] = month.split("-").map(Number); return monthKey(new Date(Date.UTC(year, value - 1 + by, 1))); };
export const monthDates = (month: string) => { const [year, value] = month.split("-").map(Number); const total = new Date(Date.UTC(year, value, 0)).getUTCDate(); return Array.from({ length: total }, (_, index) => `${month}-${pad(index + 1)}`); };
const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type Props = {
  month: string; onMonthChange: (month: string) => void;
  value?: string; onSelect: (date: string) => void;
  /** Return a reason string (used as the accessible description) to disable a date, or null when it is selectable. */
  disabledReason?: (date: string) => string | null;
  loading?: boolean; label?: string; className?: string;
};

/** Month grid of dates as YYYY-MM-DD strings (no timezone math). Arrow keys move between selectable dates; Home/End jump within the week. */
export function DatePicker({ month, onMonthChange, value, onSelect, disabledReason, loading, label = "Choose a date", className }: Props) {
  const grid = useRef<HTMLDivElement>(null);
  const dates = monthDates(month);
  const offset = new Date(`${month}-01T12:00:00Z`).getUTCDay();
  const reasonFor = (date: string) => disabledReason?.(date) ?? null;
  const focusDate = (date: string) => grid.current?.querySelector<HTMLButtonElement>(`[data-date="${date}"]`)?.focus();
  const move = (event: KeyboardEvent<HTMLButtonElement>, date: string) => {
    const keys: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    const index = dates.indexOf(date); const weekday = (index + offset) % 7;
    let target = -1;
    if (event.key === "Home") target = index - weekday; else if (event.key === "End") target = index + (6 - weekday);
    else if (keys[event.key]) { for (let next = index + keys[event.key]; next >= 0 && next < dates.length; next += keys[event.key]) if (!reasonFor(dates[next])) { target = next; break; } }
    else return;
    event.preventDefault();
    if (target >= 0 && target < dates.length) focusDate(dates[target]);
  };
  const title = new Date(`${month}-01T12:00:00Z`).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
  return (
    <section aria-label={label} className={cn("rounded-card bg-surface p-4 ring-1 ring-border", className)}>
      <div className="mb-3 flex items-center justify-between">
        <button type="button" onClick={() => onMonthChange(shiftMonth(month, -1))} aria-label="Previous month" className="inline-flex size-11 items-center justify-center rounded-input text-ink hover:bg-surface-muted"><ChevronLeft className="size-5" aria-hidden /></button>
        <strong className="text-base" aria-live="polite">{title}</strong>
        <button type="button" onClick={() => onMonthChange(shiftMonth(month, 1))} aria-label="Next month" className="inline-flex size-11 items-center justify-center rounded-input text-ink hover:bg-surface-muted"><ChevronRight className="size-5" aria-hidden /></button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-muted" aria-hidden>{weekdays.map(day => <span key={day} className="py-1">{day}</span>)}</div>
      <div ref={grid} className="grid grid-cols-7 gap-1" aria-busy={loading || undefined}>
        {Array.from({ length: offset }, (_, index) => <span key={`pad-${index}`} aria-hidden />)}
        {dates.map(date => {
          const reason = reasonFor(date); const selected = value === date;
          const name = new Date(`${date}T12:00:00Z`).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
          return (
            <button key={date} type="button" data-date={date} disabled={!!reason || loading} aria-pressed={selected} aria-label={reason ? `${name}, ${reason}` : name} onKeyDown={event => move(event, date)} onClick={() => onSelect(date)}
              className={cn("flex aspect-square min-h-11 items-center justify-center rounded-input text-sm tabular-nums transition-colors",
                selected ? "bg-primary font-semibold text-primary-foreground shadow-soft" : reason ? "cursor-not-allowed text-muted/60 line-through decoration-muted/40" : "bg-primary-soft/60 font-medium text-ink hover:bg-primary-soft")}>
              {Number(date.slice(-2))}
            </button>
          );
        })}
      </div>
      {loading && <p role="status" className="mt-3 text-sm text-muted">Loading availability…</p>}
    </section>
  );
}
