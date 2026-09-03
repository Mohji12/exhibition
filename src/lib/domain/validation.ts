import { z } from "zod";
import type { Appointment, Lead } from "@/lib/types";

export const leadSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1, "Name is required"),
  company: z.string().trim().min(1, "Company is required"),
  designation: z.string().trim().min(1, "Designation is required"),
  mobile: z.string().trim().min(10, "Mobile number is required"),
  email: z.string().trim().email("Valid email is required"),
  city: z.string().trim().min(1, "City is required"),
  priority: z.enum(["hot", "warm", "cold"]),
  interests: z.array(z.string()),
  summary: z.string(),
  synced: z.boolean(),
  capturedAt: z.string(),
  consentAt: z.string().optional(),
  captureSource: z.enum(["qr", "card", "manual"]).optional(),
  captureMeta: z
    .object({
      rawQr: z.string().optional(),
      ocrText: z.string().optional(),
      ocrConfidence: z.number().optional(),
      transcript: z.string().optional(),
      verifiedAt: z.string().optional(),
      aiVerifiedAt: z.string().optional(),
      aiIssues: z.array(z.string()).optional(),
      ocrQuality: z.enum(["good", "fair", "poor"]).optional(),
      cardImageId: z.string().optional(),
      fieldConfidence: z.record(z.number()).optional(),
    })
    .optional(),
  fieldConfidence: z.record(z.number()).optional(),
});

export const appointmentSchema = z.object({
  lead: z.string().trim().min(1, "Visitor is required"),
  type: z.enum(["Online call", "Physical", "Product Demo", "Site Visit"]),
  when: z.string().trim().min(1, "Date and time are required"),
  status: z.enum(["Confirmed", "Pending", "Rescheduled"]),
});

export function validateLead(lead: Lead) {
  return leadSchema.safeParse(lead);
}

export function validateAppointment(appointment: Omit<Appointment, "id">) {
  return appointmentSchema.safeParse(appointment);
}

export function formatValidationErrors(result: z.SafeParseError<unknown>): string {
  return result.error.issues.map((i) => i.message).join("; ");
}
