import { createFileRoute, Link } from "@tanstack/react-router";
import { Eye, Mail, MessageCircle, MessageSquare, QrCode, UserRound } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { fetchMyProfile } from "@/lib/api/http-client";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/card")({
  head: () => ({
    meta: [
      { title: "Digital business card — Conninter Visitor Book" },
      {
        name: "description",
        content:
          "Share your Conninter digital business card with booth visitors over WhatsApp, email, SMS or QR code.",
      },
    ],
  }),
  component: CardPage,
});

function CardPage() {
  const { session, setSession } = useAuth();
  const user = session?.user;
  const [qr, setQr] = useState<string>("");
  const [showLargeQr, setShowLargeQr] = useState(false);

  useEffect(() => {
    if (!session?.token || user?.shareToken) return;
    let cancelled = false;
    fetchMyProfile()
      .then((next) => {
        if (!cancelled) setSession(next);
      })
      .catch(() => {
        /* keep existing session */
      });
    return () => {
      cancelled = true;
    };
  }, [session?.token, user?.shareToken, setSession]);

  const shareUrl =
    typeof window !== "undefined" && user?.shareToken
      ? `${window.location.origin}/e/${encodeURIComponent(user.shareToken)}`
      : "";

  useEffect(() => {
    if (!shareUrl) {
      setQr("");
      return;
    }
    let cancelled = false;
    QRCode.toDataURL(shareUrl, {
      width: 720,
      margin: 1,
      color: { dark: "#0a5ea8", light: "#ffffff" },
    }).then((url) => {
      if (!cancelled) setQr(url);
    });
    return () => {
      cancelled = true;
    };
  }, [shareUrl]);

  const shareText = user
    ? `Hi, I'm ${user.name}${user.company ? ` from ${user.company}` : ""}. Leave your details here: ${shareUrl}`
    : shareUrl;

  const shareVia = (channel: "WhatsApp" | "Email" | "SMS") => {
    if (!shareUrl) {
      toast.error("Edit your profile first so a share link can be created.");
      return;
    }
    if (channel === "WhatsApp") {
      window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, "_blank", "noopener,noreferrer");
      return;
    }
    if (channel === "Email") {
      window.location.href = `mailto:?subject=${encodeURIComponent("My Conninter card")}&body=${encodeURIComponent(shareText)}`;
      return;
    }
    window.location.href = `sms:?body=${encodeURIComponent(shareText)}`;
  };

  return (
    <AppShell title="My card" subtitle="Share your details in one tap">
      <div className="overflow-hidden rounded-2xl bg-[image:var(--gradient-brand)] p-6 text-primary-foreground shadow-float">
        <div className="flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-xl bg-card/15">
            <UserRound className="size-6" />
          </div>
          <div>
            <p className="text-sm font-semibold tracking-[0.14em]">
              {user?.company?.trim() || "CONNINTER"}
            </p>
            <p className="text-[11px] text-primary-foreground/75">
              {user?.designation?.trim() || "Exhibitor · MEDICON 2026"}
            </p>
          </div>
        </div>

        <div className="mt-6 flex items-end justify-between gap-4">
          <div className="min-w-0">
            {user ? (
              <>
                <p className="text-xl font-semibold">{user.name}</p>
                <p className="text-xs text-primary-foreground/80">
                  {user.designation?.trim() || user.role}
                </p>
                <div className="mt-3 space-y-0.5 text-xs text-primary-foreground/90">
                  <p className="truncate">{user.email}</p>
                  {user.mobile ? <p>{user.mobile}</p> : null}
                </div>
              </>
            ) : (
              <p className="text-sm text-primary-foreground/85">Sign in to see your card.</p>
            )}
          </div>
          <button
            type="button"
            className="grid size-24 shrink-0 place-items-center overflow-hidden rounded-xl bg-card text-primary"
            onClick={() => setShowLargeQr(true)}
            aria-label="Show QR code"
          >
            {qr ? (
              <img src={qr} alt="Share QR code" className="size-full object-cover p-1" />
            ) : (
              <QrCode className="size-16" />
            )}
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Button variant="outline" className="h-12 rounded-xl" onClick={() => shareVia("WhatsApp")}>
          <MessageCircle className="size-4" />
          WhatsApp
        </Button>
        <Button variant="outline" className="h-12 rounded-xl" onClick={() => shareVia("Email")}>
          <Mail className="size-4" />
          Email
        </Button>
        <Button variant="outline" className="h-12 rounded-xl" onClick={() => shareVia("SMS")}>
          <MessageSquare className="size-4" />
          SMS
        </Button>
        <Button
          variant="outline"
          className="h-12 rounded-xl"
          onClick={() => {
            if (!qr) {
              toast.error("QR is not ready yet. Check your profile share link.");
              return;
            }
            setShowLargeQr(true);
          }}
        >
          <QrCode className="size-4" />
          Show QR
        </Button>
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-xl border border-border bg-card p-4 text-sm shadow-card">
        <Eye className="mt-0.5 size-4 shrink-0 text-accent" />
        <span className="text-foreground">
          Visitors who scan this QR open your card and can submit their details and interests. Those
          leads appear in your{" "}
          <Link to="/leads" className="font-medium text-primary underline-offset-4 hover:underline">
            Leads
          </Link>{" "}
          list.
        </span>
      </div>

      <Button asChild variant="outline" className="mt-3 h-11 w-full rounded-xl">
        <Link to="/profile">Edit profile details</Link>
      </Button>

      {showLargeQr && qr ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6"
          role="dialog"
          aria-modal="true"
          onClick={() => setShowLargeQr(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-card p-5 text-center shadow-float"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm font-semibold text-foreground">Scan to leave details</p>
            <img src={qr} alt="Large share QR" className="mx-auto mt-4 w-full max-w-[260px]" />
            <p className="mt-3 break-all text-xs text-muted-foreground">{shareUrl}</p>
            <Button className="mt-4 h-11 w-full rounded-xl" onClick={() => setShowLargeQr(false)}>
              Close
            </Button>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
