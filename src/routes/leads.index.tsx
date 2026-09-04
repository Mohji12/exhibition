import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Search, SearchX } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { PriorityBadge, SyncDot, Tag } from "@/components/LeadBits";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { filterLeads } from "@/lib/domain/leads";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { FilledBy, Priority } from "@/lib/types";

export const Route = createFileRoute("/leads/")({
  head: () => ({
    meta: [
      { title: "Leads dashboard — Conninter Visitor Book" },
      {
        name: "description",
        content:
          "Search and filter every lead captured at the Conninter booth by priority, product interest and sync status.",
      },
      { property: "og:title", content: "Leads dashboard — Conninter Visitor Book" },
      {
        property: "og:description",
        content: "All booth leads in one filterable list with priority and sync status.",
      },
    ],
  }),
  component: LeadsPage,
});

const PRIORITIES: Priority[] = ["hot", "warm", "cold"];
const SYNC_FILTERS = ["synced", "pending"] as const;
const FILLED_BY: { value: FilledBy; label: string }[] = [
  { value: "exhibitor", label: "Exhibitor added" },
  { value: "visitor", label: "Client filled" },
];

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card text-muted-foreground",
      )}
    >
      {children}
    </button>
  );
}

function LeadsPage() {
  const { leads, interests } = useStore();
  const [query, setQuery] = useState("");
  const [priority, setPriority] = useState<Priority | null>(null);
  const [interest, setInterest] = useState<string | null>(null);
  const [sync, setSync] = useState<(typeof SYNC_FILTERS)[number] | null>(null);
  const [filledBy, setFilledBy] = useState<FilledBy | null>(null);

  const filtered = useMemo(
    () =>
      filterLeads(leads, {
        query,
        priority,
        interest,
        sync,
        filledBy,
      }),
    [leads, query, priority, interest, sync, filledBy],
  );

  const clear = () => {
    setQuery("");
    setPriority(null);
    setInterest(null);
    setSync(null);
    setFilledBy(null);
  };

  return (
    <AppShell title="Leads" subtitle={`${leads.length} captured at this event`}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, company or email"
          className="h-11 rounded-xl pl-9"
        />
      </div>

      <div className="-mx-4 mt-3 space-y-2 overflow-hidden px-4">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {FILLED_BY.map((f) => (
            <Chip
              key={f.value}
              active={filledBy === f.value}
              onClick={() => setFilledBy(filledBy === f.value ? null : f.value)}
            >
              {f.label}
            </Chip>
          ))}
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {PRIORITIES.map((p) => (
            <Chip
              key={p}
              active={priority === p}
              onClick={() => setPriority(priority === p ? null : p)}
            >
              {({ hot: "Hot", warm: "Warm", cold: "Cold" } as const)[p]}
            </Chip>
          ))}
          {SYNC_FILTERS.map((s) => (
            <Chip key={s} active={sync === s} onClick={() => setSync(sync === s ? null : s)}>
              {s === "synced" ? "Synced" : "Pending sync"}
            </Chip>
          ))}
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {interests.map((t) => (
            <Chip
              key={t}
              active={interest === t}
              onClick={() => setInterest(interest === t ? null : t)}
            >
              {t}
            </Chip>
          ))}
        </div>
      </div>

      <div className="mt-3 space-y-2.5">
        {filtered.map((lead) => {
          const who = lead.filledBy === "visitor" ? "Client filled" : "Exhibitor added";
          const voice = lead.captureMeta?.voiceStatus;
          const summaryLine =
            voice === "processing" || voice === "saved"
              ? "Voice summary processing…"
              : lead.summary?.trim()
                ? lead.summary.trim()
                : null;
          return (
            <Link
              key={lead.id}
              to="/leads/$leadId"
              params={{ leadId: lead.id }}
              className="block rounded-xl border border-border bg-card p-4 shadow-card transition-transform active:scale-[0.99]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-semibold text-foreground">{lead.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {lead.designation} · {lead.company}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <PriorityBadge priority={lead.priority} />
                  <SyncDot synced={lead.synced} />
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                    lead.filledBy === "visitor"
                      ? "bg-warm-soft text-warning-foreground"
                      : "bg-secondary text-muted-foreground",
                  )}
                >
                  {who}
                </span>
                {lead.interests.map((t) => (
                  <Tag key={t}>{t}</Tag>
                ))}
              </div>
              {summaryLine ? (
                <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{summaryLine}</p>
              ) : null}
            </Link>
          );
        })}

        {filtered.length === 0 && (
          <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
            <SearchX className="mx-auto size-8 text-muted-foreground" />
            <p className="mt-3 text-sm font-semibold text-foreground">No leads match your filter</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Try a different priority, interest or search term.
            </p>
            <Button variant="outline" className="mt-4 rounded-xl" onClick={clear}>
              Clear filters
            </Button>
          </div>
        )}
      </div>
    </AppShell>
  );
}
