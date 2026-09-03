import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { CreditCard, LayoutDashboard, LogOut } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { patchMyProfile } from "@/lib/api/http-client";
import { useAuth } from "@/lib/auth";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "Profile — Conninter Visitor Book" },
      {
        name: "description",
        content: "Edit your Conninter booth profile and sign out.",
      },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const { session, setSession, logout } = useAuth();
  const navigate = useNavigate();
  const { seedSource, lastSyncError } = useStore();
  const user = session?.user;

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [designation, setDesignation] = useState("");
  const [mobile, setMobile] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!user) return;
    setName(user.name);
    setEmail(user.email);
    setCompany(user.company ?? "");
    setDesignation(user.designation ?? "");
    setMobile(user.mobile ?? "");
  }, [user]);

  const save = async () => {
    setBusy(true);
    try {
      const body: {
        name: string;
        email: string;
        company: string;
        designation: string;
        mobile: string;
        loginPin?: string;
      } = { name, email, company, designation, mobile };
      if (pin.trim()) body.loginPin = pin.trim();
      const next = await patchMyProfile(body);
      setSession(next);
      setPin("");
      setEditing(false);
      toast.success("Profile updated");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell title="Profile" subtitle="Your booth account">
      <section className="rounded-xl border border-border bg-card p-4 shadow-card">
        {user && !editing ? (
          <>
            <p className="text-lg font-semibold text-foreground">{user.name}</p>
            <p className="mt-0.5 text-sm text-muted-foreground">{user.email}</p>
            {user.company || user.designation || user.mobile ? (
              <div className="mt-2 space-y-0.5 text-sm text-muted-foreground">
                {user.company ? <p>{user.company}</p> : null}
                {user.designation ? <p>{user.designation}</p> : null}
                {user.mobile ? <p>{user.mobile}</p> : null}
              </div>
            ) : null}
            <span
              className={cn(
                "mt-3 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold",
                user.role === "Admin" ? "bg-accent-soft text-accent" : "bg-primary-soft text-primary",
              )}
            >
              {user.role}
            </span>
            <Button
              type="button"
              variant="outline"
              className="mt-4 h-11 w-full rounded-xl"
              onClick={() => setEditing(true)}
            >
              Edit profile
            </Button>
          </>
        ) : null}

        {user && editing ? (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-foreground">Edit profile</h2>
            <div className="space-y-1.5">
              <Label htmlFor="profile-name">Name</Label>
              <Input
                id="profile-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-11 rounded-xl"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="profile-email">Email</Label>
              <Input
                id="profile-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11 rounded-xl"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="profile-company">Company</Label>
              <Input
                id="profile-company"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                className="h-11 rounded-xl"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="profile-designation">Designation</Label>
              <Input
                id="profile-designation"
                value={designation}
                onChange={(e) => setDesignation(e.target.value)}
                className="h-11 rounded-xl"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="profile-mobile">Mobile</Label>
              <Input
                id="profile-mobile"
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                className="h-11 rounded-xl"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="profile-pin">New 4-digit PIN (optional)</Label>
              <Input
                id="profile-pin"
                inputMode="numeric"
                maxLength={4}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                className="h-11 rounded-xl"
                placeholder="Leave blank to keep current PIN"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <Button className="h-11 flex-1 rounded-xl" disabled={busy} onClick={() => void save()}>
                Save
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-11 flex-1 rounded-xl"
                disabled={busy}
                onClick={() => {
                  setEditing(false);
                  setPin("");
                  if (user) {
                    setName(user.name);
                    setEmail(user.email);
                    setCompany(user.company ?? "");
                    setDesignation(user.designation ?? "");
                    setMobile(user.mobile ?? "");
                  }
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : null}

        <Button asChild variant="outline" className="mt-3 h-11 w-full rounded-xl">
          <Link to="/card">
            <CreditCard className="size-4" />
            My card & QR
          </Link>
        </Button>

        {user?.role === "Admin" ? (
          <Button asChild className="mt-3 h-11 w-full rounded-xl">
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
