import type { Lead, Priority } from "@/lib/types";

export type LeadFilter = {
  query?: string;
  priority?: Priority | null;
  interest?: string | null;
  sync?: "synced" | "pending" | null;
};

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function normalizeMobile(mobile: string): string {
  return (mobile ?? "").replace(/\D/g, "").slice(-10);
}

export function filterLeads(leads: Lead[], filter: LeadFilter = {}): Lead[] {
  const { query = "", priority = null, interest = null, sync = null } = filter;
  return leads.filter((l) => {
    const q = query.trim().toLowerCase();
    if (q && !`${l.name} ${l.company} ${l.email}`.toLowerCase().includes(q)) return false;
    if (priority && l.priority !== priority) return false;
    if (interest && !l.interests.includes(interest)) return false;
    if (sync === "synced" && !l.synced) return false;
    if (sync === "pending" && l.synced) return false;
    return true;
  });
}

export function mergeLead(leads: Lead[], lead: Lead): Lead[] {
  const exists = leads.some((l) => l.id === lead.id);
  return exists ? leads.map((l) => (l.id === lead.id ? lead : l)) : [lead, ...leads];
}

export function findDuplicateLead(leads: Lead[], candidate: Lead): Lead | undefined {
  const email = normalizeEmail(candidate.email);
  const mobile = normalizeMobile(candidate.mobile);
  if (!email && !mobile) return undefined;
  return leads.find(
    (l) =>
      l.id !== candidate.id &&
      ((email && normalizeEmail(l.email) === email) ||
        (mobile.length >= 10 && normalizeMobile(l.mobile) === mobile)),
  );
}

export function createEmptyLead(id?: string): Lead {
  return {
    id: id ?? `l${Date.now()}`,
    name: "",
    company: "",
    designation: "",
    mobile: "",
    email: "",
    city: "",
    priority: "warm",
    interests: [],
    summary: "",
    synced: false,
    capturedAt: "Just now",
    captureSource: "manual",
  };
}

export function resolveLeadForRoute(
  leadId: string,
  leads: Lead[],
): { lead: Lead; isNew: boolean } {
  if (leadId === "new") {
    return { lead: createEmptyLead(), isNew: true };
  }
  const existing = leads.find((l) => l.id === leadId);
  if (existing) return { lead: existing, isNew: false };
  return { lead: createEmptyLead(leadId), isNew: true };
}

export function mergeSeedWithPending(serverLeads: Lead[], pendingLeads: Lead[]): Lead[] {
  const byId = new Map(serverLeads.map((l) => [l.id, l]));
  for (const pending of pendingLeads) {
    if (!pending.synced) byId.set(pending.id, pending);
  }
  return Array.from(byId.values());
}
