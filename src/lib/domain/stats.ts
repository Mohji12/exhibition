import type { Appointment, Lead } from "@/lib/types";

export type CaptureStats = {
  captured: number;
  hot: number;
  followUps: number;
  synced: number;
  syncPct: number;
  pendingSync: number;
};

export function computeCaptureStats(leads: Lead[], appointments: Appointment[]): CaptureStats {
  const captured = leads.length;
  const hot = leads.filter((l) => l.priority === "hot").length;
  const followUps = appointments.filter((a) => a.status === "Pending").length;
  const synced = leads.filter((l) => l.synced).length;
  const pendingSync = leads.filter((l) => !l.synced).length;
  const syncPct = captured ? Math.round((synced / captured) * 100) : 0;
  return { captured, hot, followUps, synced, syncPct, pendingSync };
}
