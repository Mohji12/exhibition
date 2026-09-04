import type { CaptureMeta, CaptureSource, Lead } from "@/lib/types";

export const DRAFT_LEAD_KEY = "conninter:draft-lead";
export const RECAPTURE_BASE_KEY = "conninter:recapture-base";

export type LeadDraft = {
  lead: Partial<Lead>;
  captureSource: CaptureSource;
  captureMeta?: CaptureMeta;
  fieldConfidence?: Partial<Record<keyof Lead, number>>;
};

export function saveLeadDraft(draft: LeadDraft): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(DRAFT_LEAD_KEY, JSON.stringify(draft));
}

export function loadLeadDraft(): LeadDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(DRAFT_LEAD_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as LeadDraft;
  } catch {
    return null;
  }
}

export function clearLeadDraft(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(DRAFT_LEAD_KEY);
}

/** Snapshot of the lead being re-captured so notes / priority / voice are kept. */
export function saveRecaptureBase(lead: Lead): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(RECAPTURE_BASE_KEY, JSON.stringify(lead));
}

export function loadRecaptureBase(): Lead | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(RECAPTURE_BASE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Lead;
  } catch {
    return null;
  }
}

export function clearRecaptureBase(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(RECAPTURE_BASE_KEY);
}

const VOICE_META_KEYS = [
  "transcript",
  "liveTranscript",
  "audioId",
  "audioKey",
  "voiceStatus",
  "voiceError",
] as const;

export function mergeVoiceMeta(
  existing?: CaptureMeta,
  next?: CaptureMeta,
): CaptureMeta | undefined {
  if (!existing && !next) return undefined;
  const preserved: CaptureMeta = {};
  for (const key of VOICE_META_KEYS) {
    const value = existing?.[key];
    if (value != null && value !== "") {
      (preserved as Record<string, unknown>)[key] = value;
    }
  }
  return { ...preserved, ...next };
}

export function mergeDraftIntoLead(base: Lead, draft: LeadDraft): Lead {
  const next: Lead = {
    ...base,
    ...draft.lead,
    id: draft.lead.id || base.id,
    interests: draft.lead.interests ?? base.interests,
    priority: draft.lead.priority ?? base.priority,
    summary: draft.lead.summary ?? base.summary,
    synced: false,
    capturedAt: draft.lead.capturedAt ?? base.capturedAt ?? "Just now",
    captureSource: draft.captureSource,
  };
  const consent = draft.lead.consentAt ?? base.consentAt;
  if (consent) next.consentAt = consent;
  const meta = mergeVoiceMeta(base.captureMeta, draft.captureMeta);
  if (meta) next.captureMeta = meta;
  const confidence = draft.fieldConfidence ?? base.fieldConfidence;
  if (confidence) next.fieldConfidence = confidence;
  return next;
}
