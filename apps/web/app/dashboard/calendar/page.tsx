import { CalendarDays } from "lucide-react";
import { PageHeader } from "@/components/layout/brand";
import { PreviewBanner, previewMetadata } from "@/components/layout/preview-banner";
import { previewState } from "@/components/preview/sample";
import { Button } from "@/components/ui/button";
import { Badge, Card, EmptyState, LoadingState, Skeleton } from "@/components/ui/display";
import { cn } from "@/lib/utils";

export const metadata = previewMetadata("Calendar");
type Entry = { day: number; label: string; kind: "confirmed" | "held" | "blocked" };
const entries: Entry[] = [{ day: 2, label: "10:00 Ananya", kind: "confirmed" }, { day: 2, label: "15:30 Rohit", kind: "held" }, { day: 4, label: "17:00 Fatima", kind: "confirmed" }, { day: 9, label: "Family function", kind: "blocked" }, { day: 10, label: "Family function", kind: "blocked" }, { day: 14, label: "11:00 Karthik", kind: "confirmed" }, { day: 21, label: "09:00 Meera", kind: "held" }];
const kindStyle = { confirmed: "bg-success-soft text-success", held: "bg-warning-soft text-warning", blocked: "bg-surface-muted text-muted line-through" };

export default async function CalendarPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const state = await previewState(searchParams);
  const offset = 0; // 1 November 2026 is a Sunday
  return (
    <>
      <PreviewBanner />
      <PageHeader eyebrow="Calendar" title="November 2026" description="Confirmed, held and blocked time at a glance." actions={<><Button variant="secondary" size="sm">Week</Button><Button size="sm">Block time</Button></>} />
      <div className="mb-4 flex flex-wrap gap-2" aria-label="Legend"><Badge tone="success">Confirmed</Badge><Badge tone="warning">Held</Badge><Badge>Blocked</Badge></div>
      {state === "loading" ? <LoadingState label="Loading calendar…"><Skeleton className="h-[28rem] rounded-card" /></LoadingState>
        : state === "empty" ? <EmptyState icon={<CalendarDays />} title="Nothing on your calendar yet" description="Set your weekly hours so clients can see open times." action={<Button>Set weekly hours</Button>} />
        : <Card className="p-2 sm:p-4">
          <div className="grid grid-cols-7 text-center text-xs font-semibold text-muted" aria-hidden>{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => <span key={day} className="py-2">{day}</span>)}</div>
          <ol className="grid grid-cols-7 gap-px overflow-hidden rounded-input bg-border">
            {Array.from({ length: offset }, (_, index) => <li key={`pad-${index}`} aria-hidden className="bg-surface-muted/50" />)}
            {Array.from({ length: 30 }, (_, index) => index + 1).map(day => { const items = entries.filter(entry => entry.day === day); return (
              <li key={day} className="min-h-16 bg-surface p-1 sm:min-h-24 sm:p-2" aria-label={`${day} November${items.length ? `, ${items.length} item${items.length > 1 ? "s" : ""}` : ""}`}>
                <span className={cn("text-xs tabular-nums", day === 2 ? "inline-flex size-6 items-center justify-center rounded-full bg-primary font-semibold text-primary-foreground" : "text-muted")}>{day}</span>
                <ul className="mt-1 grid gap-0.5">{items.map(item => <li key={item.label + item.kind} className={cn("truncate rounded px-1 py-0.5 text-[0.625rem] font-medium sm:text-xs", kindStyle[item.kind])}><span className="hidden sm:inline">{item.label}</span><span className="sm:hidden" aria-hidden>•</span><span className="sr-only sm:hidden">{item.label}</span></li>)}</ul>
              </li>
            ); })}
          </ol>
        </Card>}
    </>
  );
}
