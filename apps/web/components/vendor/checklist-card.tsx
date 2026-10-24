import Link from "next/link";
import { CheckCircle2, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/display";
import type { Checklist } from "./types";

const actions: Record<string, { href: string; label: string }> = {
  service: { href: "/dashboard/services", label: "Add a service" },
  availability: { href: "/dashboard/availability", label: "Set hours" },
  publish: { href: "/onboarding", label: "Publish" }
};

/** The three steps a new vendor sees instead of an empty dashboard (SPEC 5.6). */
export function ChecklistCard({ checklist }: { checklist: Checklist }) {
  const remaining = checklist.steps.filter(step => !step.done).length;
  return (
    <Card>
      <CardHeader title="Get your booking page live" description={remaining ? `${3 - remaining} of 3 done. Each step takes a couple of minutes.` : "All done. Your page is live."} />
      <ol className="grid gap-2">
        {checklist.steps.map((step, index) => (
          <li key={step.key} className="flex flex-wrap items-center gap-3 rounded-input bg-surface-muted px-4 py-3">
            {step.done ? <CheckCircle2 className="size-5 text-success" aria-hidden /> : <Circle className="size-5 text-muted" aria-hidden />}
            <span className={step.done ? "flex-1 text-muted line-through" : "flex-1 font-medium"}>{index + 1}. {step.label}<span className="sr-only">{step.done ? " (done)" : " (to do)"}</span></span>
            {!step.done && <Button asChild size="sm" variant={checklist.steps.findIndex(item => !item.done) === index ? "primary" : "secondary"}><Link href={actions[step.key].href}>{actions[step.key].label}</Link></Button>}
          </li>
        ))}
      </ol>
    </Card>
  );
}
