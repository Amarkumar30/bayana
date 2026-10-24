import { LoadingState, Skeleton } from "@/components/ui/display";

export default function Loading() {
  return (
    <LoadingState label="Loading this booking page…" className="grid gap-8">
      <div className="flex items-center gap-4"><Skeleton className="size-16 rounded-full" /><div className="grid flex-1 gap-2"><Skeleton className="h-8 w-2/3" /><Skeleton className="h-5 w-32" /></div></div>
      <Skeleton className="h-16" />
      <div className="grid gap-3">{[0, 1, 2].map(index => <Skeleton key={index} className="h-32 rounded-card" />)}</div>
    </LoadingState>
  );
}
