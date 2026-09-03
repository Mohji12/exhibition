import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { fetchAdminAppointments, patchAdminAppointment } from "@/lib/api/http-client";
import { useAuth } from "@/lib/auth";
import type { Appointment } from "@/lib/types";

export const Route = createFileRoute("/admin/followups")({
  head: () => ({
    meta: [{ title: "Admin follow-ups — Conninter" }],
  }),
  component: AdminFollowupsPage,
});

function AdminFollowupsPage() {
  const { session, ready } = useAuth();
  const [items, setItems] = useState<Appointment[]>([]);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = () =>
    fetchAdminAppointments()
      .then(setItems)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Could not load appointments"),
      );

  useEffect(() => {
    if (!ready || session?.user.role !== "Admin") return;
    void reload();
  }, [ready, session?.user.role]);

  const onStatus = async (appt: Appointment, status: Appointment["status"]) => {
    setBusyId(appt.id);
    setError("");
    try {
      const next = await patchAdminAppointment(appt.id, { status });
      setItems((prev) => prev.map((item) => (item.id === next.id ? next : item)));
      toast.success(`${next.lead} → ${next.status}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Update failed";
      setError(message);
      toast.error(message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Conninter</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight text-foreground">Follow-ups</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Booth appointments scheduled with visitors. Update status as meetings move.
      </p>
      {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}

      <ul className="mt-8 divide-y divide-border border-y border-border">
        {items.length === 0 ? (
          <li className="py-8 text-sm text-muted-foreground">No appointments yet.</li>
        ) : (
          items.map((appt) => (
            <li
              key={appt.id}
              className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="font-medium text-foreground">{appt.lead}</p>
                <p className="text-sm text-muted-foreground">
                  {appt.type} · {appt.when}
                </p>
              </div>
              <select
                className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
                value={appt.status}
                disabled={busyId === appt.id}
                onChange={(e) => void onStatus(appt, e.target.value as Appointment["status"])}
              >
                <option value="Confirmed">Confirmed</option>
                <option value="Pending">Pending</option>
                <option value="Rescheduled">Rescheduled</option>
              </select>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
