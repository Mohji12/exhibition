/**
 * Capture domain tests — run: node scripts/test-capture.mjs
 * Mirrors src/lib/domain/capture/* (keep in sync with parse-qr.ts changes).
 */
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const results = [];
function pass(n, d = "") {
  results.push(true);
  console.log(`  ✓ ${n}${d ? ` — ${d}` : ""}`);
}
function fail(n, d = "") {
  results.push(false);
  console.log(`  ✗ ${n}${d ? ` — ${d}` : ""}`);
}
function assert(n, c, d = "") {
  c ? pass(n, d) : fail(n, d);
}

// --- mirrors src/lib/domain/capture/* ---

function pickStr(obj, ...keys) {
  for (const key of keys) {
    const val = obj[key];
    if (typeof val === "string" && val.trim()) return val.trim();
  }
  return undefined;
}

const MEANINGFUL_QR_FIELDS = ["name", "email", "mobile", "company"];

function hasMeaningfulQrData(lead) {
  return MEANINGFUL_QR_FIELDS.some((field) => {
    const v = lead[field];
    return typeof v === "string" && v.trim().length > 0;
  });
}

function wrapResult(lead, confidence) {
  return { lead, confidence, ok: hasMeaningfulQrData(lead) };
}

function parseJsonQr(raw) {
  try {
    const data = JSON.parse(raw);
    const lead = {
      name: pickStr(data, "name", "fullName", "delegateName"),
      company: pickStr(data, "company", "organisation", "organization", "org"),
      designation: pickStr(data, "designation", "title", "role"),
      mobile: pickStr(data, "mobile", "phone", "tel"),
      email: pickStr(data, "email"),
      city: pickStr(data, "city", "location"),
    };
    const confidence = {};
    for (const [k, v] of Object.entries(lead)) {
      if (v) confidence[k] = 95;
    }
    if (Object.keys(confidence).length === 0) return null;
    return wrapResult(lead, confidence);
  } catch {
    return null;
  }
}

function parseVCard(raw) {
  if (!raw.includes("BEGIN:VCARD")) return null;
  const lead = {};
  const confidence = {};
  for (const line of raw.split(/\r?\n/)) {
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
    } else if (upper === "EMAIL") {
      lead.email = value;
      confidence.email = 90;
    }
  }
  if (!lead.name && !lead.email) return null;
  return wrapResult(lead, confidence);
}

function parseUrlQr(raw) {
  try {
    const url = new URL(raw);
    const name = url.searchParams.get("name") ?? url.searchParams.get("delegate");
    if (!name) return null;
    return wrapResult({ name }, { name: 80 });
  } catch {
    return null;
  }
}

function parseDelegateQr(raw) {
  const trimmed = raw.trim();
  return (
    parseJsonQr(trimmed) ??
    parseVCard(trimmed) ??
    parseUrlQr(trimmed) ?? { ok: false, lead: {}, confidence: {} }
  );
}

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const MOBILE_RE = /(?:\+91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}|\b[6-9]\d{9}\b/;
const COMPANY_RE =
  /\b(Hospital|Hospitals|Centre|Center|Diagnostics|Clinic|Clinics|Medical|Healthcare|Group|Pvt|Ltd|Limited|Care)\b/i;

