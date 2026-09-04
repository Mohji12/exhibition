import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Info } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { AppShell } from "@/components/AppShell";
import {
  inputBorderForStatus,
  VerificationPanel,
} from "@/components/capture/VerificationPanel";
import { VoiceRecorder } from "@/components/capture/VoiceRecorder";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  clearLeadDraft,
  loadLeadDraft,
  mergeDraftIntoLead,
} from "@/lib/domain/capture/draft";
import {
  fieldStatusMap,
  verifyCapturedLead,
} from "@/lib/domain/capture/verify-capture";
import {
  createEmptyLead,
  findDuplicateLead,
  resolveLeadForRoute,
} from "@/lib/domain/leads";
import { formatValidationErrors, validateLead } from "@/lib/domain/validation";
import { useStore } from "@/lib/store";
import type { CaptureSource, Lead, Priority } from "@/lib/types";
import { cn } from "@/lib/utils";

const searchSchema = z.object({
  source: z.enum(["qr", "card", "manual"]).optional(),
});

export const Route = createFileRoute("/leads/$leadId")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Visitor details — Conninter Visitor Book" },
      {
        name: "description",
        content:
          "Verify auto-filled visitor details, tag product interest, set lead priority and record the conversation summary.",
      },
      { property: "og:title", content: "Visitor details — Conninter Visitor Book" },
      {
        property: "og:description",
        content: "Qualify a booth visitor with product interest, priority and an AI summary.",
      },
    ],
  }),
  component: LeadDetailPage,
});

const PRIORITY_OPTIONS: { value: Priority; label: string; dot: string; active: string }[] = [
  { value: "hot", label: "Hot 🔴", dot: "bg-hot", active: "bg-hot-soft text-hot border-hot" },
  {
    value: "warm",
    label: "Warm 🟡",
    dot: "bg-warm",
    active: "bg-warm-soft text-warning-foreground border-warm",
  },
  { value: "cold", label: "Cold 🔵", dot: "bg-cold", active: "bg-cold-soft text-cold border-cold" },
];

const FORM_FIELDS = [
  ["name", "Name"],
  ["company", "Company"],
  ["designation", "Designation"],
  ["mobile", "Mobile"],
  ["email", "Email"],
  ["city", "City"],
] as const;

