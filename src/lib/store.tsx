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
import { useAuth } from "@/lib/auth";

export type SeedSource = "api" | "error" | "loading";

type StoreValue = {
  leads: Lead[];
  appointments: Appointment[];
  interests: string[];
  team: TeamMember[];
  seedSource: SeedSource;
  syncing: boolean;
  lastSyncError?: string;
  saveLead: (lead: Lead) => Promise<Lead>;
  addAppointment: (a: Omit<Appointment, "id">) => Promise<void>;
  addInterest: (tag: string) => Promise<void>;
  removeInterest: (tag: string) => Promise<void>;
  syncAll: (opts?: { silent?: boolean }) => Promise<void>;
  pendingSync: number;
};

const StoreContext = createContext<StoreValue | null>(null);

function persistQueue(queue: PendingQueue) {
  savePendingQueue(queue);
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const token = session?.token;
  const [leads, setLeads] = useState<Lead[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [interests, setInterests] = useState<string[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [seedSource, setSeedSource] = useState<SeedSource>("loading");
  const [syncing, setSyncing] = useState(false);
  const [lastSyncError, setLastSyncError] = useState<string | undefined>();
  const pendingRef = useRef<PendingQueue>({ leads: [], appointments: [] });
  const leadsRef = useRef<Lead[]>([]);
  const syncingRef = useRef(false);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    leadsRef.current = leads;
  }, [leads]);

  useEffect(() => {
    let cancelled = false;
    pendingRef.current = loadPendingQueue();

    if (!token) {
      setLeads([]);
      setAppointments([]);
      setInterests([]);
      setTeam([]);
      setSeedSource("loading");
      return () => {
        cancelled = true;
      };
    }

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
  }, [token]);

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
      return synced;
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

  const syncAll = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent ?? false;

    // Flush offline card images first so lead upsert can attach cardImageId
    try {
      const { listPendingCardImages, deletePendingCardImage } = await import(
        "@/lib/domain/capture/card-image-store"
      );
      const { uploadCardImage } = await import("@/lib/api/http-client");
      const pendingImages = await listPendingCardImages();
      for (const img of pendingImages) {
        try {
          const uploaded = await uploadCardImage({
            imageBase64: img.imageBase64,
            mimeType: img.mimeType,
            leadId: img.leadId,
          });
          if (uploaded.ok && uploaded.id) {
            await deletePendingCardImage(img.key);
            if (img.leadId) {
              const isBack = img.side === "back" || img.key.includes(":back:");
              const withImageMeta = (l: Lead): Lead => ({
                ...l,
                captureMeta: {
                  ...l.captureMeta,
                  ...(isBack
                    ? { cardImageIdBack: uploaded.id }
                    : { cardImageId: uploaded.id }),
                },
                synced: false,
              });
              setLeads((prev) => prev.map((l) => (l.id === img.leadId ? withImageMeta(l) : l)));
              const lead = leadsRef.current.find((l) => l.id === img.leadId);
              if (lead) {
                const withImage = withImageMeta(lead);
                leadsRef.current = leadsRef.current.map((l) =>
                  l.id === img.leadId ? withImage : l,
                );
                pendingRef.current = upsertPendingLead(pendingRef.current, withImage);
                persistQueue(pendingRef.current);
              }
            }
          }
        } catch {
          /* keep in IndexedDB */
        }
      }
    } catch {
      /* IndexedDB unavailable */
    }

    // Flush offline audio backups: upload → reprocess → attach to lead
    try {
      const { listPendingAudio, deletePendingAudio, putPendingAudio } = await import(
        "@/lib/domain/capture/audio-store"
      );
      const { uploadAudio, reprocessAudio } = await import("@/lib/api/http-client");
      const { summarizeTranscript } = await import("@/lib/domain/capture/summarize-transcript");
      const pendingAudio = await listPendingAudio();
      for (const clip of pendingAudio) {
        try {
          let audioId = clip.audioId;
          if (!audioId) {
            const uploaded = await uploadAudio({
              audioBase64: clip.audioBase64,
              mimeType: clip.mimeType,
              leadId: clip.leadId,
            });
            if (!uploaded.ok || !uploaded.id) continue;
            audioId = uploaded.id;
            await putPendingAudio({ ...clip, audioId, status: "uploaded" });
          }

          const result = await reprocessAudio(audioId, clip.liveTranscript);
          const transcript =
            result.transcript || clip.liveTranscript || "";
          const nextSummary =
            result.summary || (transcript ? summarizeTranscript(transcript) : "");

          if (clip.leadId) {
            const patchLead = (l: Lead): Lead => {
              const meta = {
                ...l.captureMeta,
                audioId,
                audioKey: clip.key,
                liveTranscript: clip.liveTranscript || l.captureMeta?.liveTranscript,
                transcript: transcript || l.captureMeta?.transcript,
                voiceStatus: result.ok || transcript ? ("ready" as const) : ("failed" as const),
                processingNote: !(result.ok || transcript),
                voiceError:
                  result.ok || transcript
                    ? undefined
                    : "Could not finish automatically. Your recording and live notes are kept.",
              };
              const summary =
                !l.summary.trim() || l.summary === summarizeTranscript(clip.liveTranscript || "")
                  ? nextSummary || l.summary
                  : l.summary;
              return { ...l, summary, captureMeta: meta, synced: false };
            };
            setLeads((prev) => prev.map((l) => (l.id === clip.leadId ? patchLead(l) : l)));
            const lead = leadsRef.current.find((l) => l.id === clip.leadId);
            if (lead) {
              const next = patchLead(lead);
              leadsRef.current = leadsRef.current.map((l) => (l.id === clip.leadId ? next : l));
              pendingRef.current = upsertPendingLead(pendingRef.current, next);
              persistQueue(pendingRef.current);
            }
          }

          if (result.ok || transcript) {
            await deletePendingAudio(clip.key);
          }
        } catch {
          /* keep in IndexedDB for next reconnect */
        }
      }
    } catch {
      /* IndexedDB unavailable */
    }

    const queue = buildSyncQueue(leadsRef.current);
    if (queue.length === 0) return;
    if (syncingRef.current) return;

    syncingRef.current = true;
    setSyncing(true);
    try {
      const result = await syncPendingLeads(queue);
      setLeads((prev) => applySyncResults(prev, result));
      pendingRef.current = removeSyncedFromPending(pendingRef.current, result.synced);
      persistQueue(pendingRef.current);

      if (result.failed.length === 0) {
        setLastSyncError(undefined);
        if (!silent && result.synced.length > 0) {
          toast.success(`${result.synced.length} lead${result.synced.length === 1 ? "" : "s"} synced`);
        }
      } else {
        const msg = `${result.failed.length} failed — retry later`;
        setLastSyncError(msg);
        if (!silent) {
          toast.warning(`${result.synced.length} synced, ${result.failed.length} failed`, {
            description: result.failed[0]?.error,
          });
        }
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Sync failed";
      setLastSyncError(msg);
      if (!silent) toast.error("Sync failed", { description: msg });
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }, []);

  const scheduleFlush = useCallback(
    (opts?: { silent?: boolean }) => {
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
      flushTimerRef.current = setTimeout(() => {
        void syncAll({ silent: opts?.silent ?? true });
      }, 400);
    },
    [syncAll],
  );

  // Flush pending leads after seed load, on reconnect, and when tab becomes visible.
  useEffect(() => {
    if (!token) return;

    const maybeFlush = (silent: boolean) => {
      if (typeof navigator !== "undefined" && !navigator.onLine) return;
      const hasPending =
        pendingRef.current.leads.some((l) => !l.synced) ||
        leadsRef.current.some((l) => !l.synced) ||
        leadsRef.current.some(
          (l) =>
            l.captureMeta?.voiceStatus === "processing" ||
            l.captureMeta?.voiceStatus === "saved" ||
            l.captureMeta?.processingNote,
        );
      // Always attempt media flush on reconnect; syncAll no-ops lead queue if empty
      scheduleFlush({ silent });
      void hasPending;
    };

    const bootTimer = setTimeout(() => maybeFlush(true), 800);

    const onOnline = () => scheduleFlush({ silent: false });
    const onVisibility = () => {
      if (document.visibilityState === "visible") maybeFlush(true);
    };

    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      clearTimeout(bootTimer);
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [token, scheduleFlush]);

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
