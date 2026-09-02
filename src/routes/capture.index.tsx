import { createFileRoute, Link } from "@tanstack/react-router";
import { Camera, CreditCard, PencilLine, ChevronRight, Flame, Clock3 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { computeCaptureStats } from "@/lib/domain/stats";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/capture/")({
  head: () => ({
    meta: [
      { title: "Capture a lead — Conninter Visitor Book" },
      {
        name: "description",
        content:
          "Scan a delegate QR, capture a visiting card or add a lead manually at the Conninter booth.",
      },
      { property: "og:title", content: "Capture a lead — Conninter Visitor Book" },
      {
        property: "og:description",
        content: "Scan delegate QR codes, capture visiting cards and log booth conversations.",
      },
    ],
  }),
  component: CaptureHomePage,
});

const ACTIONS = [
  {
    icon: Camera,
    title: "Scan Delegate QR",
    desc: "Point at the badge to auto-fill details",
    to: "/capture/qr" as const,
  },
  {
    icon: CreditCard,
    title: "Capture Visiting Card",
    desc: "OCR reads name, company and contact",
    to: "/capture/card" as const,
  },
  {
    icon: PencilLine,
    title: "Manual Entry",
    desc: "Type the details yourself",
    to: "/leads/$leadId" as const,
    params: { leadId: "new" },
    search: { source: "manual" as const },
  },
] as const;

function CaptureHomePage() {
  const { leads, appointments } = useStore();
  const { captured, hot, followUps, synced, syncPct } = computeCaptureStats(leads, appointments);

  return (
    <AppShell title="Capture" subtitle="Booth 42 · Hall B">
      <div className="space-y-3">
        {ACTIONS.map(({ icon: Icon, title, desc, ...linkProps }) => (
          <Link
            key={title}
            {...linkProps}
            className="flex items-center gap-4 rounded-xl border border-border bg-card p-4 shadow-card transition-transform active:scale-[0.99]"
          >
            <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
              <Icon className="size-6" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold text-foreground">{title}</p>
              <p className="text-xs text-muted-foreground">{desc}</p>
            </div>
            <ChevronRight className="size-4 text-muted-foreground" />
          </Link>
        ))}
      </div>

      <section className="mt-6">
        <h2 className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Today
        </h2>
        <div className="mt-2 grid grid-cols-3 gap-3">
          <Stat value={String(captured)} label="Captured" />
          <Stat value={String(hot)} label="Hot leads" icon={<Flame className="size-3.5" />} />
          <Stat
            value={String(followUps)}
            label="Follow-ups"
            icon={<Clock3 className="size-3.5" />}
          />
        </div>
        <div className="mt-3 rounded-xl border border-border bg-card p-4 shadow-card">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-foreground">Sync progress</span>
            <span className="text-muted-foreground">
              {synced} / {captured} uploaded
            </span>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-accent transition-all"
              style={{ width: `${syncPct}%` }}
            />
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Leads captured offline upload automatically when the booth Wi-Fi is available.
          </p>
        </div>
      </section>
    </AppShell>
  );
}

function Stat({ value, label, icon }: { value: string; label: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3 text-center shadow-card">
      <p className="text-2xl font-semibold text-primary">{value}</p>
      <p className="mt-0.5 flex items-center justify-center gap-1 text-[11px] text-muted-foreground">
        {icon}
        {label}
      </p>
    </div>
  );
}
