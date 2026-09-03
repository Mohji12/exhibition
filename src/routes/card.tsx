import { createFileRoute } from "@tanstack/react-router";
import { Eye, Mail, MessageCircle, MessageSquare, QrCode, Stethoscope } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
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
      { property: "og:title", content: "Digital business card — Conninter Visitor Book" },
      {
        property: "og:description",
        content: "A shareable Conninter rep card with QR code and engagement stats.",
      },
    ],
  }),
  component: CardPage,
});

const SHARE = [
  { icon: MessageCircle, label: "WhatsApp" },
  { icon: Mail, label: "Email" },
  { icon: MessageSquare, label: "SMS" },
  { icon: QrCode, label: "Show QR" },
] as const;

function CardPage() {
  const { session } = useAuth();
  const user = session?.user;

  return (
    <AppShell title="My card" subtitle="Share your details in one tap">
      <div className="overflow-hidden rounded-2xl bg-[image:var(--gradient-brand)] p-6 text-primary-foreground shadow-float">
        <div className="flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-xl bg-card/15">
            <Stethoscope className="size-6" />
          </div>
          <div>
            <p className="text-sm font-semibold tracking-[0.2em]">CONNINTER</p>
            <p className="text-[11px] text-primary-foreground/75">Medical Equipment Solutions</p>
          </div>
        </div>

        <div className="mt-6 flex items-end justify-between gap-4">
          <div>
            {user ? (
              <>
                <p className="text-xl font-semibold">{user.name}</p>
                <p className="text-xs text-primary-foreground/80">{user.role}</p>
                <div className="mt-3 space-y-0.5 text-xs text-primary-foreground/90">
                  <p>{user.email}</p>
                </div>
              </>
            ) : (
              <p className="text-sm text-primary-foreground/85">Sign in to see your card.</p>
            )}
          </div>
          <div className="grid size-24 shrink-0 place-items-center rounded-xl bg-card text-primary">
            <QrCode className="size-16" />
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        {SHARE.map(({ icon: Icon, label }) => (
          <Button
            key={label}
            variant="outline"
            className="h-12 rounded-xl"
            onClick={() => toast.success(`Card shared via ${label}`)}
          >
            <Icon className="size-4" />
            {label}
          </Button>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-2 rounded-xl border border-border bg-card p-4 text-sm shadow-card">
        <Eye className="size-4 text-accent" />
        <span className="font-medium text-foreground">Card views are not tracked yet</span>
      </div>
    </AppShell>
  );
}
