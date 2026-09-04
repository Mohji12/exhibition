import { z } from "zod";
import type { Appointment, Lead } from "@/lib/types";

const asString = (v: unknown) => (v == null ? "" : String(v));
const asOptionalString = (v: unknown) => {
  if (v == null) return undefined;
  const s = String(v);
  return s;
};

export const captureMetaSchema = z
  .object({
    rawQr: z.preprocess(asOptionalString, z.string().optional()),
    ocrText: z.preprocess(asOptionalString, z.string().optional()),
    ocrConfidence: z.preprocess((v) => (v == null ? undefined : v), z.number().optional()),
    transcript: z.preprocess(asOptionalString, z.string().optional()),
    liveTranscript: z.preprocess(asOptionalString, z.string().optional()),
    verifiedAt: z.preprocess(asOptionalString, z.string().optional()),
    aiVerifiedAt: z.preprocess(asOptionalString, z.string().optional()),
    aiIssues: z.preprocess((v) => (v == null ? undefined : v), z.array(z.string()).optional()),
    ocrQuality: z.preprocess(
      (v) => (v == null ? undefined : v),
      z.enum(["good", "fair", "poor"]).optional(),
    ),
    cardImageId: z.preprocess(asOptionalString, z.string().optional()),
    cardImageIdBack: z.preprocess(asOptionalString, z.string().optional()),
    audioId: z.preprocess(asOptionalString, z.string().optional()),
    audioKey: z.preprocess(asOptionalString, z.string().optional()),
    voiceStatus: z.preprocess(
      (v) => (v == null ? undefined : v),
      z.enum(["recording", "saved", "processing", "ready", "failed"]).optional(),
    ),
    voiceError: z.preprocess(asOptionalString, z.string().optional()),
    processingNote: z.preprocess((v) => (v == null ? undefined : v), z.boolean().optional()),
    fieldConfidence: z.preprocess(
      (v) => (v == null ? undefined : v),
      z.record(z.number()).optional(),
    ),
  })
  .passthrough();

export const leadSchema = z.object({
  id: z.string().min(1),
  name: z.preprocess(asString, z.string().trim().min(1, "Name is required")),
  company: z.preprocess(asString, z.string().trim().min(1, "Company is required")),
  designation: z.preprocess(asString, z.string().trim().min(1, "Designation is required")),
  mobile: z.preprocess(asString, z.string().trim().min(10, "Mobile number is required")),
  email: z.preprocess(asString, z.string().trim().email("Valid email is required")),
  city: z.preprocess(asString, z.string().trim().min(1, "City is required")),
  priority: z.enum(["hot", "warm", "cold"]),
  interests: z.preprocess(
    (v) =>
      Array.isArray(v)
        ? v.filter((t): t is string => typeof t === "string" && t.trim().length > 0)
        : [],
    z.array(z.string()),
  ),
  summary: z.preprocess(asString, z.string()),
  synced: z.boolean(),
  capturedAt: z.preprocess(
    (v) => (v == null || v === "" ? new Date().toISOString() : String(v)),
    z.string(),
  ),
  consentAt: z.preprocess(asOptionalString, z.string().optional()),
  captureSource: z.preprocess(
    (v) => (v == null ? undefined : v),
    z.enum(["qr", "card", "manual"]).optional(),
  ),
  captureMeta: z.preprocess((v) => (v == null ? undefined : v), captureMetaSchema.optional()),
  fieldConfidence: z.preprocess(
    (v) => (v == null ? undefined : v),
    z.record(z.number()).optional(),
  ),
  capturedBy: z.preprocess(asOptionalString, z.string().optional()),
  capturerName: z.preprocess(asOptionalString, z.string().optional()),
  capturerEmail: z.preprocess(asOptionalString, z.string().optional()),
  filledBy: z.preprocess(
    (v) => (v == null ? "exhibitor" : v),
    z.enum(["exhibitor", "visitor"]).optional(),
  ),
});

export const appointmentSchema = z.object({
  lead: z.string().trim().min(1, "Visitor is required"),
  type: z.enum(["Online call", "Physical", "Product Demo", "Site Visit"]),
  when: z.string().trim().min(1, "Date and time are required"),
  status: z.enum(["Confirmed", "Pending", "Rescheduled"]),
});

export function sanitizeLeadForSave(lead: Lead): Lead {
  const meta = lead.captureMeta;
  const cleanMeta = meta
    ? (Object.fromEntries(
        Object.entries(meta).filter(([, v]) => v !== null && v !== undefined),
      ) as Lead["captureMeta"])
    : undefined;

  return {
    ...lead,
    name: lead.name ?? "",
    company: lead.company ?? "",
    designation: lead.designation ?? "",
    mobile: lead.mobile ?? "",
    email: lead.email ?? "",
    city: lead.city ?? "",
    summary: lead.summary ?? "",
    consentAt: lead.consentAt ?? undefined,
    captureSource: lead.captureSource ?? undefined,
    interests: (lead.interests ?? []).filter(
      (t): t is string => typeof t === "string" && t.trim().length > 0,
    ),
    captureMeta: cleanMeta && Object.keys(cleanMeta).length ? cleanMeta : undefined,
    capturedBy: lead.capturedBy ?? undefined,
    capturerName: lead.capturerName ?? undefined,
    capturerEmail: lead.capturerEmail ?? undefined,
  };
}

export function validateLead(lead: Lead) {
  return leadSchema.safeParse(sanitizeLeadForSave(lead));
}

export function validateAppointment(appointment: Omit<Appointment, "id">) {
  return appointmentSchema.safeParse(appointment);
}

export function formatValidationErrors(result: z.SafeParseError<unknown>): string {
  return result.error.issues
    .map((i) => {
      const path = i.path.length ? `${i.path.join(".")}: ` : "";
      return `${path}${i.message}`;
    })
    .join("; ");
}
