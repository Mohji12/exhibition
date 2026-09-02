import type { Lead } from "@/lib/types";

export type ParseResult = {
  ok: boolean;
  lead: Partial<Lead>;
  confidence: Partial<Record<keyof Lead, number>>;
};

const MEANINGFUL_QR_FIELDS: (keyof Lead)[] = ["name", "email", "mobile", "company"];

export function hasMeaningfulQrData(lead: Partial<Lead>): boolean {
  return MEANINGFUL_QR_FIELDS.some((field) => {
    const value = lead[field];
    return typeof value === "string" && value.trim().length > 0;
  });
}

function pickStr(obj: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const val = obj[key];
    if (typeof val === "string" && val.trim()) return val.trim();
  }
  return undefined;
}

function wrapResult(lead: Partial<Lead>, confidence: Partial<Record<keyof Lead, number>>): ParseResult {
  return { lead, confidence, ok: hasMeaningfulQrData(lead) };
}

function parseJsonQr(raw: string): ParseResult | null {
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    const lead: Partial<Lead> = {
      name: pickStr(data, "name", "fullName", "delegateName"),
      company: pickStr(data, "company", "organisation", "organization", "org"),
      designation: pickStr(data, "designation", "title", "role"),
      mobile: pickStr(data, "mobile", "phone", "tel"),
      email: pickStr(data, "email"),
      city: pickStr(data, "city", "location"),
    };
    const confidence: Partial<Record<keyof Lead, number>> = {};
    for (const [k, v] of Object.entries(lead)) {
      if (v) confidence[k as keyof Lead] = 95;
    }
    if (Object.keys(confidence).length === 0) return null;
    return wrapResult(lead, confidence);
  } catch {
    return null;
  }
}

function parseVCard(raw: string): ParseResult | null {
  if (!raw.includes("BEGIN:VCARD")) return null;
  const lines = raw.split(/\r?\n/);
  const lead: Partial<Lead> = {};
  const confidence: Partial<Record<keyof Lead, number>> = {};

  for (const line of lines) {
    const [key, ...rest] = line.split(":");
    const value = rest.join(":").trim();
    if (!value) continue;
    const upper = key.split(";")[0].toUpperCase();
    if (upper === "FN") {
      lead.name = value;
      confidence.name = 90;
    } else if (upper === "ORG") {
      lead.company = value;
      confidence.company = 85;
    } else if (upper === "TITLE") {
      lead.designation = value;
      confidence.designation = 85;
    } else if (upper === "TEL") {
      lead.mobile = value;
      confidence.mobile = 80;
    } else if (upper === "EMAIL") {
      lead.email = value;
      confidence.email = 90;
    } else if (upper === "ADR") {
      const parts = value.split(";").filter(Boolean);
      lead.city = parts[parts.length - 1] || parts[0];
      if (lead.city) confidence.city = 70;
    }
  }

  if (!lead.name && !lead.email) return null;
  return wrapResult(lead, confidence);
}

function parseUrlQr(raw: string): ParseResult | null {
  try {
    const url = new URL(raw);
    const params = url.searchParams;
    const lead: Partial<Lead> = {
      name: params.get("name") ?? params.get("delegate") ?? undefined,
      company: params.get("company") ?? params.get("org") ?? undefined,
      designation: params.get("designation") ?? params.get("title") ?? undefined,
      mobile: params.get("mobile") ?? params.get("phone") ?? undefined,
      email: params.get("email") ?? undefined,
      city: params.get("city") ?? undefined,
    };
    const confidence: Partial<Record<keyof Lead, number>> = {};
    for (const [k, v] of Object.entries(lead)) {
      if (v) confidence[k as keyof Lead] = 80;
    }
    if (Object.keys(confidence).length === 0) return null;
    return wrapResult(lead, confidence);
  } catch {
    return null;
  }
}

export function parseDelegateQr(raw: string): ParseResult {
  const trimmed = raw.trim();
  return (
    parseJsonQr(trimmed) ??
    parseVCard(trimmed) ??
    parseUrlQr(trimmed) ?? {
      ok: false,
      lead: {},
      confidence: {},
    }
  );
}
