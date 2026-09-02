import { cn } from "@/lib/utils";
import type { Priority } from "@/lib/mock-data";

export const PRIORITY_META: Record<Priority, { label: string; dot: string; chip: string }> = {
  hot: { label: "Hot", dot: "bg-hot", chip: "bg-hot-soft text-hot" },
  warm: { label: "Warm", dot: "bg-warm", chip: "bg-warm-soft text-warning-foreground" },
  cold: { label: "Cold", dot: "bg-cold", chip: "bg-cold-soft text-cold" },
};

export function PriorityBadge({ priority }: { priority: Priority }) {
  const meta = PRIORITY_META[priority];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold",
        meta.chip,
      )}
    >
      <span className={cn("size-1.5 rounded-full", meta.dot)} />
      {meta.label}
    </span>
  );
}

export function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] text-secondary-foreground">
      {children}
    </span>
  );
}

export function SyncDot({ synced }: { synced: boolean }) {
  return (
    <span
      title={synced ? "Synced" : "Pending sync"}
      className={cn("size-2 rounded-full", synced ? "bg-accent" : "bg-warning")}
    />
  );
}
