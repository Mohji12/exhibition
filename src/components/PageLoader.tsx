import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function PageLoader({
  label = "Loading…",
  className,
  compact,
}: {
  label?: string;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex flex-col items-center justify-center gap-3 text-muted-foreground",
        compact ? "py-8" : "min-h-[40vh] py-16",
        className,
      )}
    >
      <Loader2 className="size-8 shrink-0 animate-spin text-primary" aria-hidden />
      <p className="text-sm font-medium">{label}</p>
    </div>
  );
}

export function InlineLoader({ className }: { className?: string }) {
  return <Loader2 className={cn("size-4 animate-spin text-primary", className)} aria-hidden />;
}
