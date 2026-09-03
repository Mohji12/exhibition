import { clearSession, readSession } from "@/lib/auth-session";
import type {
  AdminLeadFilters,
  AdminOverview,
  Appointment,
  AuthSession,
  AuthUser,
  InvitePin,
  Lead,
  TeamMember,
} from "@/lib/types";
import type { SyncResult } from "@/lib/domain/sync";

const DEFAULT_PROD_API_URL = "https://connitor.menteetracker.com";
const DEFAULT_DEV_API_URL = "http://127.0.0.1:8000";

export function getApiBase(): string {
  const configured = import.meta.env.VITE_API_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  // Local Vite/dev must not fall back to production — auth routes live on the local API.
  const base = import.meta.env.DEV ? DEFAULT_DEV_API_URL : DEFAULT_PROD_API_URL;
  return base.replace(/\/$/, "");
}

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

export type InviteLookup = { ok: boolean; error?: string | null };

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { detail?: unknown };
    if (typeof body.detail === "string") return body.detail;
    if (Array.isArray(body.detail)) {
      return body.detail
        .map((item) => (typeof item === "object" && item && "msg" in item ? String(item.msg) : ""))
        .filter(Boolean)
        .join(" ");
    }
  } catch {
    /* ignore */
  }
  return `API request failed (${res.status})`;
}

async function apiFetch<T>(path: string, init?: RequestInit, auth = true): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const token = auth ? readSession()?.token : undefined;
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${getApiBase()}${path}`, { ...init, headers });
  // Only clear a real session when the server rejected that bearer token.
  if (res.status === 401 && token) {
    clearSession();
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("conninter:unauthorized"));
    }
  }
  if (!res.ok) {
    throw new Error(await readError(res));
  }
  return res.json() as Promise<T>;
}

export async function loginRequest(email: string, pin: string): Promise<AuthSession> {
  return apiFetch<AuthSession>(
    "/api/auth/login",
    { method: "POST", body: JSON.stringify({ email, pin }) },
    false,
  );
}

export async function lookupInvite(token: string): Promise<InviteLookup> {
  return apiFetch<InviteLookup>(`/api/auth/invite/${encodeURIComponent(token)}`, undefined, false);
}

export async function activateAccount(body: {
  token: string;
  pin: string;
  name: string;
  email: string;
  loginPin: string;
}): Promise<AuthSession> {
  return apiFetch<AuthSession>(
    "/api/auth/activate",
    { method: "POST", body: JSON.stringify(body) },
    false,
  );
}

export async function startInvite(fresh = false): Promise<InvitePin> {
  return apiFetch<InvitePin>("/api/admin/invite", {
    method: "POST",
    body: JSON.stringify({ fresh }),
  });
}

export async function refreshInvitePin(): Promise<InvitePin> {
  return apiFetch<InvitePin>("/api/admin/invite/refresh", { method: "POST", body: "{}" });
}

export async function fetchAdminOverview(): Promise<AdminOverview> {
  return apiFetch<AdminOverview>("/api/admin/overview");
}

export async function fetchAdminUsers(): Promise<AuthUser[]> {
  return apiFetch<AuthUser[]>("/api/admin/users");
}

export async function patchAdminUser(
  userId: string,
  body: { status?: AuthUser["status"]; role?: AuthUser["role"] },
): Promise<AuthUser> {
  return apiFetch<AuthUser>(`/api/admin/users/${encodeURIComponent(userId)}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

function leadQuery(filters: AdminLeadFilters = {}): string {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.priority) params.set("priority", filters.priority);
  if (filters.synced !== undefined) params.set("synced", String(filters.synced));
  if (filters.source) params.set("source", filters.source);
  if (filters.capturedBy) params.set("capturedBy", filters.capturedBy);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export async function fetchAdminLeads(filters: AdminLeadFilters = {}): Promise<Lead[]> {
  return apiFetch<Lead[]>(`/api/admin/leads${leadQuery(filters)}`);
}

export async function fetchAdminLead(id: string): Promise<Lead> {
  return apiFetch<Lead>(`/api/admin/leads/${encodeURIComponent(id)}`);
}

export async function deleteAdminLead(id: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/api/admin/leads/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export async function exportAdminLeadsCsv(filters: AdminLeadFilters = {}): Promise<Blob> {
  const headers = new Headers();
  const token = readSession()?.token;
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(`${getApiBase()}/api/admin/leads/export${leadQuery(filters)}`, {
    headers,
  });
  if (res.status === 401 && token) {
    clearSession();
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("conninter:unauthorized"));
    }
  }
  if (!res.ok) throw new Error(await readError(res));
  return res.blob();
}

export async function exportAdminLeadsXlsx(filters: AdminLeadFilters = {}): Promise<Blob> {
  const headers = new Headers();
  const token = readSession()?.token;
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(`${getApiBase()}/api/admin/leads/export.xlsx${leadQuery(filters)}`, {
    headers,
  });
  if (res.status === 401 && token) {
    clearSession();
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("conninter:unauthorized"));
    }
  }
  if (!res.ok) throw new Error(await readError(res));
  return res.blob();
}

export type BoothReport = {
  markdown: string;
  generatedAt: string;
  stats: Record<string, unknown>;
  usedAi: boolean;
};

export async function generateBoothReport(): Promise<BoothReport> {
  return apiFetch<BoothReport>("/api/admin/reports/booth", { method: "POST", body: "{}" });
}

export async function fetchAdminAppointments(): Promise<Appointment[]> {
  return apiFetch<Appointment[]>("/api/admin/appointments");
}

export async function patchAdminAppointment(
  id: string,
  body: { status?: Appointment["status"]; when?: string; type?: Appointment["type"] },
): Promise<Appointment> {
  return apiFetch<Appointment>(`/api/admin/appointments/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function fetchSeedData(): Promise<SeedData | null> {
  try {
    return await apiFetch<SeedData | null>("/api/seed");
  } catch {
    return null;
  }
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

export type AnalyzeCardFields = {
  name: string;
  company: string;
  designation: string;
  mobile: string;
  email: string;
  city: string;
};

export type AnalyzeCardResponse = {
  ok: boolean;
  fields: AnalyzeCardFields;
  fieldConfidence: Record<string, number>;
  issues: string[];
  ocrQuality: "good" | "fair" | "poor";
  error?: string | null;
};

export async function analyzeCardCapture(body: {
  imageBase64: string;
  mimeType?: string;
  ocrText?: string;
}): Promise<AnalyzeCardResponse> {
  return apiFetch<AnalyzeCardResponse>("/api/capture/analyze-card", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export type UploadCardImageResponse = { ok: boolean; id: string; error?: string | null };

export async function uploadCardImage(body: {
  imageBase64: string;
  mimeType?: string;
  leadId?: string;
}): Promise<UploadCardImageResponse> {
  return apiFetch<UploadCardImageResponse>("/api/capture/card-image", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
