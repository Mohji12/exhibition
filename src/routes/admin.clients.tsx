import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { InvitePanel } from "@/components/InvitePanel";
import { PageLoader } from "@/components/PageLoader";
import { fetchAdminUsers, patchAdminUser } from "@/lib/api/http-client";
import { useAuth } from "@/lib/auth";
import type { AuthUser } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/clients")({
  head: () => ({
    meta: [{ title: "Exhibitors — FUNNEL" }],
  }),
  component: ClientsPage,
});

function ClientsPage() {
  const { session, ready } = useAuth();
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = () => {
    setLoading(true);
    return fetchAdminUsers()
      .then(setUsers)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load clients"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!ready || session?.user.role !== "Admin") return;
    void reload();
  }, [ready, session?.user.role]);

  const clients = users.filter((u) => u.role === "Rep");
  const admins = users.filter((u) => u.role === "Admin");

  const setStatus = async (user: AuthUser, status: AuthUser["status"]) => {
    setBusyId(user.id);
    try {
      const next = await patchAdminUser(user.id, { status });
      setUsers((prev) => prev.map((item) => (item.id === next.id ? next : item)));
      toast.success(`${next.name} ${status === "active" ? "enabled" : "disabled"}`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">FUNNEL</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight text-foreground">Exhibitors</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Companies that joined with the invite QR and PIN. Each exhibitor only sees their own visitor
        leads.
      </p>

      <InvitePanel variant="embedded" className="mt-8" />

      <h2 className="mt-10 text-lg font-semibold text-foreground">Joined companies</h2>
      <p className="mt-1 text-sm text-muted-foreground">Enable, disable, or open an exhibitor to manage PIN and leads.</p>

      {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}

      {loading ? (
        <PageLoader label="Loading exhibitors…" compact className="mt-4" />
      ) : (
        <ul className="mt-6 divide-y divide-border border-y border-border">
          {clients.length === 0 ? (
            <li className="py-8 text-sm text-muted-foreground">
              No exhibitors yet. Share the invite QR above so a company can activate with the PIN.
            </li>
          ) : (
            clients.map((user) => {
              const captured = user.leadsCaptured ?? 0;
              return (
                <li
                  key={user.id}
                  className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{user.name}</p>
                    <p className="truncate text-sm text-muted-foreground">{user.email}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {captured} visitor lead{captured === 1 ? "" : "s"}
                      {user.loginPinPlain ? ` · PIN ${user.loginPinPlain}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                        user.status === "active"
                          ? "bg-accent-soft text-accent"
                          : "bg-secondary text-muted-foreground",
                      )}
                    >
                      {user.status}
                    </span>
                    <Button variant="outline" size="sm" className="rounded-lg" asChild>
                      <Link to="/admin/clients/$userId" params={{ userId: user.id }}>
                        Edit & leads
                      </Link>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-lg"
                      disabled={busyId === user.id}
                      onClick={() =>
                        void setStatus(user, user.status === "active" ? "disabled" : "active")
                      }
                    >
                      {user.status === "active" ? "Disable" : "Enable"}
                    </Button>
                  </div>
                </li>
              );
            })
          )}
        </ul>
      )}

      {admins.length > 0 ? (
        <p className="mt-6 text-xs text-muted-foreground">
          Platform admins ({admins.map((a) => a.name).join(", ")}) are not listed as exhibitors.
        </p>
      ) : null}
    </div>
  );
}
