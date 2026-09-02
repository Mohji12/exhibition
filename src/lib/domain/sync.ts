import type { Lead } from "@/lib/types";

export const PENDING_STORAGE_KEY = "conninter:pending";

export type PendingQueue = {
  leads: Lead[];
  appointments: Array<{ id: string; lead: string; type: string; when: string; status: string }>;
};

export type SyncResult = {
  synced: string[];
  failed: Array<{ id: string; error: string }>;
};

export function buildSyncQueue(leads: Lead[]): Lead[] {
  return leads.filter((l) => !l.synced);
}

export function applySyncResults(leads: Lead[], result: SyncResult): Lead[] {
  const syncedSet = new Set(result.synced);
  return leads.map((l) => (syncedSet.has(l.id) ? { ...l, synced: true } : l));
}

export function markAllSynced(leads: Lead[]): Lead[] {
  return leads.map((l) => ({ ...l, synced: true }));
}

export function loadPendingQueue(): PendingQueue {
  if (typeof window === "undefined") return { leads: [], appointments: [] };
  try {
    const raw = localStorage.getItem(PENDING_STORAGE_KEY);
    if (!raw) return { leads: [], appointments: [] };
    return JSON.parse(raw) as PendingQueue;
  } catch {
    return { leads: [], appointments: [] };
  }
}

export function savePendingQueue(queue: PendingQueue): void {
  if (typeof window === "undefined") return;
  const unsyncedLeads = queue.leads.filter((l) => !l.synced);
  if (unsyncedLeads.length === 0 && queue.appointments.length === 0) {
    localStorage.removeItem(PENDING_STORAGE_KEY);
    return;
  }
  localStorage.setItem(
    PENDING_STORAGE_KEY,
    JSON.stringify({ ...queue, leads: unsyncedLeads }),
  );
}

export function upsertPendingLead(queue: PendingQueue, lead: Lead): PendingQueue {
  const leads = queue.leads.filter((l) => l.id !== lead.id);
  if (!lead.synced) leads.push(lead);
  return { ...queue, leads };
}

export function removeSyncedFromPending(queue: PendingQueue, syncedIds: string[]): PendingQueue {
  const idSet = new Set(syncedIds);
  return {
    ...queue,
    leads: queue.leads.filter((l) => !idSet.has(l.id)),
  };
}