function LeadDetailPage() {
  const { leadId } = useParams({ from: "/leads/$leadId" });
  const { source } = Route.useSearch();
  const { leads, interests, saveLead, seedSource } = useStore();
  const navigate = useNavigate();
  const { lead: initial, isNew } = resolveLeadForRoute(leadId, leads);
  const [lead, setLead] = useState<Lead>(() =>
    leadId === "new" ? createEmptyLead() : initial,
  );
  const [captureSource, setCaptureSource] = useState<CaptureSource | undefined>(
    source ?? initial.captureSource,
  );
  const [saving, setSaving] = useState(false);
  const [customInterest, setCustomInterest] = useState("");
  const draftLoaded = useRef(false);

  useEffect(() => {
    draftLoaded.current = false;
  }, [leadId]);

  useEffect(() => {
    if (leadId === "new") {
      if (draftLoaded.current) return;

      const draft = loadLeadDraft();
      if (draft) {
        const base = createEmptyLead();
        setLead(mergeDraftIntoLead(base, draft));
        setCaptureSource(draft.captureSource);
        clearLeadDraft();
      } else if (source === "manual") {
        setLead(createEmptyLead());
        setCaptureSource("manual");
      } else if (source === "qr" || source === "card") {
        toast.warning("No capture data found — please scan again");
        navigate({ to: "/capture" });
        return;
      } else {
        setLead(createEmptyLead());
        setCaptureSource("manual");
      }

      draftLoaded.current = true;
      return;
    }

    if (seedSource === "loading") return;

    const existing = leads.find((l) => l.id === leadId);
    if (existing) {
      setLead(existing);
      setCaptureSource(existing.captureSource ?? source);
      return;
    }

    const { lead: fallback } = resolveLeadForRoute(leadId, leads);
    setLead(fallback);
    setCaptureSource(fallback.captureSource ?? source);
  }, [leadId, source, leads, seedSource, navigate]);

  const verification = useMemo(
    () =>
      verifyCapturedLead(lead, {
        fieldConfidence: lead.fieldConfidence,
        existingLeads: leads,
      }),
    [lead, leads],
  );

  const statusMap = useMemo(() => fieldStatusMap(verification), [verification]);

  const set = <K extends keyof Lead>(key: K, value: Lead[K]) =>
    setLead((prev) => ({ ...prev, [key]: value }));

  const toggleInterest = (tag: string) =>
    setLead((prev) => ({
      ...prev,
      interests: prev.interests.includes(tag)
        ? prev.interests.filter((t) => t !== tag)
        : [...prev.interests, tag],
    }));

  const addCustomInterest = () => {
    const tag = customInterest.trim();
    if (!tag) return;
    setLead((prev) => {
      const exists = prev.interests.some((t) => t.toLowerCase() === tag.toLowerCase());
      if (exists) return prev;
      return { ...prev, interests: [...prev.interests, tag] };
    });
    setCustomInterest("");
  };

  const save = async (schedule?: boolean) => {
    if (!verification.readyToSave) {
      toast.error("Fix validation errors before saving");
      return;
    }

    const parsed = validateLead(lead);
    if (!parsed.success) {
      toast.error(formatValidationErrors(parsed));
      return;
    }

    const hasWarnings = verification.fields.some((f) => f.status === "warning");
    const duplicate = findDuplicateLead(leads, lead);
    if (duplicate || hasWarnings) {
      const proceed = window.confirm(
        duplicate
          ? `Possible duplicate of ${duplicate.name}. Save anyway?`
          : "Some fields have low confidence. Save anyway?",
      );
      if (!proceed) return;
    }

    setSaving(true);
    try {
      await saveLead({
        ...parsed.data,
        captureSource: captureSource ?? "manual",
        captureMeta: {
          ...lead.captureMeta,
          verifiedAt: new Date().toISOString(),
        },
        synced: false,
      }).then((saved) => {
        toast.success(`${lead.name} saved`, {
          description: saved.synced
            ? "Synced to Conninter database"
            : "Saved offline — will sync when connection returns",
        });
        if (
          lead.captureMeta?.voiceStatus === "processing" ||
          lead.captureMeta?.voiceStatus === "saved" ||
          lead.captureMeta?.processingNote
        ) {
          toast.message(
            "Recording or card may still be processing in the background and will finish when online.",
          );
        }
      });
      navigate({ to: schedule ? "/schedule" : "/leads" });
    } catch {
      toast.error("Failed to save lead");
    } finally {
      setSaving(false);
    }
  };

  const showVerification = captureSource && captureSource !== "manual";

  return (
    <AppShell title="Visitor details" subtitle={isNew ? "New capture" : "Editing lead"}>
      <div className="flex items-start gap-2 rounded-xl bg-primary-soft px-3.5 py-2.5 text-xs text-primary">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        {captureSource === "qr" && "Auto-filled from QR scan — please verify"}
        {captureSource === "card" &&
          (lead.captureMeta?.aiVerifiedAt
            ? "Auto-filled from card scan — please verify"
            : "Auto-filled from card OCR — please verify")}
        {(!captureSource || captureSource === "manual") && "Enter visitor details below"}
      </div>

      {showVerification && <VerificationPanel verification={verification} lead={lead} />}

      {(lead.captureMeta?.voiceStatus === "processing" ||
        lead.captureMeta?.voiceStatus === "saved" ||
        lead.captureMeta?.processingNote) && (
        <div className="mt-3 rounded-xl border border-primary/20 bg-primary-soft px-3.5 py-2.5 text-xs text-primary">
          Connection is slow or processing is still running. Save the lead now — recording and card
          data are backed up and will finish when you are online.
        </div>
      )}

      <div className="mt-3 space-y-3 rounded-xl border border-border bg-card p-4 shadow-card">
        {FORM_FIELDS.map(([key, label]) => (
          <div key={key} className="space-y-1.5">
            <Label htmlFor={key}>{label}</Label>
            <Input
              id={key}
              value={lead[key]}
              onChange={(e) => set(key, e.target.value)}
              className={cn("h-11 rounded-xl", inputBorderForStatus(statusMap[key]))}
            />
          </div>
        ))}
      </div>

      <section className="mt-4 rounded-xl border border-border bg-card p-4 shadow-card">
        <h2 className="text-sm font-semibold text-foreground">Product interest</h2>
        <div className="mt-3 space-y-2.5">
          {[...new Set([...interests, ...lead.interests])].map((tag) => (
            <label key={tag} className="flex items-center gap-3 text-sm text-foreground">
              <Checkbox
                checked={lead.interests.includes(tag)}
                onCheckedChange={() => toggleInterest(tag)}
              />
              {tag}
            </label>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <Input
            value={customInterest}
            onChange={(e) => setCustomInterest(e.target.value)}
            placeholder="Not listed? Type your own"
            className="h-10 rounded-xl"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCustomInterest();
              }
            }}
          />
          <Button
            type="button"
            variant="outline"
            className="h-10 shrink-0 rounded-xl"
            disabled={!customInterest.trim()}
            onClick={addCustomInterest}
          >
            Add
          </Button>
        </div>
      </section>

      <section className="mt-4 rounded-xl border border-border bg-card p-4 shadow-card">
        <h2 className="text-sm font-semibold text-foreground">Lead priority</h2>
        <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-secondary p-1">
          {PRIORITY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => set("priority", opt.value)}
              className={cn(
                "rounded-lg border border-transparent px-2 py-2 text-xs font-semibold transition-colors",
                lead.priority === opt.value
                  ? opt.active
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </section>

      <div className="mt-4">
        <VoiceRecorder
          leadId={lead.id}
          summary={lead.summary}
          consentAt={lead.consentAt}
          captureMeta={lead.captureMeta}
          onSummaryChange={(summary) => set("summary", summary)}
          onConsentChange={(consentAt) => set("consentAt", consentAt)}
          onCaptureMetaChange={(patch) =>
            setLead((prev) => ({
              ...prev,
              captureMeta: { ...prev.captureMeta, ...patch },
            }))
          }
        />
      </div>

      <div className="fixed inset-x-0 bottom-[68px] z-30 mx-auto flex max-w-[430px] gap-2 border-t border-border bg-card/95 px-4 py-3 backdrop-blur sm:bottom-[calc(1.5rem+68px)] sm:rounded-b-none">
        <Button
          className="h-11 flex-1 rounded-xl"
          disabled={saving || !verification.readyToSave}
          onClick={() => void save()}
        >
          {saving ? "Saving…" : "Save Lead"}
        </Button>
        <Button
          variant="outline"
          className="h-11 flex-1 rounded-xl"
          disabled={saving || !verification.readyToSave}
          onClick={() => void save(true)}
        >
          Save &amp; Schedule
        </Button>
      </div>
    </AppShell>
  );
}
