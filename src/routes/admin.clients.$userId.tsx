import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  deleteAdminUser,
  fetchAdminLeads,
  fetchAdminUser,
  patchAdminUser,
} from "@/lib/api/http-client";
import { useAuth } from "@/lib/auth";
import type { AuthUser, Lead } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/admin/clients/$userId")({
  head: () => ({
    meta: [{ title: "Exhibitor — Conninter" }],
  }),
  component: ClientDetailPage,
});

function ClientDetailPage() {
  const { userId } = Route.useParams();
  const { session, ready } = useAuth();
  const navigate = useNavigate();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!ready || session?.user.role !== "Admin") return;
    let cancelled = false;
    Promise.all([fetchAdminUser(userId), fetchAdminLeads({ capturedBy: userId })])
      .then(([nextUser, nextLeads]) => {
        if (cancelled) return;
        setUser(nextUser);
        setName(nextUser.name);
        setEmail(nextUser.email);
        setLeads(nextLeads);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load exhibitor");
      });
    return () => {
      cancelled = true;
    };
  }, [ready, session?.user.role, userId]);

  const save = async () => {
    if (!user) return;
    setBusy(true);
    setError("");
    try {
      const body: { name: string; email: string; loginPin?: string } = { name, email };
      if (pin.trim()) body.loginPin = pin.trim();
      const next = await patchAdminUser(user.id, body);
      setUser(next);
      setPin("");
      toast.success("Exhibitor updated");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Update failed";
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!user) return;
    if (
      !window.confirm(
        `Remove ${user.name}? Their visitor leads will be deleted. This cannot be undone.`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await deleteAdminUser(user.id);
      toast.success("Exhibitor removed");
      void navigate({ to: "/admin/clients" });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Remove failed");
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Conninter</p>
      <p className="mt-2 text-sm">
        <Link to="/admin/clients" className="text-primary underline-offset-4 hover:underline">
          ← All exhibitors
        </Link>
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
        {user?.name ?? "Exhibitor"}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Joined via invite QR + PIN. Only this exhibitor’s visitor leads are listed below.
      </p>
      {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}

      <section className="mt-8 space-y-3 rounded-2xl border border-border bg-card p-4 shadow-card">
        <h2 className="text-sm font-semibold text-foreground">Edit exhibitor</h2>
        <div className="space-y-1.5">
          <Label htmlFor="name">Name / company</Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} className="h-11 rounded-xl" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">Login email</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-11 rounded-xl"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pin">New 4-digit PIN (optional)</Label>
          <Input
            id="pin"
            inputMode="numeric"
            maxLength={4}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
            className="h-11 rounded-xl"
            placeholder="Leave blank to keep current PIN"
          />
        </div>
        <div className="flex flex-wrap gap-2 pt-2">
          <Button className="h-10 rounded-xl" disabled={busy || !user} onClick={() => void save()}>
            Save
          </Button>
          <Button variant="destructive" className="h-10 rounded-xl" disabled={busy || !user} onClick={() => void remove()}>
            Remove exhibitor
          </Button>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold text-foreground">Their visitor leads</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {leads.length} lead{leads.length === 1 ? "" : "s"} captured by this exhibitor.
        </p>
        <ul className="mt-4 divide-y divide-border border-y border-border">
          {leads.length === 0 ? (
            <li className="py-6 text-sm text-muted-foreground">No visitor leads yet.</li>
          ) : (
            leads.map((lead) => (
              <li key={lead.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate font-medium text-foreground">{lead.name}</p>
                  <p className="truncate text-sm text-muted-foreground">
                    {lead.company} · {lead.priority}
                  </p>
                </div>
                <Button variant="outline" size="sm" className="rounded-lg" asChild>
                  <Link to="/leads/$leadId" params={{ leadId: lead.id }}>
                    Open
                  </Link>
                </Button>
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}
