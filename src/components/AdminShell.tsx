import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { CalendarRange, CalendarClock, FileChartColumn, LayoutDashboard, LayoutList, QrCode, ScanLine, Users } from "lucide-react";
import type { ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { initials } from "@/lib/auth-session";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/admin", label: "Overview", icon: LayoutDashboard, exact: true },
  { to: "/admin/invite", label: "Invite", icon: QrCode, exact: false },
  { to: "/admin/clients", label: "Exhibitors", icon: Users, exact: false },
  { to: "/admin/leads", label: "Leads", icon: LayoutList, exact: false },
  { to: "/admin/report", label: "Report", icon: FileChartColumn, exact: false },
  { to: "/admin/followups", label: "Follow-ups", icon: CalendarClock, exact: false },
  { to: "/admin/event", label: "Event", icon: CalendarRange, exact: false },
] as const;

export function AdminShell({ children }: { children: ReactNode }) {
  const { session, logout } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const user = session?.user;

  const isActive = (to: string, exact: boolean) => {
    if (exact) return pathname === "/admin" || pathname === "/admin/";
    return pathname === to || pathname.startsWith(`${to}/`);
  };

  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="bg-[image:var(--gradient-brand)] text-primary-foreground lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col">
        <div className="flex items-center justify-between px-5 py-5 lg:block">
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-primary-foreground/70">Conninter</p>
            <p className="mt-1 text-xl font-semibold tracking-tight">CONNINTER</p>
            <p className="text-xs text-primary-foreground/75">Admin · MEDICON 2026</p>
          </div>
          {user ? (
            <div className="grid size-10 place-items-center rounded-full bg-card/15 text-sm font-semibold lg:mt-6 lg:hidden">
              {initials(user.name)}
            </div>
          ) : null}
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-1 lg:flex-col lg:overflow-visible lg:px-3 lg:pb-0">
          {NAV.map(({ to, label, icon: Icon, exact }) => (
            <Link
              key={to}
              to={to}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-primary-foreground/80 transition-colors",
                isActive(to, exact) && "bg-card/15 text-primary-foreground",
              )}
            >
              <Icon className="size-4" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="hidden border-t border-primary-foreground/15 p-4 lg:block">
          {user ? (
            <p className="truncate text-sm font-medium">{user.name}</p>
          ) : null}
          <p className="truncate text-xs text-primary-foreground/70">{user?.email}</p>
          <div className="mt-3 flex flex-col gap-2">
            <Button
              variant="secondary"
              className="h-9 justify-start rounded-xl bg-card/95 text-primary hover:bg-card"
              asChild
            >
              <Link to="/capture">
                <ScanLine className="size-4" />
                Visitor book
              </Link>
            </Button>
            <Button
              variant="ghost"
              className="h-9 justify-start rounded-xl text-primary-foreground hover:bg-card/10 hover:text-primary-foreground"
              onClick={() => {
                logout();
                void navigate({ to: "/" });
              }}
            >
              Sign out
            </Button>
          </div>
        </div>
      </aside>
      <div className="flex min-h-screen flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 lg:hidden">
          <Button variant="outline" className="h-9 rounded-xl" asChild>
            <Link to="/capture">Visitor book</Link>
          </Button>
          <Button
            variant="ghost"
            className="h-9 rounded-xl"
            onClick={() => {
              logout();
              void navigate({ to: "/" });
            }}
          >
            Sign out
          </Button>
        </div>
        <main className="flex-1 px-4 py-6 sm:px-8">{children}</main>
      </div>
    </div>
  );
}

export function AdminLayout() {
  return (
    <AdminShell>
      <Outlet />
    </AdminShell>
  );
}
