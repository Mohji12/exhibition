import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ShieldCheck, Stethoscope } from "lucide-react";
import { loginRequest } from "@/lib/api/http-client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Conninter Visitor Book — Sign in" },
      {
        name: "description",
        content:
          "Booth lead-capture app for Conninter at MEDICON 2026. Sign in to scan delegates, capture cards and schedule follow-ups.",
      },
      { property: "og:title", content: "Conninter Visitor Book — Sign in" },
      {
        property: "og:description",
        content: "Lead capture for medical-equipment exhibitions. Scan, qualify and follow up.",
      },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const { setSession } = useAuth();
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[image:var(--gradient-brand)] px-5 py-10">
      <div className="w-full max-w-[430px] rounded-3xl bg-card p-7 shadow-float">
        <div className="flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-2xl bg-primary text-primary-foreground">
            <Stethoscope className="size-6" />
          </div>
          <div>
            <p className="text-lg font-semibold tracking-tight text-foreground">CONNINTER</p>
            <p className="text-xs text-muted-foreground">Exhibition Visitor Book</p>
          </div>
        </div>

        <div className="mt-6 rounded-xl bg-primary-soft px-4 py-3">
          <p className="text-sm font-semibold text-primary">MEDICON 2026</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="size-3.5 text-accent" />
            Access valid until 30 Sept 2026
          </p>
        </div>

        <form
          className="mt-6 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setError("");
            setPending(true);
            void loginRequest(email.trim(), pin)
              .then((session) => {
                setSession(session);
                void navigate({ to: session.user.role === "Admin" ? "/admin" : "/capture" });
              })
              .catch((err: unknown) => {
                setError(err instanceof Error ? err.message : "Sign in failed");
              })
              .finally(() => setPending(false));
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="email">Work email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@conninter.com"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pin">Event PIN</Label>
            <Input
              id="pin"
              type="password"
              inputMode="numeric"
              autoComplete="current-password"
              maxLength={4}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="••••"
              required
            />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button type="submit" className="h-11 w-full rounded-xl text-base" disabled={pending || pin.length !== 4}>
            {pending ? "Signing in…" : "Sign in"}
          </Button>
        </form>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          New to the booth? Scan the admin QR to activate your account.
        </p>
      </div>
    </div>
  );
}
