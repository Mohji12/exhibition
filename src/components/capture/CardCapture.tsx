import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Camera, RotateCcw, Upload } from "lucide-react";
import { createWorker } from "tesseract.js";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { analyzeCardCapture, uploadCardImage } from "@/lib/api/http-client";
import {
  compressDataUrl,
  deletePendingCardImage,
  putPendingCardImage,
} from "@/lib/domain/capture/card-image-store";
import { saveLeadDraft } from "@/lib/domain/capture/draft";
import { averageConfidence, parseBusinessCardText } from "@/lib/domain/capture/parse-ocr";
import { verifyCapturedLead } from "@/lib/domain/capture/verify-capture";
import { createEmptyLead } from "@/lib/domain/leads";
import { sanitizeText } from "@/lib/domain/sanitize-text";
import type { CaptureMeta, Lead } from "@/lib/types";

type CardSide = "front" | "back";

type CardPreview = {
  lead: Partial<Lead>;
  confidence: Partial<Record<keyof Lead, number>>;
  source: "gemini" | "tesseract";
  aiIssues: string[];
  ocrQuality?: CaptureMeta["ocrQuality"];
  ocrText: string;
};

type SideState = {
  preview: string;
  imageId?: string;
  pendingKey?: string;
  backupPromise?: Promise<string | undefined>;
};

const FIELD_KEYS = ["name", "company", "designation", "mobile", "email", "city"] as const;

function mergeCardFields(front: CardPreview, back?: CardPreview | null): CardPreview {
  if (!back) return front;
  const lead: Partial<Lead> = { ...front.lead };
  const confidence: Partial<Record<keyof Lead, number>> = { ...front.confidence };
  for (const key of FIELD_KEYS) {
    const frontVal = sanitizeText(front.lead[key] as string | undefined);
    const backVal = sanitizeText(back.lead[key] as string | undefined);
    const frontScore = front.confidence[key] ?? 0;
    const backScore = back.confidence[key] ?? 0;
    if (!frontVal && backVal) {
      (lead as Record<string, string>)[key] = backVal;
      confidence[key] = backScore;
    } else if (frontVal && backVal && backScore > frontScore + 5) {
      (lead as Record<string, string>)[key] = backVal;
      confidence[key] = backScore;
    }
  }
  return {
    lead: { ...lead, id: front.lead.id ?? back.lead.id },
    confidence,
    source: front.source === "gemini" || back.source === "gemini" ? "gemini" : "tesseract",
    aiIssues: [...front.aiIssues, ...back.aiIssues],
    ocrQuality: front.ocrQuality ?? back.ocrQuality,
    ocrText: [front.ocrText, back.ocrText].filter(Boolean).join("\n---\n"),
  };
}

