import { findDuplicateLead, normalizeMobile } from "@/lib/domain/leads";
import type { Lead } from "@/lib/types";

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

const FIELD_ISSUE_RE: Record<(typeof REQUIRED)[number], RegExp> = {
  name: /\bnames?\b/i,
  company: /\bcompan(y|ies)\b/i,
  designation: /\b(designation|title|role)\b/i,
  mobile: /\b(mobile|phone|tel)\b/i,
  email: /\be-?mails?\b/i,
  city: /\bcit(y|ies)\b/i,
};

const MISSING_CLAIM_RE =
  /\b(missing|unreadable|empty|not\s+found|could\s+not|couldn'?t|absent|blank|unavailable|no\s+\w+\s+found)\b/i;

/** Drop Gemini "X is missing" notes when that field is already filled on the lead. */
export function filterStaleAiIssues(
  lead: Partial<Pick<Lead, (typeof REQUIRED)[number]>>,
  issues: string[] | undefined | null,
): string[] {
  if (!issues?.length) return [];
  return issues.filter((issue) => {
    const text = String(issue || "").trim();
    if (!text) return false;
    if (!MISSING_CLAIM_RE.test(text)) return true;
    for (const field of REQUIRED) {
      if (!FIELD_ISSUE_RE[field].test(text)) continue;
      const value = String(lead[field] ?? "").trim();
      if (value) return false;
    }
    return true;
  });
}

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

const VOICE_MERGE_KEYS = [
  "transcript",
  "liveTranscript",
  "audioId",
  "audioKey",
  "voiceStatus",
  "voiceError",
  "processingNote",
] as const;

/** Merge store voice/summary into local lead edits without clobbering contact fields. */
export function mergeStoreVoiceIntoLead(local: Lead, fromStore: Lead): Lead {
  const localStatus = local.captureMeta?.voiceStatus;
  const storeStatus = fromStore.captureMeta?.voiceStatus;
  const storeVoiceReady = storeStatus === "ready";
  const localVoicePending =
    localStatus === "processing" || localStatus === "saved" || localStatus === "recording";

  const localSummary = (local.summary ?? "").trim();
  const storeSummary = (fromStore.summary ?? "").trim();
  const takeSummary =
    !localSummary ||
    localSummary.toLowerCase() === "null" ||
    (localVoicePending && storeVoiceReady && Boolean(storeSummary)) ||
    (storeVoiceReady &&
      Boolean(storeSummary) &&
      storeSummary !== localSummary &&
      localSummary.length < storeSummary.length);

  const nextMeta = { ...local.captureMeta };
  if (fromStore.captureMeta && (storeVoiceReady || localVoicePending || storeStatus === "failed")) {
    for (const key of VOICE_MERGE_KEYS) {
      const value = fromStore.captureMeta[key];
      if (value !== undefined) {
        (nextMeta as Record<string, unknown>)[key] = value;
      }
    }
  }

  return {
    ...local,
    summary: takeSummary ? fromStore.summary || local.summary : local.summary,
    captureMeta: nextMeta,
  };
}

/** Prefer newer voice/summary when merging a synced server lead over local. */
export function preferLocalVoice(local: Lead, incoming: Lead): Lead {
  const localStatus = local.captureMeta?.voiceStatus;
  const incomingStatus = incoming.captureMeta?.voiceStatus;
  const localAhead =
    localStatus === "ready" ||
    localStatus === "processing" ||
    localStatus === "saved" ||
    ((local.summary ?? "").trim().length > (incoming.summary ?? "").trim().length &&
      Boolean(local.captureMeta?.audioId || local.captureMeta?.audioKey));

  if (!localAhead) return incoming;

  return {
    ...incoming,
    summary: (local.summary ?? "").trim() ? local.summary : incoming.summary,
    captureMeta: {
      ...incoming.captureMeta,
      ...Object.fromEntries(
        VOICE_MERGE_KEYS.map((k) => [k, local.captureMeta?.[k] ?? incoming.captureMeta?.[k]]),
      ),
    },
  };
}
