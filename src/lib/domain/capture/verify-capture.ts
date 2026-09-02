import { findDuplicateLead, normalizeMobile } from "@/lib/domain/leads";
import type { Lead } from "@/lib/mock-data";

export type FieldStatus = "ok" | "warning" | "error";

export type FieldVerification = {
  field: keyof Lead;
  status: FieldStatus;
  message: string;
  confidence: number;
};

export type CaptureVerification = {
  fields: FieldVerification[];
  readyToSave: boolean;
  overallScore: number;
};

const REQUIRED: (keyof Lead)[] = ["name", "company", "designation", "mobile", "email", "city"];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function verifyField(
  field: keyof Lead,
  value: string | undefined,
  fieldConfidence: number | undefined,
): FieldVerification {
  const confidence = fieldConfidence ?? (value?.trim() ? 75 : 0);
  const v = value?.trim() ?? "";

  if (field === "email") {
    if (!v) return { field, status: "error", message: "Email is required", confidence };
    if (!EMAIL_RE.test(v)) return { field, status: "error", message: "Invalid email format", confidence };
    if (confidence < 60) return { field, status: "warning", message: "Please verify email", confidence };
    return { field, status: "ok", message: "Valid email", confidence };
  }

  if (field === "mobile") {
    if (!v) return { field, status: "error", message: "Mobile is required", confidence };
    const digits = normalizeMobile(v);
    if (digits.length < 10) return { field, status: "warning", message: "Check mobile number", confidence };
    if (confidence < 60) return { field, status: "warning", message: "Please verify mobile", confidence };
    return { field, status: "ok", message: "Valid mobile", confidence };
  }

  if (!v) return { field, status: "error", message: `${String(field)} is required`, confidence };
  if (confidence < 60) return { field, status: "warning", message: "Please verify", confidence };
  return { field, status: "ok", message: "Looks good", confidence };
}

export function verifyCapturedLead(
  lead: Partial<Lead>,
  options: {
    fieldConfidence?: Partial<Record<keyof Lead, number>>;
    existingLeads?: Lead[];
  } = {},
): CaptureVerification {
  const { fieldConfidence = {}, existingLeads = [] } = options;

  const fields = REQUIRED.map((field) =>
    verifyField(field, lead[field] as string | undefined, fieldConfidence[field]),
  );

  const candidate = lead as Lead;
  if (candidate.id && (lead.email || lead.mobile)) {
    const dup = findDuplicateLead(existingLeads, {
      ...candidate,
      id: candidate.id ?? "new",
      interests: candidate.interests ?? [],
      priority: candidate.priority ?? "warm",
      summary: candidate.summary ?? "",
      synced: false,
      capturedAt: candidate.capturedAt ?? "",
    });
    if (dup) {
      fields.push({
        field: "email",
        status: "warning",
        message: `Possible duplicate: ${dup.name}`,
        confidence: fieldConfidence.email ?? 70,
      });
    }
  }

  const hasError = fields.some((f) => f.status === "error");
  const scores = fields.map((f) => f.confidence);
  const overallScore = scores.length
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    : 0;

  return {
    fields,
    readyToSave: !hasError,
    overallScore,
  };
}

export function fieldStatusMap(verification: CaptureVerification): Partial<Record<keyof Lead, FieldStatus>> {
  const map: Partial<Record<keyof Lead, FieldStatus>> = {};
  for (const f of verification.fields) {
    const prev = map[f.field];
    if (!prev || f.status === "error" || (f.status === "warning" && prev === "ok")) {
      map[f.field] = f.status;
    }
  }
  return map;
}
