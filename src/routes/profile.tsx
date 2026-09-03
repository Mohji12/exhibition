import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { LayoutDashboard, LogOut } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "Profile — Conninter Visitor Book" },
      {
        name: "description",
        content: "Your Conninter booth account and sign-out.",
      },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const { session, logout } = useAuth();
  const navigate = useNavigate();
  const { seedSource, lastSyncError } = useStore();
  const user = session?.user;

  return (
    <AppShell title="Profile" subtitle="Your booth account">
      <section className="rounded-xl border border-border bg-card p-4 shadow-card">
        {user ? (
          <>
            <p className="text-lg font-semibold text-foreground">{user.name}</p>
            <p className="mt-0.5 text-sm text-muted-foreground">{user.email}</p>
            <span
              className={cn(
                "mt-3 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold",
                user.role === "Admin" ? "bg-accent-soft text-accent" : "bg-primary-soft text-primary",
              )}
            >
              {user.role}
            </span>
          </>
        ) : null}

        {user?.role === "Admin" ? (
          <Button asChild className="mt-4 h-11 w-full rounded-xl">
            <Link to="/admin">
              <LayoutDashboard className="size-4" />
              Open admin dashboard
            </Link>
          </Button>
        ) : null}

        <Button
          type="button"
          variant="outline"
          className="mt-3 h-11 w-full rounded-xl"
          onClick={() => {
            logout();
            void navigate({ to: "/" });
          }}
        >
          <LogOut className="size-4" />
          Sign out
        </Button>
      </section>

      <section className="mt-4 rounded-xl border border-border bg-card p-4 shadow-card">
        <h2 className="text-sm font-semibold text-foreground">Data source</h2>
        <p className="mt-2 text-xs text-muted-foreground">
          {seedSource === "loading" && "Loading data from FastAPI backend…"}
          {seedSource === "api" &&
            "Connected to FastAPI backend. Saves upload immediately when online; pending leads sync on reconnect or via Sync."}
          {seedSource === "error" &&
            "Could not reach the FastAPI backend. Start the backend and check VITE_API_URL."}
        </p>
        {lastSyncError ? (
          <p className="mt-2 text-xs text-destructive">Last sync issue: {lastSyncError}</p>
        ) : null}
      </section>
    </AppShell>
  );
}