export function CardCapture() {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [side, setSide] = useState<CardSide>("front");
  const [front, setFront] = useState<SideState | null>(null);
  const [back, setBack] = useState<SideState | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [statusLabel, setStatusLabel] = useState<string | null>(null);
  const [parsedPreview, setParsedPreview] = useState<CardPreview | null>(null);
  const [draftLeadId, setDraftLeadId] = useState<string | undefined>();
  const [awaitingBackChoice, setAwaitingBackChoice] = useState(false);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraOn(false);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!cameraOn || !video || !stream) return;
    video.srcObject = stream;
    void video.play().catch(() => toast.error("Could not start camera preview"));
    return () => {
      video.srcObject = null;
    };
  }, [cameraOn]);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const startCamera = async () => {
    stopCamera();
    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }
      streamRef.current = stream;
      setCameraOn(true);
    } catch {
      toast.error("Camera access denied — use Upload instead");
    }
  };

  const backupCardImage = async (dataUrl: string, leadId: string, which: CardSide) => {
    const compressed = await compressDataUrl(dataUrl, 0.8, 1400);
    const localKey = `card:${which}:${leadId}`;
    await putPendingCardImage({
      key: localKey,
      imageBase64: compressed.dataUrl,
      mimeType: compressed.mimeType,
      leadId,
      side: which,
      createdAt: new Date().toISOString(),
    });
    const applyPending = (prev: SideState | null): SideState | null =>
      prev
        ? { ...prev, pendingKey: localKey }
        : { preview: dataUrl, pendingKey: localKey };
    if (which === "front") setFront(applyPending);
    else setBack(applyPending);

    if (!navigator.onLine) {
      toast.message(
        "Card saved on device — will upload when the connection is good.",
      );
      return undefined;
    }

    try {
      const uploaded = await uploadCardImage({
        imageBase64: compressed.dataUrl,
        mimeType: compressed.mimeType,
      });
      if (uploaded.ok && uploaded.id) {
        await deletePendingCardImage(localKey);
        if (which === "front") {
          setFront((prev) =>
            prev ? { ...prev, imageId: uploaded.id, pendingKey: undefined } : prev,
          );
        } else {
          setBack((prev) =>
            prev ? { ...prev, imageId: uploaded.id, pendingKey: undefined } : prev,
          );
        }
        return uploaded.id;
      }
    } catch {
      toast.message("Card saved on device — will upload when the connection is good.");
    }
    return undefined;
  };

  const analyzeSide = async (dataUrl: string, leadId: string): Promise<CardPreview> => {
    setProgress(null);
    setStatusLabel("Reading card…");

    // Prefer cloud Gemini first when online (faster perceived result).
    if (navigator.onLine) {
      try {
        const ai = await analyzeCardCapture({
          imageBase64: dataUrl,
          mimeType: "image/jpeg",
        });
        if (ai.ok) {
          const confidence: Partial<Record<keyof Lead, number>> = {};
          for (const key of FIELD_KEYS) {
            const score = ai.fieldConfidence?.[key];
            if (typeof score === "number") confidence[key] = score;
          }
          return {
            lead: {
              id: leadId,
              name: sanitizeText(ai.fields.name) || undefined,
              company: sanitizeText(ai.fields.company) || undefined,
              designation: sanitizeText(ai.fields.designation) || undefined,
              mobile: sanitizeText(ai.fields.mobile) || undefined,
              email: sanitizeText(ai.fields.email) || undefined,
              city: sanitizeText(ai.fields.city) || undefined,
            },
            confidence,
            source: "gemini",
            aiIssues: ai.issues ?? [],
            ocrQuality: ai.ocrQuality,
            ocrText: "",
          };
        }
      } catch {
        /* fall through to on-device OCR */
      }
    }

    setProgress(0);
    setStatusLabel("Reading card on device…");
    const worker = await createWorker("eng", undefined, {
      logger: (m) => {
        if (m.status === "recognizing text" && typeof m.progress === "number") {
          setProgress(Math.round(m.progress * 100));
        }
      },
    });
    let localText = "";
    try {
      const { data } = await worker.recognize(dataUrl);
      localText = data.text;
    } finally {
      await worker.terminate();
    }

    if (navigator.onLine && localText.trim()) {
      try {
        const ai = await analyzeCardCapture({
          imageBase64: dataUrl,
          mimeType: "image/jpeg",
          ocrText: localText,
        });
        if (ai.ok) {
          const confidence: Partial<Record<keyof Lead, number>> = {};
          for (const key of FIELD_KEYS) {
            const score = ai.fieldConfidence?.[key];
            if (typeof score === "number") confidence[key] = score;
          }
          return {
            lead: {
              id: leadId,
              name: sanitizeText(ai.fields.name) || undefined,
              company: sanitizeText(ai.fields.company) || undefined,
              designation: sanitizeText(ai.fields.designation) || undefined,
              mobile: sanitizeText(ai.fields.mobile) || undefined,
              email: sanitizeText(ai.fields.email) || undefined,
              city: sanitizeText(ai.fields.city) || undefined,
            },
            confidence,
            source: "gemini",
            aiIssues: ai.issues ?? [],
            ocrQuality: ai.ocrQuality,
            ocrText: localText,
          };
        }
      } catch {
        /* use local parse */
      }
    }

    if (!localText.trim()) {
      throw new Error("Could not read card text — try a clearer photo");
    }
    const parsed = parseBusinessCardText(localText);
    return {
      lead: { ...parsed.lead, id: leadId },
      confidence: parsed.confidence,
      source: "tesseract",
      aiIssues: [],
      ocrText: localText,
    };
  };

  const processCaptured = async (dataUrl: string, which: CardSide) => {
    stopCamera();
    const draftLead = draftLeadId ? { id: draftLeadId } : createEmptyLead();
    if (!draftLeadId) setDraftLeadId(draftLead.id);

    const backupPromise = backupCardImage(dataUrl, draftLead.id, which).catch(() => undefined);
    const sideState: SideState = { preview: dataUrl, backupPromise };
    if (which === "front") {
      setFront(sideState);
      setBack(null);
      setParsedPreview(null);
      setAwaitingBackChoice(false);
    } else {
      setBack(sideState);
    }

    try {
      const result = await analyzeSide(dataUrl, draftLead.id);
      if (which === "front") {
        setParsedPreview(result);
        setAwaitingBackChoice(true);
      } else {
        setParsedPreview((prev) => (prev ? mergeCardFields(prev, result) : result));
        setAwaitingBackChoice(false);
      }
      setStatusLabel(null);
      setProgress(null);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Could not read card");
      setStatusLabel(null);
      setProgress(null);
      if (which === "back") setSide("front");
    }
  };

  const captureFrame = () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      toast.error("Camera not ready yet — wait a moment and try again");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    void processCaptured(canvas.toDataURL("image/jpeg", 0.9), side);
  };

  const onFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => void processCaptured(reader.result as string, side);
    reader.readAsDataURL(file);
  };

  const continueToForm = async () => {
    if (!parsedPreview) return;
    const base = createEmptyLead();
    const leadId = draftLeadId ?? parsedPreview.lead.id ?? base.id;

    let frontId = front?.imageId;
    let backId = back?.imageId;
    if (front?.backupPromise) frontId = (await front.backupPromise) ?? frontId;
    if (back?.backupPromise) backId = (await back.backupPromise) ?? backId;

    const merged = {
      ...base,
      ...parsedPreview.lead,
      id: leadId,
      name: sanitizeText(parsedPreview.lead.name) || "",
      company: sanitizeText(parsedPreview.lead.company) || "",
      designation: sanitizeText(parsedPreview.lead.designation) || "",
      mobile: sanitizeText(parsedPreview.lead.mobile) || "",
      email: sanitizeText(parsedPreview.lead.email) || "",
      city: sanitizeText(parsedPreview.lead.city) || "",
      fieldConfidence: parsedPreview.confidence,
    };
    const ocrConfidence = averageConfidence(parsedPreview.confidence);
    verifyCapturedLead(merged, { fieldConfidence: parsedPreview.confidence });

    const captureMeta: CaptureMeta = {
      ocrText: parsedPreview.ocrText,
      ocrConfidence,
      verifiedAt: new Date().toISOString(),
      fieldConfidence: parsedPreview.confidence as CaptureMeta["fieldConfidence"],
      processingNote: !frontId,
    };
    if (frontId) captureMeta.cardImageId = frontId;
    if (backId) captureMeta.cardImageIdBack = backId;
    if (parsedPreview.source === "gemini") {
      captureMeta.aiVerifiedAt = new Date().toISOString();
      captureMeta.aiIssues = parsedPreview.aiIssues;
      captureMeta.ocrQuality = parsedPreview.ocrQuality;
    }

    saveLeadDraft({
      lead: merged,
      captureSource: "card",
      captureMeta,
      fieldConfidence: parsedPreview.confidence,
    });

    if (!frontId) {
      toast.message(
        "Processing may take a moment. Save the lead now — we keep the card as backup and finish when the connection is good.",
      );
    }

    navigate({ to: "/leads/$leadId", params: { leadId: "new" }, search: { source: "card" } });
  };

  const resetAll = () => {
    setFront(null);
    setBack(null);
    setParsedPreview(null);
    setStatusLabel(null);
    setProgress(null);
    setAwaitingBackChoice(false);
    setSide("front");
    setDraftLeadId(undefined);
    void startCamera();
  };

  const showCaptureUi = !front || (side === "back" && !back && !awaitingBackChoice);
  const busy = statusLabel !== null || progress !== null;

  return (
    <div className="space-y-4">
      {showCaptureUi && (
        <>
          <p className="text-center text-sm font-medium text-foreground">
            {side === "front" ? "Capture card front" : "Capture card back (optional)"}
          </p>
          {cameraOn ? (
            <video
              ref={videoRef}
              className="aspect-[4/3] w-full rounded-xl bg-black object-cover"
              autoPlay
              muted
              playsInline
            />
          ) : (
            <div className="flex aspect-[4/3] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-secondary/40">
              <Camera className="size-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {side === "front" ? "Capture or upload the front of the card" : "Capture or upload the back"}
              </p>
            </div>
          )}
          <div className="flex gap-2">
            {!cameraOn ? (
              <Button className="h-11 flex-1 rounded-xl" onClick={() => void startCamera()}>
                <Camera className="size-4" />
                Open camera
              </Button>
            ) : (
              <Button className="h-11 flex-1 rounded-xl" onClick={captureFrame} disabled={busy}>
                Capture {side}
              </Button>
            )}
            <label className="inline-flex h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-medium">
              <Upload className="size-4" />
              Upload
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
              />
            </label>
          </div>
        </>
      )}

      {(front || back) && !showCaptureUi && (
        <div className="grid gap-3 sm:grid-cols-2">
          {front ? (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Front
              </p>
              <img src={front.preview} alt="Card front" className="w-full rounded-xl border border-border" />
            </div>
          ) : null}
          {back ? (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Back
              </p>
              <img src={back.preview} alt="Card back" className="w-full rounded-xl border border-border" />
            </div>
          ) : null}
        </div>
      )}

      {(progress !== null || statusLabel) && (
        <p className="text-center text-sm text-muted-foreground">
          {statusLabel ?? "Reading card…"}
          {progress !== null ? ` ${progress}%` : ""}
        </p>
      )}

      {parsedPreview && !busy && (
        <div className="rounded-xl border border-border bg-card p-4 text-sm">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-semibold">{parsedPreview.lead.name || "—"}</p>
              <p className="text-muted-foreground">{parsedPreview.lead.designation}</p>
              <p>{parsedPreview.lead.company}</p>
              <p className="mt-2 text-xs">{parsedPreview.lead.mobile}</p>
              <p className="text-xs">{parsedPreview.lead.email}</p>
            </div>
            <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              {parsedPreview.source === "gemini" ? "Verified" : "On-device read"}
            </span>
          </div>
          {front?.imageId || back?.imageId ? (
            <p className="mt-1 text-[11px] text-muted-foreground">
              Card photo{back ? "s" : ""} backed up
              {back ? " (front + back)" : ""}
            </p>
          ) : front?.pendingKey || back?.pendingKey ? (
            <p className="mt-1 text-[11px] text-muted-foreground">
              Card photo saved on device — will upload when online
            </p>
          ) : null}
        </div>
      )}

      {awaitingBackChoice && parsedPreview && !busy ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            className="h-11 flex-1 rounded-xl"
            variant="secondary"
            onClick={() => {
              setSide("back");
              setAwaitingBackChoice(false);
              void startCamera();
            }}
          >
            Add back of card
          </Button>
          <Button className="h-11 flex-1 rounded-xl" onClick={() => void continueToForm()}>
            Continue with front only
          </Button>
        </div>
      ) : null}

      {parsedPreview && !awaitingBackChoice && !busy && !showCaptureUi ? (
        <div className="flex gap-2">
          <Button className="h-11 flex-1 rounded-xl" onClick={() => void continueToForm()}>
            Continue to verify
          </Button>
          <Button variant="outline" className="h-11 rounded-xl" onClick={resetAll}>
            <RotateCcw className="size-4" />
            Retake
          </Button>
        </div>
      ) : null}

      {showCaptureUi && side === "back" ? (
        <Button
          variant="ghost"
          className="h-10 w-full rounded-xl"
          onClick={() => {
            setSide("front");
            setAwaitingBackChoice(true);
            stopCamera();
          }}
        >
          Skip back
        </Button>
      ) : null}
    </div>
  );
}
