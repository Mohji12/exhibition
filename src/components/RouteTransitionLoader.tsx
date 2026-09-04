import { useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/** Top progress bar + delayed overlay while TanStack Router is navigating. */
export function RouteTransitionLoader({
  className,
  overlay = true,
}: {
  className?: string;
  overlay?: boolean;
}) {
  const busy = useRouterState({
    select: (s) => s.isLoading || s.isTransitioning,
  });
  const [showOverlay, setShowOverlay] = useState(false);

  useEffect(() => {
    if (!busy) {
      setShowOverlay(false);
      return;
    }
    const t = window.setTimeout(() => setShowOverlay(true), 120);
    return () => window.clearTimeout(t);
  }, [busy]);

  if (!busy) return null;

  return (
    <>
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
      {overlay && showOverlay ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-background/55 backdrop-blur-[1px]">
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card px-6 py-5 shadow-float">
            <Loader2 className="size-7 animate-spin text-primary" aria-hidden />
            <p className="text-sm font-medium text-muted-foreground">Loading…</p>
          </div>
        </div>
      ) : null}
    </>
  );
}
