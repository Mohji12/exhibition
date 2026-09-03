import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  deleteAdminLead,
  exportAdminLeadsCsv,
  exportAdminLeadsXlsx,
  fetchAdminLeads,
  getApiBase,
} from "@/lib/api/http-client";
import { useAuth } from "@/lib/auth";
import { readSession } from "@/lib/auth-session";
import type { AdminLeadFilters, CaptureSource, Lead, Priority } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type LeadsSearch = {
  q?: string;
  priority?: Priority;
  synced?: "true" | "false";
  source?: CaptureSource | "unknown";
  capturedBy?: string;
};

export const Route = createFileRoute("/admin/leads")({
  validateSearch: (search: Record<string, unknown>): LeadsSearch => ({
    q: typeof search.q === "string" ? search.q : undefined,
    priority:
      search.priority === "hot" || search.priority === "warm" || search.priority === "cold"
        ? search.priority
        : undefined,
    synced: search.synced === "true" || search.synced === "false" ? search.synced : undefined,
    source:
      search.source === "qr" ||
      search.source === "card" ||
      search.source === "manual" ||
      search.source === "unknown"
        ? search.source
        : undefined,
    capturedBy: typeof search.capturedBy === "string" ? search.capturedBy : undefined,
  }),
  head: () => ({
    meta: [{ title: "Admin leads — Conninter" }],
  }),
  component: AdminLeadsPage,
});

function searchToFilters(search: LeadsSearch): AdminLeadFilters {
  return {
    q: search.q,
    priority: search.priority,
    synced: search.synced === undefined ? undefined : search.synced === "true",
    source: search.source,
    capturedBy: search.capturedBy,
  };
}

