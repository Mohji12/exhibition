import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { PageLoader, InlineLoader } from "@/components/PageLoader";
import {
  deleteAdminLead,
  exportAdminLeadsCsv,
  exportAdminLeadsXlsx,
  fetchAdminLeads,
  fetchAdminUsers,
  getApiBase,
} from "@/lib/api/http-client";
import { useAuth } from "@/lib/auth";
import { readSession } from "@/lib/auth-session";
import type { AdminLeadFilters, AuthUser, CaptureSource, FilledBy, Lead, Priority } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type LeadsSearch = {
  q?: string;
  priority?: Priority;
  synced?: "true" | "false";
  source?: CaptureSource | "unknown";
  capturedBy?: string;
  filledBy?: FilledBy;
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
    filledBy:
      search.filledBy === "exhibitor" || search.filledBy === "visitor"
        ? search.filledBy
        : undefined,
  }),
  head: () => ({
    meta: [{ title: "Admin leads — FUNNEL" }],
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
    filledBy: search.filledBy,
  };
}

function AdminLeadsPage() {
  const { session, ready } = useAuth();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const [exhibitors, setExhibitors] = useState<AuthUser[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [error, setError] = useState("");
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingLeads, setLoadingLeads] = useState(false);
  const [selected, setSelected] = useState<Lead | null>(null);
  const [busy, setBusy] = useState(false);
  const [qDraft, setQDraft] = useState(search.q ?? "");
  const [exhibitorQuery, setExhibitorQuery] = useState("");

  const filters = searchToFilters(search);
  const exhibitorId = search.capturedBy;
  const selectedExhibitor = useMemo(
    () => exhibitors.find((u) => u.id === exhibitorId) ?? null,
    [exhibitors, exhibitorId],
  );

  useEffect(() => {
    if (!ready || session?.user.role !== "Admin") return;
    let cancelled = false;
    setLoadingUsers(true);
    fetchAdminUsers()
      .then((users) => {
        if (!cancelled) setExhibitors(users.filter((u) => u.role === "Rep"));
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load exhibitors");
      })
      .finally(() => {
        if (!cancelled) setLoadingUsers(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ready, session?.user.role]);

  const reloadLeads = () => {
    if (!exhibitorId) {
      setLeads([]);
      setSelected(null);
      setLoadingLeads(false);
      return Promise.resolve();
    }
    setLoadingLeads(true);
    return fetchAdminLeads(filters)
      .then((rows) => {
        setLeads(rows);
        setSelected((prev) => (prev ? rows.find((l) => l.id === prev.id) ?? null : null));
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load leads"))
      .finally(() => setLoadingLeads(false));
  };

  useEffect(() => {
    if (!ready || session?.user.role !== "Admin") return;
    setQDraft(search.q ?? "");
    setError("");
    if (!exhibitorId) {
      setLeads([]);
      setSelected(null);
      return;
    }
    void reloadLeads();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when search/auth changes
  }, [
    ready,
    session?.user.role,
    search.q,
    search.priority,
    search.synced,
    search.source,
    search.capturedBy,
  ]);

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

  const selectExhibitor = (userId: string) => {
    setSelected(null);
    patchSearch({
      capturedBy: userId,
      q: undefined,
      priority: undefined,
      synced: undefined,
      source: undefined,
    });
    setQDraft("");
  };

  const clearExhibitor = () => {
    setSelected(null);
    setLeads([]);
    patchSearch({
      capturedBy: undefined,
      q: undefined,
      priority: undefined,
      synced: undefined,
      source: undefined,
    });
    setQDraft("");
  };

  const onExport = async () => {
    if (!exhibitorId) return;
    setBusy(true);
    try {
      const blob = await exportAdminLeadsCsv(filters);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `conninter-leads-${selectedExhibitor?.name ?? "exhibitor"}.csv`;
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
    if (!exhibitorId) return;
    setBusy(true);
    try {
      const blob = await exportAdminLeadsXlsx(filters);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `conninter-leads-${selectedExhibitor?.name ?? "exhibitor"}.xlsx`;
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
      await reloadLeads();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  };

  const filteredExhibitors = useMemo(() => {
    const q = exhibitorQuery.trim().toLowerCase();
    if (!q) return exhibitors;
    return exhibitors.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.company ?? "").toLowerCase().includes(q),
    );
  }, [exhibitors, exhibitorQuery]);

  if (!exhibitorId) {
    return (
      <div className="mx-auto max-w-3xl">
        <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">FUNNEL</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-foreground">Leads</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Each lead belongs to one exhibitor. Select an exhibitor to view and export their visitor
          data.
        </p>

        {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}

        <div className="mt-6">
          <Input
            value={exhibitorQuery}
            onChange={(e) => setExhibitorQuery(e.target.value)}
            placeholder="Search exhibitor by name, email, company…"
            className="h-10 max-w-md rounded-xl"
          />
        </div>

        {loadingUsers ? <PageLoader label="Loading exhibitors…" compact className="mt-6" /> : null}

        {!loadingUsers ? (
          <ul className="mt-6 divide-y divide-border border-y border-border">
            {filteredExhibitors.length === 0 ? (
              <li className="py-8 text-sm text-muted-foreground">No exhibitors found.</li>
            ) : (
              filteredExhibitors.map((user) => {
                const count = user.leadsCaptured ?? 0;
                return (
                  <li key={user.id}>
                    <button
                      type="button"
                      className="flex w-full flex-col gap-1 py-4 text-left transition-colors hover:bg-secondary/40 sm:flex-row sm:items-center sm:justify-between"
                      onClick={() => selectExhibitor(user.id)}
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">{user.name}</p>
                        <p className="truncate text-sm text-muted-foreground">{user.email}</p>
                        {user.company ? (
                          <p className="truncate text-xs text-muted-foreground">{user.company}</p>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm tabular-nums text-muted-foreground">
                          {count} lead{count === 1 ? "" : "s"}
                        </span>
                        <span className="text-sm font-medium text-primary">View leads →</span>
                      </div>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">FUNNEL</p>
          <button
            type="button"
            className="mt-2 text-sm text-primary underline-offset-4 hover:underline"
            onClick={clearExhibitor}
          >
            ← All exhibitors
          </button>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-foreground">
            {selectedExhibitor?.name ?? "Exhibitor"} leads
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {selectedExhibitor?.email}
            {selectedExhibitor?.company ? ` · ${selectedExhibitor.company}` : ""}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            <Link
              to="/admin/clients/$userId"
              params={{ userId: exhibitorId }}
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              Open exhibitor profile
            </Link>
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="h-10 rounded-xl"
            disabled={busy || loadingLeads}
            onClick={() => void onExport()}
          >
            {busy ? <InlineLoader className="mr-1" /> : null}
            Export CSV
          </Button>
          <Button
            className="h-10 rounded-xl"
            disabled={busy || loadingLeads}
            onClick={() => void onExportExcel()}
          >
            {busy ? <InlineLoader className="mr-1" /> : null}
            Export Excel
          </Button>
        </div>
      </div>

      <form
        className="mt-6 flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center"
        onSubmit={(e) => {
          e.preventDefault();
          patchSearch({ q: qDraft.trim() || undefined, capturedBy: exhibitorId });
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
              capturedBy: exhibitorId,
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
              capturedBy: exhibitorId,
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
          value={search.filledBy ?? ""}
          onChange={(e) =>
            patchSearch({
              capturedBy: exhibitorId,
              filledBy: (e.target.value || undefined) as LeadsSearch["filledBy"],
            })
          }
        >
          <option value="">All fillers</option>
          <option value="exhibitor">Exhibitor added</option>
          <option value="visitor">Client filled</option>
        </select>
        <select
          className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
          value={search.synced ?? ""}
          onChange={(e) =>
            patchSearch({
              capturedBy: exhibitorId,
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
      </form>

      {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}

      {loadingLeads ? <PageLoader label="Loading leads…" compact className="mt-6" /> : null}

      <div className={loadingLeads ? "sr-only" : "mt-6 grid gap-6 lg:grid-cols-[1fr_320px]"}>
        <div className="overflow-x-auto border-y border-border">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-[0.12em] text-muted-foreground">
                <th className="py-3 pr-3 font-medium">Name</th>
                <th className="py-3 pr-3 font-medium">Company</th>
                <th className="py-3 pr-3 font-medium">Priority</th>
                <th className="py-3 pr-3 font-medium">Source</th>
                <th className="py-3 pr-3 font-medium">Filled by</th>
                <th className="py-3 font-medium">Sync</th>
              </tr>
            </thead>
            <tbody>
              {leads.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-muted-foreground">
                    No leads for this exhibitor yet.
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
                    <td className="py-3 pr-3">
                      {lead.filledBy === "visitor" ? "Client" : "Exhibitor"}
                    </td>
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
                <Row
                  label="Filled by"
                  value={selected.filledBy === "visitor" ? "Client filled" : "Exhibitor added"}
                />
                <Row label="Captured" value={selected.capturedAt} />
                <Row label="Interests" value={selected.interests.join(", ") || "—"} />
              </dl>
              {selected.summary ? (
                <p className="rounded-xl bg-secondary/70 p-3 text-xs leading-relaxed text-foreground">
                  {selected.summary}
                </p>
              ) : null}
              {selected.captureMeta?.cardImageId ||
              selected.captureMeta?.cardImageIdBack ||
              selected.captureSource === "card" ? (
                <div className="space-y-1">
                  <button
                    type="button"
                    className="block text-left text-xs font-medium text-primary underline"
                    onClick={() => {
                      const token = readSession()?.token;
                      if (!token) return;
                      const imageId = selected.captureMeta?.cardImageId;
                      const q = imageId ? `?image_id=${encodeURIComponent(imageId)}` : "";
                      void fetch(
                        `${getApiBase()}/api/admin/leads/${encodeURIComponent(selected.id)}/card-image${q}`,
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
                    View front card photo
                  </button>
                  {selected.captureMeta?.cardImageIdBack ? (
                    <button
                      type="button"
                      className="block text-left text-xs font-medium text-primary underline"
                      onClick={() => {
                        const token = readSession()?.token;
                        if (!token) return;
                        const imageId = selected.captureMeta?.cardImageIdBack;
                        const q = imageId ? `?image_id=${encodeURIComponent(imageId)}` : "";
                        void fetch(
                          `${getApiBase()}/api/admin/leads/${encodeURIComponent(selected.id)}/card-image${q}`,
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
                          .catch(() => toast.message("No back card image on file"));
                      }}
                    >
                      View back card photo
                    </button>
                  ) : null}
                </div>
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
