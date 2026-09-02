import type { Appointment, Lead, TeamMember } from "@/lib/types";
import type { SyncResult } from "@/lib/domain/sync";

// Calls the FastAPI backend (set via VITE_API_URL).
const API_BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

export type SeedData = {
  leads: Lead[];
  appointments: Appointment[];
  interests: string[];
  team: TeamMember[];
};

export type UpsertLeadResponse = { ok: true; lead: Lead } | { ok: false; error: string };

export type UpsertAppointmentResponse =
  | { ok: true; appointment: Appointment }
  | { ok: false; error: string };

export type ManageInterestResponse = { ok: true } | { ok: false; error: string };

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    throw new Error(`API request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export async function fetchSeedData(): Promise<SeedData | null> {
  return apiFetch<SeedData | null>("/api/seed");
}

export async function upsertLead(lead: Lead): Promise<UpsertLeadResponse> {
  return apiFetch<UpsertLeadResponse>("/api/leads", {
    method: "POST",
    body: JSON.stringify(lead),
  });
}

export async function syncPendingLeads(leads: Lead[]): Promise<SyncResult> {
  return apiFetch<SyncResult>("/api/leads/sync", {
    method: "POST",
    body: JSON.stringify(leads),
  });
}

export async function upsertAppointment(appointment: Appointment): Promise<UpsertAppointmentResponse> {
  return apiFetch<UpsertAppointmentResponse>("/api/appointments", {
    method: "POST",
    body: JSON.stringify(appointment),
  });
}

export async function addInterestTag(name: string): Promise<ManageInterestResponse> {
  return apiFetch<ManageInterestResponse>("/api/interests", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export async function removeInterestTag(name: string): Promise<ManageInterestResponse> {
  return apiFetch<ManageInterestResponse>("/api/interests/remove", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}