function AdminLeadsPage() {
  const { session, ready } = useAuth();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const [leads, setLeads] = useState<Lead[]>([]);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Lead | null>(null);
  const [busy, setBusy] = useState(false);
  const [qDraft, setQDraft] = useState(search.q ?? "");

  const filters = searchToFilters(search);

  const reload = () =>
    fetchAdminLeads(filters)
      .then((rows) => {
        setLeads(rows);
        setSelected((prev) => (prev ? rows.find((l) => l.id === prev.id) ?? null : null));
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load leads"));

  useEffect(() => {
    if (!ready || session?.user.role !== "Admin") return;
    setQDraft(search.q ?? "");
    setError("");
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when search/auth changes
  }, [ready, session?.user.role, search.q, search.priority, search.synced, search.source, search.capturedBy]);

  const patchSearch = (patch: Partial<LeadsSearch>) => {
    void navigate({
      search: (prev) => {
        const next = { ...prev, ...patch };
        for (const key of Object.keys(next) as (keyof LeadsSearch)[]) {
          if (next[key] === undefined || next[key] === "") delete next[key];
        }
        return next;
      },
    });
  };

  const onExport = async () => {
    setBusy(true);
    try {
      const blob = await exportAdminLeadsCsv(filters);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "conninter-leads.csv";
      a.click();
      URL.revokeObjectURL(url);
      toast.success("CSV exported");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Export failed");
    } finally {
      setBusy(false);
    }
  };

  const onExportExcel = async () => {
    setBusy(true);
    try {
      const blob = await exportAdminLeadsXlsx(filters);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "conninter-leads.xlsx";
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Excel exported");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Excel export failed");
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (lead: Lead) => {
    if (!window.confirm(`Delete lead ${lead.name}?`)) return;
    setBusy(true);
    try {
      await deleteAdminLead(lead.id);
      toast.success("Lead deleted");
      setSelected(null);
      await reload();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Conninter</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-foreground">Leads</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Search, filter and export every booth capture.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="h-10 rounded-xl"
            disabled={busy}
            onClick={() => void onExport()}
          >
            Export CSV
          </Button>
          <Button className="h-10 rounded-xl" disabled={busy} onClick={() => void onExportExcel()}>
            Export Excel
          </Button>
        </div>
      </div>

      <form
        className="mt-6 flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center"
        onSubmit={(e) => {
          e.preventDefault();
          patchSearch({ q: qDraft.trim() || undefined });
        }}
      >
        <Input
          value={qDraft}
          onChange={(e) => setQDraft(e.target.value)}
          placeholder="Search name, company, email…"
          className="h-10 max-w-sm rounded-xl"
        />
        <select
          className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
          value={search.priority ?? ""}
          onChange={(e) =>
            patchSearch({
              priority: (e.target.value || undefined) as Priority | undefined,
            })
          }
        >
          <option value="">All priorities</option>
          <option value="hot">Hot</option>
          <option value="warm">Warm</option>
          <option value="cold">Cold</option>
        </select>
        <select
          className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
          value={search.source ?? ""}
          onChange={(e) =>
            patchSearch({
              source: (e.target.value || undefined) as LeadsSearch["source"],
            })
          }
        >
          <option value="">All sources</option>
          <option value="qr">QR</option>
          <option value="card">Card</option>
          <option value="manual">Manual</option>
          <option value="unknown">Unknown</option>
        </select>
        <select
          className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
          value={search.synced ?? ""}
          onChange={(e) =>
            patchSearch({
              synced: (e.target.value || undefined) as LeadsSearch["synced"],
            })
          }
        >
          <option value="">All sync states</option>
          <option value="true">Synced</option>
          <option value="false">Unsynced</option>
        </select>
        <Button type="submit" variant="outline" className="h-10 rounded-xl">
          Apply
        </Button>
        {search.capturedBy ? (
          <Button
            type="button"
            variant="ghost"
            className="h-10 rounded-xl"
            onClick={() => patchSearch({ capturedBy: undefined })}
          >
            Clear capturer filter
          </Button>
        ) : null}
      </form>

      {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="overflow-x-auto border-y border-border">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-[0.12em] text-muted-foreground">
                <th className="py-3 pr-3 font-medium">Name</th>
                <th className="py-3 pr-3 font-medium">Company</th>
                <th className="py-3 pr-3 font-medium">Priority</th>
                <th className="py-3 pr-3 font-medium">Source</th>
                <th className="py-3 pr-3 font-medium">Capturer</th>
                <th className="py-3 font-medium">Sync</th>
              </tr>
            </thead>
            <tbody>
              {leads.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-muted-foreground">
                    No leads match these filters.
                  </td>
                </tr>
              ) : (
                leads.map((lead) => (
                  <tr
                    key={lead.id}
                    className={cn(
                      "cursor-pointer border-b border-border/70 transition-colors hover:bg-secondary/50",
                      selected?.id === lead.id && "bg-primary-soft/60",
                    )}
                    onClick={() => setSelected(lead)}
                  >
                    <td className="py-3 pr-3 font-medium text-foreground">{lead.name}</td>
                    <td className="py-3 pr-3 text-muted-foreground">{lead.company}</td>
                    <td className="py-3 pr-3 capitalize">{lead.priority}</td>
                    <td className="py-3 pr-3">{lead.captureSource ?? "—"}</td>
                    <td className="py-3 pr-3">{lead.capturerName ?? "—"}</td>
                    <td className="py-3">{lead.synced ? "Synced" : "Pending"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <aside className="rounded-2xl border border-border bg-card p-4 shadow-card">
          {selected ? (
            <div className="space-y-3 text-sm">
              <p className="text-lg font-semibold text-foreground">{selected.name}</p>
              <p className="text-muted-foreground">{selected.company}</p>
              <dl className="space-y-2">
                <Row label="Email" value={selected.email} />
                <Row label="Mobile" value={selected.mobile} />
                <Row label="City" value={selected.city} />
                <Row label="Priority" value={selected.priority} />
                <Row label="Source" value={selected.captureSource ?? "—"} />
                <Row label="Capturer" value={selected.capturerName ?? "—"} />
                <Row label="Captured" value={selected.capturedAt} />
                <Row label="Interests" value={selected.interests.join(", ") || "—"} />
              </dl>
              {selected.summary ? (
                <p className="rounded-xl bg-secondary/70 p-3 text-xs leading-relaxed text-foreground">
                  {selected.summary}
                </p>
              ) : null}
              {selected.captureMeta?.cardImageId || selected.captureSource === "card" ? (
                <a
                  className="block text-xs font-medium text-primary underline"
                  href={`${getApiBase()}/api/admin/leads/${encodeURIComponent(selected.id)}/card-image`}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => {
                    const token = readSession()?.token;
                    if (!token) return;
                    e.preventDefault();
                    void fetch(
                      `${getApiBase()}/api/admin/leads/${encodeURIComponent(selected.id)}/card-image`,
                      { headers: { Authorization: `Bearer ${token}` } },
                    )
                      .then(async (res) => {
                        if (!res.ok) throw new Error("No card image");
                        return res.blob();
                      })
                      .then((blob) => {
                        const url = URL.createObjectURL(blob);
                        window.open(url, "_blank", "noopener");
                      })
                      .catch(() => toast.message("No card image on file"));
                  }}
                >
                  View card photo backup
                </a>
              ) : null}
              <div className="flex flex-col gap-2 pt-2">
                <Button variant="outline" className="rounded-xl" asChild>
                  <Link to="/leads/$leadId" params={{ leadId: selected.id }}>
                    Open in visitor book
                  </Link>
                </Button>
                <Button
                  variant="destructive"
                  className="rounded-xl"
                  disabled={busy}
                  onClick={() => void onDelete(selected)}
                >
                  Delete lead
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Select a lead to see details.</p>
          )}
        </aside>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium capitalize text-foreground">{value}</dd>
    </div>
  );
}
