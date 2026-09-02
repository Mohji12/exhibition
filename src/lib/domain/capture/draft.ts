import type { CaptureMeta, CaptureSource, Lead } from "@/lib/mock-data";

export const DRAFT_LEAD_KEY = "conninter:draft-lead";

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

export function mergeDraftIntoLead(base: Lead, draft: LeadDraft): Lead {
  return {
    ...base,
    ...draft.lead,
    id: base.id,
    interests: draft.lead.interests ?? base.interests,
    priority: draft.lead.priority ?? base.priority,
    summary: draft.lead.summary ?? base.summary,
    synced: false,
    capturedAt: draft.lead.capturedAt ?? "Just now",
    captureSource: draft.captureSource,
    captureMeta: draft.captureMeta,
    fieldConfidence: draft.fieldConfidence,
  };
}
