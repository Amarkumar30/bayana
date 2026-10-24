import { LoadingState, Skeleton } from "@/components/ui/display";

export default function Loading() {
  return <LoadingState label="Loading…" className="grid gap-4"><Skeleton className="h-4 w-24" /><Skeleton className="h-10 w-72" /><div className="grid gap-4 sm:grid-cols-3">{[0, 1, 2].map(index => <Skeleton key={index} className="h-28 rounded-card" />)}</div><Skeleton className="h-72 rounded-card" /></LoadingState>;
}
