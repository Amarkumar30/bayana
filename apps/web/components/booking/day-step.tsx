"use client";
import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { advancePaise, dailyTotalPaise, dayRangeLabel, formatINR } from "@bayana/shared";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/display";
import { DatePicker, shiftMonth } from "@/components/ui/date-picker";
import { localDateKey } from "@/components/booking/time";
import { api, humanMessage } from "@/lib/api";
import type { PublicService, PublicVendor } from "@/lib/public-vendor";
import { cn } from "@/lib/utils";
import { dayChoices, dayLegend, dayReason, type DayInfo } from "./days";

/** What a daily booking will cost: total = price per day x days (integer paise) and the advance by the service's rule. */
export function dailyQuote(service: Pick<PublicService, "price_paise" | "advance_type" | "advance_value">, days: number) {
  const total = dailyTotalPaise(Number(service.price_paise), days);
  return { total, advance: advancePaise(total, service.advance_type, service.advance_value) };
}

type Props = { vendor: PublicVendor; service: PublicService; version: number; date: string; days: number; onDate: (date: string) => void; onDays: (days: number) => void; onBack: () => void; onNext: () => void };

/** Daily services: a month calendar for the start date, then a number of days limited to what is actually free. No time slots. */
export function DayStep({ vendor, service, version, date, days, onDate, onDays, onBack, onNext }: Props) {
  const thisMonth = localDateKey(new Date(), vendor.timezone).slice(0, 7);
  const [month, setMonth] = useState(date ? date.slice(0, 7) : thisMonth);
  const [byDate, setByDate] = useState<Record<string, DayInfo>>({}); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  const minDays = service.min_days ?? 1;

  // Each month is asked for fresh (the API never caches day status), and again after a booking attempt bumps `version`.
  useEffect(() => {
    let current = true; setLoading(true); setError("");
    api<{ days: DayInfo[] }>(`/v1/vendors/${vendor.slug}/availability/days?service_id=${service.id}&month=${month}`)
      .then(result => { if (current) setByDate(previous => ({ ...previous, ...Object.fromEntries(result.days.map(day => [day.date, day])) })); })
      .catch(failure => { if (current) setError(humanMessage(failure)); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [vendor.slug, service.id, month, version]);

  const choices = dayChoices(byDate[date], minDays);
  // A start date whose free run got shorter (or vanished) cannot keep a longer choice.
  useEffect(() => { if (date && days && !choices.includes(days)) onDays(choices[0] ?? 0); }, [date, days, choices.join(",")]);
  const quote = date && days ? dailyQuote(service, days) : null;

  if (error) return <Notice tone="danger">{error}</Notice>;
  return (
    <section aria-labelledby="choose-dates" className="grid gap-4">
      <h2 id="choose-dates" className="text-lg">Choose your dates</h2>
      <p className="text-sm text-muted">Pick the first day, then how many days you need. {minDays > 1 ? `This service is booked for at least ${minDays} days. ` : ""}Days are whole days in {vendor.timezone}.</p>
      <DatePicker month={month} onMonthChange={next => setMonth(next < thisMonth ? thisMonth : next)} value={date} onSelect={value => { onDate(value); onDays(dayChoices(byDate[value], minDays)[0] ?? 0); }}
        disabledReason={value => dayReason(byDate[value], minDays)} loading={loading} label="Choose the first day" />
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted" aria-label="Why some dates cannot be chosen">
        <li className="inline-flex items-center gap-1.5"><span className="inline-block size-3 rounded-sm bg-primary-soft" aria-hidden />Free</li>
        {dayLegend.map(item => <li key={item.status} className="inline-flex items-center gap-1.5"><span className="inline-block size-3 rounded-sm ring-1 ring-border" aria-hidden /><span className="line-through decoration-muted/40">{item.label}</span></li>)}
      </ul>
      {month === thisMonth && !loading && !Object.values(byDate).some(day => day.date.startsWith(month) && !dayReason(day, minDays)) && <p className="text-sm text-muted">No free dates left this month. <button type="button" className="font-medium text-primary underline" onClick={() => setMonth(shiftMonth(month, 1))}>See next month</button></p>}
      {date && choices.length > 0 && (
        <fieldset className="grid gap-2" aria-live="polite">
          <legend className="text-sm font-semibold">How many days, from {dayRangeLabel(date, 1).replace(" (1 day)", "")}?</legend>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Number of days">
            {choices.map(count => (
              <button key={count} type="button" role="radio" aria-checked={days === count} onClick={() => onDays(count)}
                className={cn("min-h-11 min-w-14 rounded-input px-3 text-sm font-medium ring-1 transition-colors", days === count ? "bg-primary text-primary-foreground ring-primary" : "bg-surface text-ink ring-border hover:ring-primary")}>
                {count} {count === 1 ? "day" : "days"}
              </button>
            ))}
          </div>
        </fieldset>
      )}
      {quote && <p className="rounded-input bg-surface-muted px-4 py-3 text-sm" data-testid="day-summary"><strong>{dayRangeLabel(date, days)}</strong> · Total {formatINR(quote.total)}{quote.advance > 0 ? ` · Advance ${formatINR(quote.advance)} now` : ""}</p>}
      <div className="flex flex-wrap gap-2"><Button variant="ghost" onClick={onBack}><ArrowLeft aria-hidden />Service</Button><Button className="flex-1" size="lg" disabled={!quote} title={!quote ? "Choose the dates to continue" : undefined} onClick={onNext}>Continue</Button></div>
    </section>
  );
}
