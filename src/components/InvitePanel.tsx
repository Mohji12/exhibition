import { Copy, Mail, MessageCircle, MessageSquare } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { toast } from "sonner";
import { refreshInvitePin, startInvite } from "@/lib/api/http-client";
import { useAuth } from "@/lib/auth";
import type { InvitePin } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { PageLoader } from "@/components/PageLoader";
import { cn } from "@/lib/utils";

type InvitePanelProps = {
  /** Compact layout for embedding on Exhibitors; full for the Invite page. */
  variant?: "page" | "embedded";
  className?: string;
};

export function InvitePanel({ variant = "page", className }: InvitePanelProps) {
  const { session, ready } = useAuth();
  const [invite, setInvite] = useState<InvitePin | null>(null);
  const [qr, setQr] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const inFlight = useRef(false);

  const load = async (kind: "start" | "refresh" | "fresh") => {
    if (inFlight.current) return;
    inFlight.current = true;
    if (kind !== "start") setBusy(true);
    try {
      const next = kind === "refresh" ? await refreshInvitePin() : await startInvite(kind === "fresh");
      setInvite(next);
      setError("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not generate invite");
    } finally {
      inFlight.current = false;
      setLoading(false);
      setBusy(false);
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

  const shareText = invite
    ? `Join FUNNEL as an exhibitor: ${joinUrl}\nActivation PIN (expires soon): ${invite.pin}`
    : joinUrl;

  const share = (channel: "WhatsApp" | "Email" | "SMS" | "Copy") => {
    if (!joinUrl || !invite) {
      toast.error("Invite link is not ready yet");
      return;
    }
    if (channel === "Copy") {
      void navigator.clipboard.writeText(`${joinUrl}\nPIN: ${invite.pin}`);
      toast.success("Link and PIN copied");
      return;
    }
    if (channel === "WhatsApp") {
      window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, "_blank", "noopener,noreferrer");
      return;
    }
    if (channel === "Email") {
      window.location.href = `mailto:?subject=${encodeURIComponent("FUNNEL exhibitor invite")}&body=${encodeURIComponent(shareText)}`;
      return;
    }
    window.location.href = `sms:?body=${encodeURIComponent(shareText)}`;
  };

  const embedded = variant === "embedded";

  if (loading && !invite) {
    return (
      <div className={cn(embedded ? "rounded-2xl border border-border bg-card p-4" : "", className)}>
        <PageLoader label="Loading invite…" compact={embedded} />
      </div>
    );
  }

  return (
    <div
      className={cn(
        embedded
          ? "rounded-2xl border border-border bg-card p-4 sm:p-5"
          : "mx-auto flex min-h-[70vh] max-w-xl flex-col items-center text-center",
        className,
      )}
    >
      {!embedded ? (
        <>
          <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">FUNNEL</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-foreground">Invite</h1>
          <p className="mt-2 text-sm text-muted-foreground">Scan or share the link to register as an exhibitor</p>
        </>
      ) : (
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-foreground">Invite QR & PIN</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Share this with a company to join. PIN refreshes automatically; generate a new one anytime.
          </p>
        </div>
      )}

      <div
        className={cn(
          "overflow-hidden bg-card",
          embedded ? "mx-auto max-w-xs rounded-2xl shadow-card" : "mt-8 w-full rounded-3xl shadow-float",
        )}
      >
        {qr ? (
          <img
            src={qr}
            alt="Exhibitor invite QR code"
            className="aspect-square w-full animate-in fade-in duration-500"
          />
        ) : (
          <div className="grid aspect-square place-items-center bg-primary-soft text-sm text-muted-foreground">
            Preparing QR…
          </div>
        )}
      </div>

      {joinUrl ? (
        <p
          className={cn(
            "w-full break-all rounded-xl border border-border bg-background px-3 py-2 text-left text-xs text-muted-foreground",
            embedded ? "mt-4" : "mt-4",
          )}
        >
          {joinUrl}
        </p>
      ) : null}

      <div
        className={cn(
          "grid w-full gap-2",
          embedded ? "mt-3 grid-cols-2 sm:grid-cols-4" : "mt-3 grid-cols-2 sm:grid-cols-4",
        )}
      >
        <Button type="button" variant="outline" className="h-10 rounded-xl" onClick={() => share("Copy")}>
          <Copy className="size-4" />
          Copy
        </Button>
        <Button type="button" variant="outline" className="h-10 rounded-xl" onClick={() => share("WhatsApp")}>
          <MessageCircle className="size-4" />
          WhatsApp
        </Button>
        <Button type="button" variant="outline" className="h-10 rounded-xl" onClick={() => share("Email")}>
          <Mail className="size-4" />
          Email
        </Button>
        <Button type="button" variant="outline" className="h-10 rounded-xl" onClick={() => share("SMS")}>
          <MessageSquare className="size-4" />
          SMS
        </Button>
      </div>

      <div className={cn(embedded ? "mt-6 text-center" : "")}>
        <p
          className={cn(
            "text-xs uppercase tracking-[0.2em] text-muted-foreground",
            embedded ? "" : "mt-8",
          )}
        >
          Activation PIN
        </p>
        <p
          key={invite?.pin}
          className={cn(
            "mt-2 font-semibold tabular-nums tracking-[0.35em] text-foreground animate-in zoom-in-95 fade-in duration-300",
            embedded ? "text-4xl" : "",
          )}
          style={embedded ? undefined : { fontSize: "3.25rem", lineHeight: 1 }}
        >
          {invite?.pin ?? "————"}
        </p>
        <p className="mt-3 text-sm text-muted-foreground">
          {secondsLeft > 0 ? `Refreshes in ${secondsLeft}s` : "Refreshing PIN…"}
        </p>
      </div>

      {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}

      <div className={cn("flex w-full flex-col gap-3 sm:flex-row", embedded ? "mt-5" : "mt-8")}>
        <Button
          className="h-12 flex-1 rounded-xl text-base"
          disabled={busy}
          onClick={() => void load("refresh")}
        >
          {busy ? "Updating…" : "Generate new PIN"}
        </Button>
        <Button
          variant="outline"
          className="h-12 flex-1 rounded-xl text-base"
          disabled={busy}
          onClick={() => void load("fresh")}
        >
          New QR
        </Button>
      </div>
    </div>
  );
}
