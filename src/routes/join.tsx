import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ShieldCheck, Stethoscope } from "lucide-react";
import { activateAccount, lookupInvite } from "@/lib/api/http-client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type JoinSearch = { t?: string };

export const Route = createFileRoute("/join")({
  validateSearch: (search: Record<string, unknown>): JoinSearch => ({
    t: typeof search.t === "string" ? search.t : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Activate account — Conninter Visitor Book" },
      {
        name: "description",
        content: "Activate your Conninter booth account with the PIN shown on the admin dashboard.",
      },
    ],
  }),
  component: JoinPage,
});

function JoinPage() {
  const { t: token } = Route.useSearch();
  const navigate = useNavigate();
  const { setSession } = useAuth();
  const [inviteOk, setInviteOk] = useState<boolean | null>(token ? null : false);
  const [inviteError, setInviteError] = useState(
    token ? "" : "This invite link is missing a token. Scan the QR from the admin dashboard.",
  );
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [loginPin, setLoginPin] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    lookupInvite(token)
      .then((result) => {
        if (cancelled) return;
        setInviteOk(result.ok);
        setInviteError(result.error || "This invite is no longer valid.");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setInviteOk(false);
        setInviteError(err instanceof Error ? err.message : "Could not check this invite.");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[image:var(--gradient-brand)] px-5 py-10">
      <div className="w-full max-w-[430px] rounded-3xl bg-card p-7 shadow-float">
        <div className="flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-2xl bg-primary text-primary-foreground">
            <Stethoscope className="size-6" />
          </div>
          <div>
            <p className="text-lg font-semibold tracking-tight text-foreground">CONNINTER</p>
            <p className="text-xs text-muted-foreground">Activate booth account</p>
          </div>
        </div>

        <div className="mt-6 rounded-xl bg-primary-soft px-4 py-3">
          <p className="text-sm font-semibold text-primary">MEDICON 2026</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="size-3.5 text-accent" />
            Enter the 4-digit PIN shown under the admin QR
          </p>
        </div>

        {inviteOk === false ? (
          <p className="mt-6 text-sm text-destructive">{inviteError}</p>
        ) : inviteOk === null ? (
          <p className="mt-6 text-sm text-muted-foreground">Checking invite…</p>
        ) : (
          <form
            className="mt-6 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!token) return;
              setError("");
              setPending(true);
              void activateAccount({
                token,
                pin,
                name: name.trim(),
                email: email.trim(),
                loginPin,
              })
                .then((session) => {
                  setSession(session);
                  void navigate({ to: "/capture" });
                })
                .catch((err: unknown) => {
                  setError(err instanceof Error ? err.message : "Activation failed");
                })
                .finally(() => setPending(false));
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="name">Full name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="join-email">Work email</Label>
              <Input
                id="join-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@conninter.com"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="login-pin">Choose a 4-digit login PIN</Label>
              <Input
                id="login-pin"
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={loginPin}
                onChange={(e) => setLoginPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="••••"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="activation-pin">Activation PIN from the dashboard</Label>
              <Input
                id="activation-pin"
                type="text"
                inputMode="numeric"
                maxLength={4}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="••••"
                required
              />
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button
              type="submit"
              className="h-11 w-full rounded-xl text-base"
              disabled={pending || loginPin.length !== 4 || pin.length !== 4}
            >
              {pending ? "Activating…" : "Activate account"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
