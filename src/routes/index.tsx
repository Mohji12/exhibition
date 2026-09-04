import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { forgotPinRequest, loginRequest } from "@/lib/api/http-client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "FUNNEL by Conninter — Sign in" },
      {
        name: "description",
        content: "FUNNEL by Conninter — booth lead capture. Sign in to capture visitors and follow up.",
      },
      { property: "og:title", content: "FUNNEL by Conninter — Sign in" },
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
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotMsg, setForgotMsg] = useState("");

  return (
    <div className="flex min-h-screen items-center justify-center bg-[image:var(--gradient-brand)] px-5 py-10">
      <div className="w-full max-w-[430px] rounded-3xl bg-card p-7 shadow-float">
        <div className="flex items-center gap-3">
          <img
            src="/brand/conninter-logo.png"
            alt="Conninter"
            className="h-11 w-auto max-w-[160px] object-contain"
          />
          <div>
            <p className="text-lg font-semibold tracking-tight text-foreground">FUNNEL</p>
            <p className="text-xs text-muted-foreground">by Conninter · Meetings Made Easy</p>
          </div>
        </div>

        <form
          className="mt-8 space-y-4"
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
              placeholder="you@example.com"
              required
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="pin">Event PIN</Label>
              <button
                type="button"
                className="text-xs font-medium text-primary"
                onClick={() => {
                  setForgotOpen((v) => !v);
                  setForgotMsg("");
                }}
              >
                Forgot PIN?
              </button>
            </div>
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
          {forgotOpen ? (
            <div className="rounded-xl border border-border bg-secondary/40 p-3">
              <p className="text-xs text-muted-foreground">
                Enter your work email. A new PIN will be prepared for your admin (and emailed when
                mail is enabled).
              </p>
              <Button
                type="button"
                variant="outline"
                className="mt-2 h-9 w-full rounded-lg"
                disabled={!email.trim() || pending}
                onClick={() => {
                  setPending(true);
                  setForgotMsg("");
                  void forgotPinRequest(email.trim())
                    .then((res) => setForgotMsg(res.message))
                    .catch((err: unknown) =>
                      setForgotMsg(err instanceof Error ? err.message : "Could not reset PIN"),
                    )
                    .finally(() => setPending(false));
                }}
              >
                Request new PIN
              </Button>
              {forgotMsg ? <p className="mt-2 text-xs text-muted-foreground">{forgotMsg}</p> : null}
            </div>
          ) : null}
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
