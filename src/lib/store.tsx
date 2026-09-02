import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import {
  addInterestTag,
  fetchSeedData,
  removeInterestTag,
  syncPendingLeads,
  upsertAppointment,
  upsertLead,
} from "@/lib/api/http-client";
import { mergeLead } from "@/lib/domain/leads";
import {
  applySyncResults,
  buildSyncQueue,
  loadPendingQueue,
  removeSyncedFromPending,
  savePendingQueue,
  upsertPendingLead,
  type PendingQueue,
} from "@/lib/domain/sync";
import type { Appointment, Lead, TeamMember } from "./types";

export type SeedSource = "api" | "error" | "loading";

type StoreValue = {
  leads: Lead[];
  appointments: Appointment[];
  interests: string[];
  team: TeamMember[];
  seedSource: SeedSource;
  syncing: boolean;
  lastSyncError?: string;
  saveLead: (lead: Lead) => Promise<void>;
  addAppointment: (a: Omit<Appointment, "id">) => Promise<void>;
  addInterest: (tag: string) => Promise<void>;
  removeInterest: (tag: string) => Promise<void>;
  syncAll: () => Promise<void>;
  pendingSync: number;
};

const StoreContext = createContext<StoreValue | null>(null);

function persistQueue(queue: PendingQueue) {
  savePendingQueue(queue);
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [interests, setInterests] = useState<string[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [seedSource, setSeedSource] = useState<SeedSource>("loading");
  const [syncing, setSyncing] = useState(false);
  const [lastSyncError, setLastSyncError] = useState<string | undefined>();
  const pendingRef = useRef<PendingQueue>({ leads: [], appointments: [] });

  useEffect(() => {
    let cancelled = false;
    pendingRef.current = loadPendingQueue();

    fetchSeedData()
      .then((data) => {
        if (cancelled) return;
        if (data) {
          const mergedLeads = [...data.leads];
          for (const pending of pendingRef.current.leads) {
            if (!pending.synced) {
              const idx = mergedLeads.findIndex((l) => l.id === pending.id);
              if (idx >= 0) mergedLeads[idx] = pending;
              else mergedLeads.unshift(pending);
            }
          }
          setLeads(mergedLeads);
          setAppointments(data.appointments);
          setInterests(data.interests);
          setTeam(data.team);
          setSeedSource("api");
        } else {
          const pending = pendingRef.current;
          setAppointments([]);
          setInterests([]);
          setTeam([]);
          if (pending.leads.length) {
            setLeads(pending.leads);
          } else {
            setLeads([]);
          }
          setSeedSource("error");
          setLastSyncError("Could not load data from the backend");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLeads(pendingRef.current.leads);
          setAppointments([]);
          setInterests([]);
          setTeam([]);
          setSeedSource("error");
          setLastSyncError("Could not connect to the backend");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const trySyncLead = useCallback(async (lead: Lead): Promise<Lead> => {
    try {
      const result = await upsertLead(lead);
      if (result.ok) {
        pendingRef.current = removeSyncedFromPending(pendingRef.current, [result.lead.id]);
        persistQueue(pendingRef.current);
        setLastSyncError(undefined);
        return result.lead;
      }
      setLastSyncError(result.error);
      return { ...lead, synced: false };
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Sync failed";
      setLastSyncError(msg);
      return { ...lead, synced: false };
    }
  }, []);

  const saveLead = useCallback(
    async (lead: Lead) => {
      const unsynced = { ...lead, synced: false };
      setLeads((prev) => mergeLead(prev, unsynced));
      pendingRef.current = upsertPendingLead(pendingRef.current, unsynced);
      persistQueue(pendingRef.current);

      const synced = await trySyncLead(unsynced);
      setLeads((prev) => mergeLead(prev, synced));
    },
    [trySyncLead],
  );

  const addAppointment = useCallback(async (a: Omit<Appointment, "id">) => {
    const draft: Appointment = { ...a, id: `a${Date.now()}` };
    setAppointments((prev) => [draft, ...prev]);

    try {
      const result = await upsertAppointment(draft);
      if (result.ok) {
        setAppointments((prev) =>
          prev.map((appt) => (appt.id === draft.id ? result.appointment : appt)),
        );
        setLastSyncError(undefined);
      } else {
        setLastSyncError(result.error);
        toast.error("Appointment saved locally", { description: result.error });
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to sync appointment";
      setLastSyncError(msg);
    }
  }, []);

  const addInterest = useCallback(async (tag: string) => {
    const trimmed = tag.trim();
    if (!trimmed) return;
    setInterests((prev) => (prev.includes(trimmed) ? prev : [...prev, trimmed]));
    try {
      const result = await addInterestTag(trimmed);
      if (!result.ok) {
        setInterests((prev) => prev.filter((t) => t !== trimmed));
        toast.error(result.error);
        setLastSyncError(result.error);
      }
    } catch (error) {
      setInterests((prev) => prev.filter((t) => t !== trimmed));
      setLastSyncError(error instanceof Error ? error.message : "Failed to add tag");
    }
  }, []);

  const removeInterest = useCallback(async (tag: string) => {
    setInterests((prev) => prev.filter((t) => t !== tag));
    try {
      const result = await removeInterestTag(tag);
      if (!result.ok) {
        setInterests((prev) => (prev.includes(tag) ? prev : [...prev, tag]));
        toast.error(result.error);
        setLastSyncError(result.error);
      }
    } catch (error) {
      setInterests((prev) => (prev.includes(tag) ? prev : [...prev, tag]));
      setLastSyncError(error instanceof Error ? error.message : "Failed to remove tag");
    }
  }, []);

  const syncAll = useCallback(async () => {
    const queue = buildSyncQueue(leads);
    if (queue.length === 0) return;

    setSyncing(true);
    try {
      const result = await syncPendingLeads(queue);
      setLeads((prev) => applySyncResults(prev, result));
      pendingRef.current = removeSyncedFromPending(pendingRef.current, result.synced);
      persistQueue(pendingRef.current);

      if (result.failed.length === 0) {
        setLastSyncError(undefined);
        toast.success(`${result.synced.length} lead${result.synced.length === 1 ? "" : "s"} synced`);
      } else {
        const msg = `${result.failed.length} failed — retry later`;
        setLastSyncError(msg);
        toast.warning(`${result.synced.length} synced, ${result.failed.length} failed`, {
          description: result.failed[0]?.error,
        });
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Sync failed";
      setLastSyncError(msg);
      toast.error("Sync failed", { description: msg });
    } finally {
      setSyncing(false);
    }
  }, [leads]);

  const value = useMemo<StoreValue>(
    () => ({
      leads,
      appointments,
      interests,
      team,
      seedSource,
      syncing,
      lastSyncError,
      saveLead,
      addAppointment,
      addInterest,
      removeInterest,
      syncAll,
      pendingSync: leads.filter((l) => !l.synced).length,
    }),
    [
      leads,
      appointments,
      interests,
      team,
      seedSource,
      syncing,
      lastSyncError,
      saveLead,
      addAppointment,
      addInterest,
      removeInterest,
      syncAll,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
