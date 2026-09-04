import { useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

/** Lightweight top progress bar only — avoids transition/render feedback loops. */
export function RouteTransitionLoader({ className }: { className?: string; overlay?: boolean }) {
  const busy = useRouterState({
    select: (s) => Boolean(s.isLoading || s.isTransitioning),
  });

  if (!busy) return null;

  return (
    <div
      role="progressbar"
      aria-label="Loading page"
      aria-busy="true"
      className={cn(
        "pointer-events-none fixed inset-x-0 top-0 z-[100] h-1 overflow-hidden bg-primary/20",
        className,
      )}
    >
      <div className="h-full w-full animate-pulse bg-primary" />
    </div>
  );
}
