import { Link, useRouterState } from "@tanstack/react-router";
import { CreditCard, LayoutList, CalendarDays, ScanLine, UserRound, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import { PageLoader } from "@/components/PageLoader";
import { useAuth } from "@/lib/auth";
import { initials } from "@/lib/auth-session";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

const TABS = [
  { to: "/capture", label: "Capture", icon: ScanLine },
  { to: "/leads", label: "Leads", icon: LayoutList },
  { to: "/schedule", label: "Schedule", icon: CalendarDays },
  { to: "/card", label: "Card", icon: CreditCard },
  { to: "/profile", label: "Profile", icon: UserRound },
] as const;

export function SyncPill() {
  const { pendingSync, syncing, syncAll } = useStore();

  if (pendingSync === 0 && !syncing) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent">
        <span className="size-1.5 rounded-full bg-accent" />
        All synced
      </span>
    );
  }

  return (
    <button
      onClick={() => void syncAll()}
      disabled={syncing || pendingSync === 0}
      className="inline-flex items-center gap-1.5 rounded-full bg-warning-soft px-2.5 py-1 text-xs font-medium text-warning-foreground disabled:opacity-70"
    >
      <RefreshCw className={cn("size-3", syncing && "animate-spin")} />
      {syncing ? "Syncing…" : `${pendingSync} pending sync`}
    </button>
  );
}

export function AppShell({
  title,
  subtitle,
  children,
  action,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  const { session } = useAuth();
  const { seedSource } = useStore();
  const navigating = useRouterState({ select: (s) => s.isLoading || s.isTransitioning });
  const letters = session?.user ? initials(session.user.name) : "";
  const booting = seedSource === "loading";

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex min-h-screen w-full max-w-[430px] flex-col bg-background shadow-card sm:my-6 sm:min-h-[calc(100vh-3rem)] sm:rounded-3xl sm:border sm:border-border sm:overflow-hidden">
        <header className="sticky top-0 z-20 bg-[image:var(--gradient-brand)] px-5 pb-5 pt-6 text-primary-foreground">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-primary-foreground/70">
                {session?.user.eventName?.trim()
                  ? `FUNNEL · ${session.user.eventName.trim()}`
                  : "FUNNEL"}
              </p>
              <h1 className="mt-0.5 text-xl font-semibold">{title}</h1>
              {subtitle ? (
                <p className="mt-0.5 text-xs text-primary-foreground/80">{subtitle}</p>
              ) : null}
            </div>
            <div className="flex flex-col items-end gap-2">
              {letters ? (
                <div className="grid size-8 place-items-center rounded-full bg-card/15 text-[11px] font-semibold">
                  {letters}
                </div>
              ) : null}
              <div className="rounded-full bg-card/95 p-0.5">
                <SyncPill />
              </div>
              {action}
            </div>
          </div>
        </header>

        <main className="relative flex-1 px-4 pb-28 pt-4">
          {booting ? (
            <PageLoader label="Loading your booth data…" />
          ) : (
            <>
              {navigating ? (
                <div className="pointer-events-none absolute inset-x-0 top-4 z-10 flex justify-center">
                  <div className="rounded-xl border border-border bg-card/95 px-4 py-2 shadow-card backdrop-blur">
                    <PageLoader label="Loading…" compact className="py-1" />
                  </div>
                </div>
              ) : null}
              {session?.user.role === "Rep" &&
              !(
                session.user.company?.trim() &&
                session.user.mobile?.trim() &&
                session.user.eventName?.trim()
              ) ? (
                <Link
                  to="/profile"
                  className="mb-4 block rounded-xl border border-primary/20 bg-primary-soft px-4 py-3 text-sm text-primary"
                >
                  <span className="font-semibold">Complete your booth profile</span>
                  <span className="mt-0.5 block text-xs text-primary/80">
                    Add exhibition name, company and mobile — or scan your visiting card on Profile.
                  </span>
                </Link>
              ) : null}
              {children}
            </>
          )}
        </main>

        <nav className="sticky bottom-0 z-20 border-t border-border bg-card/95 backdrop-blur">
          <div className="flex items-stretch justify-between px-2 py-2">
            {TABS.map(({ to, label, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                className="flex flex-1 flex-col items-center gap-1 rounded-xl px-1 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors data-[status=active]:bg-primary-soft data-[status=active]:text-primary"
                activeProps={{ className: "text-primary" }}
              >
                <Icon className={cn("size-5")} />
                {label}
              </Link>
            ))}
          </div>
        </nav>
      </div>
    </div>
  );
}
