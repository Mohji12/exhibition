import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageLoader } from "@/components/PageLoader";
import {
  deleteAdminUser,
  fetchAdminLeads,
  fetchAdminUser,
  patchAdminUser,
  resetAdminUserPin,
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
  const [company, setCompany] = useState("");
  const [designation, setDesignation] = useState("");
  const [mobile, setMobile] = useState("");
  const [eventName, setEventName] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [shownPin, setShownPin] = useState("");

  useEffect(() => {
    if (!ready || session?.user.role !== "Admin") return;
    let cancelled = false;
    setLoading(true);
    Promise.all([fetchAdminUser(userId), fetchAdminLeads({ capturedBy: userId })])
      .then(([nextUser, nextLeads]) => {
        if (cancelled) return;
        setUser(nextUser);
        setName(nextUser.name);
        setEmail(nextUser.email);
        setCompany(nextUser.company ?? "");
        setDesignation(nextUser.designation ?? "");
        setMobile(nextUser.mobile ?? "");
        setEventName(nextUser.eventName ?? "");
        setShownPin(nextUser.loginPinPlain ?? "");
        setLeads(nextLeads);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load exhibitor");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
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
      const body: {
        name: string;
        email: string;
        company: string;
        designation: string;
        mobile: string;
        eventName: string;
        loginPin?: string;
      } = { name, email, company, designation, mobile, eventName };
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
      {loading ? <PageLoader label="Loading exhibitor…" /> : null}

      <section
        className={
          loading
            ? "sr-only"
            : "mt-8 space-y-3 rounded-2xl border border-border bg-card p-4 shadow-card"
        }
      >
        <h2 className="text-sm font-semibold text-foreground">Edit exhibitor</h2>
        <div className="space-y-1.5">
          <Label htmlFor="name">Name</Label>
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
          <Label htmlFor="eventName">Exhibition name</Label>
          <Input
            id="eventName"
            value={eventName}
            onChange={(e) => setEventName(e.target.value)}
            className="h-11 rounded-xl"
            placeholder="Optional — shown on their booth"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="company">Company</Label>
          <Input
            id="company"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            className="h-11 rounded-xl"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="designation">Designation</Label>
          <Input
            id="designation"
            value={designation}
            onChange={(e) => setDesignation(e.target.value)}
            className="h-11 rounded-xl"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="mobile">Mobile</Label>
          <Input
            id="mobile"
            value={mobile}
            onChange={(e) => setMobile(e.target.value)}
            className="h-11 rounded-xl"
          />
        </div>

        <div className="rounded-xl border border-border bg-secondary/40 p-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Login PIN</p>
          <p className="mt-1 font-semibold tabular-nums tracking-[0.2em] text-foreground">
            {shownPin || user?.loginPinPlain || "Not available — reset to generate"}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-lg"
              disabled={busy || !user}
              onClick={() => {
                if (!user) return;
                setBusy(true);
                void resetAdminUserPin(user.id, false)
                  .then((res) => {
                    setShownPin(res.pin);
                    if (res.user) setUser(res.user);
                    toast.success(res.message || `New PIN: ${res.pin}`);
                  })
                  .catch((err: unknown) =>
                    toast.error(err instanceof Error ? err.message : "Reset failed"),
                  )
                  .finally(() => setBusy(false));
              }}
            >
              Reset PIN
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-lg"
              disabled={busy || !user}
              onClick={() => {
                if (!user) return;
                setBusy(true);
                void resetAdminUserPin(user.id, true)
                  .then((res) => {
                    setShownPin(res.pin);
                    if (res.user) setUser(res.user);
                    toast.message(res.message || `PIN: ${res.pin}`);
                  })
                  .catch((err: unknown) =>
                    toast.error(err instanceof Error ? err.message : "Could not email PIN"),
                  )
                  .finally(() => setBusy(false));
              }}
            >
              Email new PIN
            </Button>
            {(shownPin || user?.loginPinPlain) ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-lg"
                onClick={() => {
                  const value = shownPin || user?.loginPinPlain || "";
                  void navigator.clipboard.writeText(value);
                  toast.success("PIN copied");
                }}
              >
                Copy PIN
              </Button>
            ) : null}
          </div>
          {user?.lastLoginAt ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Last login: {new Date(user.lastLoginAt).toLocaleString()}
            </p>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">No login recorded yet</p>
          )}
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

      <section className={loading ? "sr-only" : "mt-10"}>
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