function parseBusinessCardText(ocrText) {
  const lines = ocrText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const lead = {};
  const confidence = {};

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
    if (COMPANY_RE.test(line) && !lead.company) {
      lead.company = line;
      confidence.company = 70;
    }
  }

  const nameCandidate = lines.find(
    (l) => !EMAIL_RE.test(l) && !MOBILE_RE.test(l) && !COMPANY_RE.test(l) && l.length > 2 && l.length < 60,
  );
  if (nameCandidate) {
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

function normalizeMobile(mobile) {
  return (mobile ?? "").replace(/\D/g, "").slice(-10);
}

function verifyCapturedLead(lead, { fieldConfidence = {}, existingLeads = [] } = {}) {
  const REQUIRED = ["name", "company", "designation", "mobile", "email", "city"];
  const fields = REQUIRED.map((field) => {
    const confidence = fieldConfidence[field] ?? (lead[field]?.trim() ? 75 : 0);
    const v = lead[field]?.trim() ?? "";
    if (field === "email") {
      if (!v) return { field, status: "error" };
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return { field, status: "error" };
      if (confidence < 60) return { field, status: "warning" };
      return { field, status: "ok" };
    }
    if (field === "mobile") {
      if (!v) return { field, status: "error" };
      if (normalizeMobile(v).length < 10) return { field, status: "warning" };
      if (confidence < 60) return { field, status: "warning" };
      return { field, status: "ok" };
    }
    if (!v) return { field, status: "error" };
    if (confidence < 60) return { field, status: "warning" };
    return { field, status: "ok" };
  });

  const dup = existingLeads.find(
    (e) =>
      e.id !== lead.id &&
      ((lead.email && e.email === lead.email) ||
        (lead.mobile && normalizeMobile(e.mobile) === normalizeMobile(lead.mobile))),
  );
  if (dup) fields.push({ field: "email", status: "warning" });

  const hasError = fields.some((f) => f.status === "error");
  return { fields, readyToSave: !hasError };
}

const PRODUCT_KEYWORDS = ["Medical Equipment", "Surgical", "Diagnostics", "Software", "AI", "ventilator"];
const TIMELINE_RE = /\b(this week|next week|within \d+|6\+?\s*months?|quarter|immediate)\b/i;
const ACTION_RE = /\b(demo|brochure|pricing|quotation|quote|follow-up|call|visit|site visit)\b/i;

function summarizeTranscript(text) {
  const trimmed = text.trim();
  if (!trimmed) return "";
  const sentences = [`Booth conversation recorded: ${trimmed.slice(0, 120)}${trimmed.length > 120 ? "…" : ""}.`];
  const products = PRODUCT_KEYWORDS.filter((k) => trimmed.toLowerCase().includes(k.toLowerCase()));
  if (products.length) sentences.push(`Interest areas mentioned: ${products.slice(0, 3).join(", ")}.`);
  const timeline = trimmed.match(TIMELINE_RE)?.[0];
  const action = trimmed.match(ACTION_RE)?.[0];
  if (timeline || action) {
    const parts = [];
    if (action) parts.push(`Requested ${action}`);
    if (timeline) parts.push(`timeline ${timeline}`);
    sentences.push(`${parts.join("; ")}.`);
  } else {
    sentences.push("Follow up with product information as discussed.");
  }
  return sentences.join(" ");
}

const DRAFT_LEAD_KEY = "conninter:draft-lead";

function saveLeadDraft(store, draft) {
  store.setItem(DRAFT_LEAD_KEY, JSON.stringify(draft));
}

function loadLeadDraft(store) {
  const raw = store.getItem(DRAFT_LEAD_KEY);
  if (!raw) return null;
  return JSON.parse(raw);
}

function clearLeadDraft(store) {
  store.removeItem(DRAFT_LEAD_KEY);
}

function mergeDraftIntoLead(base, draft) {
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

console.log("\n=== parse-qr ===\n");
const jsonQr = parseDelegateQr(
  JSON.stringify({ name: "Dr. Ananya Rao", email: "a@b.example", company: "Fortis" }),
);
assert("JSON QR parses name", jsonQr.lead.name === "Dr. Ananya Rao");
assert("JSON QR ok flag", jsonQr.ok === true);
assert("JSON QR confidence", (jsonQr.confidence.name ?? 0) >= 90);

const partialJson = parseDelegateQr(JSON.stringify({ designation: "Visitor" }));
assert("Partial JSON without contact → ok false", partialJson.ok === false);

const vcard = parseDelegateQr("BEGIN:VCARD\nFN:Dr. Meera Nair\nEND:VCARD");
assert("vCard parses FN", vcard.lead.name === "Dr. Meera Nair");
assert("vCard ok flag", vcard.ok === true);

const urlQr = parseDelegateQr("https://medicon.example/badge?name=Rajesh+Kumar&email=r@x.example");
assert("URL QR parses name", urlQr.lead.name === "Rajesh Kumar");

const garbage = parseDelegateQr("not-a-valid-payload");
assert("Garbage QR ok false", garbage.ok === false);
assert("Garbage QR empty lead", Object.keys(garbage.lead).length === 0);

console.log("\n=== parse-ocr ===\n");
const card = parseBusinessCardText(
  "Dr. Test User\nFortis Hospital\nDirector\n+91 98765 43210\ntest@hospital.example\nMumbai",
);
assert("OCR extracts email", card.lead.email === "test@hospital.example");
assert("OCR extracts mobile", !!card.lead.mobile);
assert("OCR extracts name", card.lead.name === "Dr. Test User");
assert("OCR extracts company", card.lead.company === "Fortis Hospital");
assert("OCR no default designation", card.lead.designation === undefined);
assert("OCR no default city India", card.lead.city !== "India");

const sparseCard = parseBusinessCardText("");
assert("Sparse OCR ok false", sparseCard.ok === false);

console.log("\n=== verify-capture ===\n");
const missingEmail = verifyCapturedLead({
  name: "Test",
  company: "Co",
  designation: "Dr",
  mobile: "9876543210",
  city: "Mumbai",
});
assert("Missing email → error", !missingEmail.readyToSave);

const lowConf = verifyCapturedLead(
  {
    name: "Test",
    company: "Co",
    designation: "Dr",
    mobile: "+91 9876543210",
    email: "a@b.example",
    city: "Mumbai",
  },
  { fieldConfidence: { name: 50 } },
);
assert("Low confidence → warning field", lowConf.fields.some((f) => f.field === "name" && f.status === "warning"));
assert("Low confidence still readyToSave", lowConf.readyToSave);

const duplicate = verifyCapturedLead(
  {
    id: "new",
    name: "Other",
    company: "Co",
    designation: "Dr",
    mobile: "9876543210",
    email: "dup@example.com",
    city: "Mumbai",
  },
  { existingLeads: [{ id: "1", email: "dup@example.com", mobile: "9876543210" }] },
);
assert("Duplicate mobile → warning", duplicate.fields.some((f) => f.status === "warning"));

const valid = verifyCapturedLead({
  name: "Test",
  company: "Co",
  designation: "Dr",
  mobile: "+91 9876543210",
  email: "a@b.example",
  city: "Mumbai",
});
assert("Valid lead → readyToSave", valid.readyToSave);

console.log("\n=== draft ===\n");
const mockStore = new Map();
const storage = {
  getItem: (k) => mockStore.get(k) ?? null,
  setItem: (k, v) => mockStore.set(k, v),
  removeItem: (k) => mockStore.delete(k),
};
const baseLead = {
  id: "new",
  name: "",
  company: "",
  designation: "",
  mobile: "",
  email: "",
  city: "",
  interests: [],
  priority: "warm",
  summary: "",
  synced: false,
  capturedAt: "Just now",
};
saveLeadDraft(storage, {
  lead: { name: "Draft User", email: "d@example.com" },
  captureSource: "qr",
  fieldConfidence: { name: 95 },
});
const loaded = loadLeadDraft(storage);
assert("Draft round-trip load", loaded?.lead.name === "Draft User");
const merged = mergeDraftIntoLead(baseLead, loaded);
assert("Draft merge preserves captureSource", merged.captureSource === "qr");
assert("Draft merge applies name", merged.name === "Draft User");
clearLeadDraft(storage);
assert("Draft clear", loadLeadDraft(storage) === null);

console.log("\n=== summarize-transcript ===\n");
const summary = summarizeTranscript(
  "Interested in ICU ventilators, wants a demo next week and pricing quotation.",
);
assert("Summary non-empty", summary.length > 20);
assert("Summary mentions product keyword", summary.includes("ventilator") || summary.includes("ventilators"));
assert("Summary mentions timeline or action", summary.includes("next week") || summary.includes("demo"));

const emptySummary = summarizeTranscript("   ");
assert("Empty transcript → empty summary", emptySummary === "");

console.log("\n=== source parity (parse-qr.ts) ===\n");
const parseQrSrc = readFileSync(resolve(root, "src/lib/domain/capture/parse-qr.ts"), "utf8");
assert("parse-qr exports ok flag", parseQrSrc.includes("ok: boolean"));
assert("parse-qr hasMeaningfulQrData", parseQrSrc.includes("hasMeaningfulQrData"));

console.log("\n=== Summary ===\n");
const ok = results.filter(Boolean).length;
console.log(`${ok}/${results.length} checks passed`);
if (ok < results.length) process.exit(1);
console.log("\nAll capture tests passed.\n");
