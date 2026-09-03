import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { fetchAdminUsers, patchAdminUser } from "@/lib/api/http-client";
import { useAuth } from "@/lib/auth";
import type { AuthUser } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/staff")({
  head: () => ({
    meta: [{ title: "Staff accounts — Conninter" }],
  }),
  component: StaffPage,
});

function StaffPage() {
  const { session, ready } = useAuth();
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = () =>
    fetchAdminUsers()
      .then(setUsers)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load staff"));

  useEffect(() => {
    if (!ready || session?.user.role !== "Admin") return;
    void reload();
  }, [ready, session?.user.role]);

  const update = async (user: AuthUser, body: { status?: AuthUser["status"]; role?: AuthUser["role"] }) => {
    setBusyId(user.id);
    setError("");
    try {
      const next = await patchAdminUser(user.id, body);
      setUsers((prev) => prev.map((item) => (item.id === next.id ? next : item)));
      toast.success(`${next.name} updated`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Update failed";
      setError(message);
      toast.error(message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Conninter</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight text-foreground">Staff accounts</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Accounts activated from the invite QR. Promote, demote or disable access.
      </p>
      {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}

      <ul className="mt-8 divide-y divide-border border-y border-border">
        {users.map((user) => {
          const self = user.id === session?.user.id;
          const captured = user.leadsCaptured ?? 0;
          return (
            <li key={user.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="truncate font-medium text-foreground">
                  {user.name}
                  {self ? <span className="ml-2 text-xs font-normal text-muted-foreground">you</span> : null}
                </p>
                <p className="truncate text-sm text-muted-foreground">{user.email}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {captured} lead{captured === 1 ? "" : "s"} captured
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                    user.role === "Admin" ? "bg-accent-soft text-accent" : "bg-primary-soft text-primary",
                  )}
                >
                  {user.role}
                </span>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                    user.status === "active" ? "bg-accent-soft text-accent" : "bg-secondary text-muted-foreground",
                  )}
                >
                  {user.status}
                </span>
                <Button variant="outline" size="sm" className="rounded-lg" asChild>
                  <Link to="/admin/leads" search={{ capturedBy: user.id }}>
                    View leads
                  </Link>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-lg"
                  disabled={busyId === user.id || self}
                  onClick={() => void update(user, { role: user.role === "Admin" ? "Rep" : "Admin" })}
                >
                  {user.role === "Admin" ? "Make Rep" : "Make Admin"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-lg"
                  disabled={busyId === user.id || self}
                  onClick={() =>
                    void update(user, { status: user.status === "active" ? "disabled" : "active" })
                  }
                >
                  {user.status === "active" ? "Disable" : "Enable"}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
