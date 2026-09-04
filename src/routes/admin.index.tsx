import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageLoader } from "@/components/PageLoader";
import { fetchAdminOverview } from "@/lib/api/http-client";
import { useAuth } from "@/lib/auth";
import type { AdminOverview } from "@/lib/types";

export const Route = createFileRoute("/admin/")({
  head: () => ({
    meta: [{ title: "Admin overview — Conninter" }],
  }),
  component: AdminOverviewPage,
});

function AdminOverviewPage() {
  const { session, ready } = useAuth();
  const [data, setData] = useState<AdminOverview | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready || session?.user.role !== "Admin") return;
    let cancelled = false;
    setLoading(true);
    fetchAdminOverview()
      .then((next) => {
        if (!cancelled) setData(next);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load overview");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ready, session?.user.role]);

  const syncPct =
    data && data.leads > 0 ? Math.round((data.syncedLeads / data.leads) * 100) : data ? 100 : undefined;

  return (
    <div className="mx-auto max-w-4xl">
      <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Conninter</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight text-foreground">Booth today</h1>
      <p className="mt-2 max-w-xl text-sm text-muted-foreground">
        Staff, lead quality, capture sources and follow-ups. QR invite creates exhibitors; each
        exhibitor only sees their own visitor leads.
      </p>

      {error ? <p className="mt-6 text-sm text-destructive">{error}</p> : null}
      {loading ? (
        <PageLoader label="Loading overview…" />
      ) : (
        <>
      <dl className="mt-10 grid grid-cols-2 gap-x-8 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
        <Stat label="Active staff" value={data?.staffActive} />
        <Stat label="Admins" value={data?.admins} />
        <Stat label="Leads" value={data?.leads} />
        <Stat label="Sync %" value={syncPct} suffix="%" />
        <Stat label="Hot" value={data?.hotLeads} />
        <Stat label="Warm" value={data?.warmLeads} />
        <Stat label="Cold" value={data?.coldLeads} />
        <Stat label="Pending follow-ups" value={data?.pendingFollowUps} />
        <Stat label="Synced" value={data?.syncedLeads} />
        <Stat label="Unsynced" value={data?.unsyncedLeads} />
      </dl>

      <section className="mt-12">
        <h2 className="text-lg font-semibold text-foreground">Capture sources</h2>
        <p className="mt-1 text-sm text-muted-foreground">How booth staff captured visitor details.</p>
        <dl className="mt-5 grid grid-cols-2 gap-6 sm:grid-cols-4">
          <Stat label="QR" value={data?.bySource.qr} />
          <Stat label="Card" value={data?.bySource.card} />
          <Stat label="Manual" value={data?.bySource.manual} />
          <Stat label="Unknown" value={data?.bySource.unknown} />
        </dl>
      </section>

      <section className="mt-12">
        <h2 className="text-lg font-semibold text-foreground">Top interests</h2>
        <p className="mt-1 text-sm text-muted-foreground">Most selected product tags across leads.</p>
        <ul className="mt-5 divide-y divide-border border-y border-border">
          {(data?.topInterests ?? []).length === 0 ? (
            <li className="py-4 text-sm text-muted-foreground">No interest tags on leads yet.</li>
          ) : (
            data?.topInterests.map((item) => (
              <li key={item.name} className="flex items-center justify-between py-3 text-sm">
                <span className="font-medium text-foreground">{item.name}</span>
                <span className="tabular-nums text-muted-foreground">{item.count}</span>
              </li>
            ))
          )}
        </ul>
      </section>

      <section className="mt-12">
        <h2 className="text-lg font-semibold text-foreground">Appointments</h2>
        <dl className="mt-5 grid grid-cols-3 gap-6">
          <Stat label="Confirmed" value={data?.appointmentsByStatus.confirmed} />
          <Stat label="Pending" value={data?.appointmentsByStatus.pending} />
          <Stat label="Rescheduled" value={data?.appointmentsByStatus.rescheduled} />
        </dl>
      </section>

      <p className="mt-12 text-sm text-muted-foreground">
        <Link to="/admin/leads" className="font-medium text-primary underline-offset-4 hover:underline">
          Browse leads
        </Link>
        {" · "}
        <Link to="/admin/followups" className="font-medium text-primary underline-offset-4 hover:underline">
          Manage follow-ups
        </Link>
        {" · "}
        <Link to="/admin/invite" className="font-medium text-primary underline-offset-4 hover:underline">
          Invite exhibitors
        </Link>
      </p>
        </>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  suffix,
}: {
  label: string;
  value: number | undefined;
  suffix?: string;
}) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-3xl font-semibold tabular-nums text-foreground sm:text-4xl">
        {value === undefined ? "—" : `${value}${suffix ?? ""}`}
      </dd>
    </div>
  );
}
