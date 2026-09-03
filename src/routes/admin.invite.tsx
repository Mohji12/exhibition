import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { refreshInvitePin, startInvite } from "@/lib/api/http-client";
import { useAuth } from "@/lib/auth";
import type { InvitePin } from "@/lib/types";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/admin/invite")({
  head: () => ({
    meta: [{ title: "Invite staff — Conninter" }],
  }),
  component: InvitePage,
});

function InvitePage() {
  const { session, ready } = useAuth();
  const [invite, setInvite] = useState<InvitePin | null>(null);
  const [qr, setQr] = useState("");
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const inFlight = useRef(false);

  const load = async (kind: "start" | "refresh" | "fresh") => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const next = kind === "refresh" ? await refreshInvitePin() : await startInvite(kind === "fresh");
      setInvite(next);
      setError("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not generate invite");
    } finally {
      inFlight.current = false;
    }
  };

  useEffect(() => {
    if (!ready || session?.user.role !== "Admin") return;
    void load("start");
    const rotate = window.setInterval(() => {
      void load("refresh");
    }, 30_000);
    const tick = window.setInterval(() => setNow(Date.now()), 250);
    return () => {
      window.clearInterval(rotate);
      window.clearInterval(tick);
    };
  }, [ready, session?.user.role]);

  const joinUrl =
    typeof window !== "undefined" && invite
      ? `${window.location.origin}/join?t=${encodeURIComponent(invite.token)}`
      : "";

  useEffect(() => {
    if (!joinUrl) return;
    let cancelled = false;
    QRCode.toDataURL(joinUrl, {
      width: 720,
      margin: 1,
      color: { dark: "#0a5ea8", light: "#ffffff" },
    }).then((url) => {
      if (!cancelled) setQr(url);
    });
    return () => {
      cancelled = true;
    };
  }, [joinUrl]);

  const secondsLeft = invite
    ? Math.max(0, Math.ceil((new Date(invite.expiresAt).getTime() - now) / 1000))
    : 0;

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-xl flex-col items-center text-center">
      <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Conninter</p>
      <h1 className="mt-2 text-4xl font-semibold tracking-tight text-foreground">CONNINTER</h1>
      <p className="mt-2 text-sm text-muted-foreground">Scan to create a booth account</p>

      <div className="mt-8 w-full overflow-hidden rounded-3xl bg-card shadow-float">
        {qr ? (
          <img
            src={qr}
            alt="Staff invite QR code"
            className="aspect-square w-full animate-in fade-in duration-500"
          />
        ) : (
          <div className="grid aspect-square place-items-center bg-primary-soft text-sm text-muted-foreground">
            Preparing QR…
          </div>
        )}
      </div>

      <p className="mt-8 text-xs uppercase tracking-[0.2em] text-muted-foreground">Activation PIN</p>
      <p
        key={invite?.pin}
        className="mt-2 font-semibold tabular-nums tracking-[0.35em] text-foreground animate-in zoom-in-95 fade-in duration-300"
        style={{ fontSize: "3.25rem", lineHeight: 1 }}
      >
        {invite?.pin ?? "————"}
      </p>
      <p className="mt-3 text-sm text-muted-foreground">
        {secondsLeft > 0 ? `Refreshes in ${secondsLeft}s` : "Refreshing PIN…"}
      </p>

      {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}

      <div className="mt-8 flex w-full flex-col gap-3 sm:flex-row">
        <Button className="h-12 flex-1 rounded-xl text-base" onClick={() => void load("refresh")}>
          Refresh PIN
        </Button>
        <Button
          variant="outline"
          className="h-12 flex-1 rounded-xl text-base"
          onClick={() => void load("fresh")}
        >
          New QR
        </Button>
      </div>
    </div>
  );
}
