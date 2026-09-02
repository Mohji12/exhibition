import type { Lead } from "@/lib/mock-data";
import { hasMeaningfulQrData, type ParseResult } from "@/lib/domain/capture/parse-qr";

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const MOBILE_RE = /(?:\+91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}|\b[6-9]\d{9}\b/;
const DESIGNATION_RE =
  /\b(Dr\.|Director|Manager|Head|Officer|Chief|President|VP|Consultant|Engineer|Procurement)\b/i;
const COMPANY_RE =
  /\b(Hospital|Hospitals|Centre|Center|Diagnostics|Clinic|Clinics|Medical|Healthcare|Group|Pvt|Ltd|Limited|Care)\b/i;

const INDIAN_CITIES = [
  "Mumbai",
  "Delhi",
  "Bengaluru",
  "Bangalore",
  "Chennai",
  "Hyderabad",
  "Kochi",
  "Pune",
  "Kolkata",
  "Ahmedabad",
  "Nagpur",
  "Jaipur",
];

export function parseBusinessCardText(ocrText: string): ParseResult {
  const lines = ocrText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const lead: Partial<Lead> = {};
  const confidence: Partial<Record<keyof Lead, number>> = {};

  const emailMatch = ocrText.match(EMAIL_RE);
  if (emailMatch) {
    lead.email = emailMatch[0];
    confidence.email = 85;
  }

  const mobileMatch = ocrText.match(MOBILE_RE);
  if (mobileMatch) {
    lead.mobile = mobileMatch[0].replace(/\s+/g, " ").trim();
    confidence.mobile = 80;
  }

  for (const line of lines) {
    if (DESIGNATION_RE.test(line) && !lead.designation) {
      lead.designation = line;
      confidence.designation = 75;
    }
    if (COMPANY_RE.test(line) && !lead.company) {
      lead.company = line;
      confidence.company = 70;
    }
    for (const city of INDIAN_CITIES) {
      if (line.includes(city) && !lead.city) {
        lead.city = city;
        confidence.city = 72;
      }
    }
  }

  const nameCandidate = lines.find(
    (l) =>
      !EMAIL_RE.test(l) &&
      !MOBILE_RE.test(l) &&
      !COMPANY_RE.test(l) &&
      l.length > 2 &&
      l.length < 60,
  );
  if (nameCandidate && !lead.name) {
    lead.name = nameCandidate;
    confidence.name = 65;
  }

  if (!lead.company) {
    const fallback = lines.find((l) => l !== lead.name && !EMAIL_RE.test(l) && !MOBILE_RE.test(l));
    if (fallback) {
      lead.company = fallback;
      confidence.company = 55;
    }
  }

  return { lead, confidence, ok: hasMeaningfulQrData(lead) };
}

export function averageConfidence(confidence: Partial<Record<keyof Lead, number>>): number {
  const vals = Object.values(confidence).filter((v): v is number => typeof v === "number");
  if (!vals.length) return 0;
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}
