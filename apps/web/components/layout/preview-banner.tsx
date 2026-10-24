import type { Metadata } from "next";
import { Construction } from "lucide-react";
import { cn } from "@/lib/utils";

/** Pages that show placeholder content until their phase wires them to the API. They are never indexed. */
export const previewMetadata = (title: string): Metadata => ({ title: `${title} (preview) | Bayana`, robots: { index: false, follow: false } });

export function PreviewBanner({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <div role="note" className={cn("mb-6 flex items-start gap-3 rounded-card bg-accent-soft px-4 py-3 text-sm text-ink ring-1 ring-accent/30", className)}>
      <Construction className="mt-0.5 size-4 shrink-0 text-accent-ink" aria-hidden />
      <p><strong className="font-semibold">Preview: not connected yet.</strong> {children ?? "This page shows sample content so the layout can be reviewed. Nothing here is real booking or payment data."}</p>
    </div>
  );
}
