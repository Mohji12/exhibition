import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Camera, RotateCcw, Upload } from "lucide-react";
import { createWorker } from "tesseract.js";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { analyzeCardCapture, uploadCardImage } from "@/lib/api/http-client";
import {
  compressDataUrl,
  putPendingCardImage,
} from "@/lib/domain/capture/card-image-store";
import { saveLeadDraft } from "@/lib/domain/capture/draft";
import { averageConfidence, parseBusinessCardText } from "@/lib/domain/capture/parse-ocr";
import { verifyCapturedLead } from "@/lib/domain/capture/verify-capture";
import { createEmptyLead } from "@/lib/domain/leads";
import type { CaptureMeta, Lead } from "@/lib/types";

type CardPreview = {
  lead: Partial<Lead>;
  confidence: Partial<Record<keyof Lead, number>>;
  source: "gemini" | "tesseract";
  aiIssues: string[];
  ocrQuality?: CaptureMeta["ocrQuality"];
};

export function CardCapture() {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [statusLabel, setStatusLabel] = useState<string | null>(null);
  const [parsedPreview, setParsedPreview] = useState<CardPreview | null>(null);
  const [ocrText, setOcrText] = useState("");
  const [cardImageId, setCardImageId] = useState<string | undefined>();
  const [pendingImageKey, setPendingImageKey] = useState<string | undefined>();
  const [draftLeadId, setDraftLeadId] = useState<string | undefined>();
  const backupPromiseRef = useRef<Promise<string | undefined> | null>(null);
  const [cameraOn, setCameraOn] = useState(false);

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
    void video.play().catch(() => {
      toast.error("Could not start camera preview");
    });

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

  const backupCardImage = async (dataUrl: string, leadId: string) => {
    const compressed = await compressDataUrl(dataUrl, 0.85, 1600);
    const localKey = `card:${leadId}`;
    try {
      // Do not pass leadId yet — lead row may not exist (FK). Attach on lead upsert.
      const uploaded = await uploadCardImage({
        imageBase64: compressed.dataUrl,
        mimeType: compressed.mimeType,
      });
      if (uploaded.ok && uploaded.id) {
        setCardImageId(uploaded.id);
        setPendingImageKey(undefined);
        return uploaded.id;
      }
    } catch {
      /* offline — keep in IndexedDB */
    }
    await putPendingCardImage({
      key: localKey,
      imageBase64: compressed.dataUrl,
      mimeType: compressed.mimeType,
      leadId,
      createdAt: new Date().toISOString(),
    });
    setPendingImageKey(localKey);
    return undefined;
  };

  const runOcr = async (dataUrl: string) => {
    setProgress(0);
    setStatusLabel("Reading card…");
    setPreview(dataUrl);
    setParsedPreview(null);
    setOcrText("");
    setCardImageId(undefined);
    setPendingImageKey(undefined);

    const draftLead = createEmptyLead();
    setDraftLeadId(draftLead.id);
    backupPromiseRef.current = backupCardImage(dataUrl, draftLead.id).catch((err) => {
      console.warn(err);
      return undefined;
    });

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
      setOcrText(localText);
    } catch (error) {
      console.error(error);
      toast.error("Could not read card text — try a clearer photo");
      setProgress(null);
      setStatusLabel(null);
      return;
    } finally {
      await worker.terminate();
    }

    if (!localText.trim()) {
      toast.error("Could not read card text — try a clearer photo");
      setProgress(null);
      setStatusLabel(null);
      return;
    }

    setProgress(null);
    setStatusLabel("Reading card…");

    try {
      const ai = await analyzeCardCapture({
        imageBase64: dataUrl,
        mimeType: "image/jpeg",
        ocrText: localText,
      });

      if (ai.ok) {
        const confidence: Partial<Record<keyof Lead, number>> = {};
        for (const key of ["name", "company", "designation", "mobile", "email", "city"] as const) {
          const score = ai.fieldConfidence?.[key];
          if (typeof score === "number") confidence[key] = score;
        }
        setParsedPreview({
          lead: {
            id: draftLead.id,
            name: ai.fields.name || undefined,
            company: ai.fields.company || undefined,
            designation: ai.fields.designation || undefined,
            mobile: ai.fields.mobile || undefined,
            email: ai.fields.email || undefined,
            city: ai.fields.city || undefined,
          },
          confidence,
          source: "gemini",
          aiIssues: ai.issues ?? [],
          ocrQuality: ai.ocrQuality,
        });
        setStatusLabel(null);
        return;
      }

      toast.message("Using on-device card reading");
    } catch {
      toast.message("Using on-device card reading");
    }

    const parsed = parseBusinessCardText(localText);
    setParsedPreview({
      lead: { ...parsed.lead, id: draftLead.id },
      confidence: parsed.confidence,
      source: "tesseract",
      aiIssues: [],
    });
    setStatusLabel(null);
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
    stopCamera();
    void runOcr(canvas.toDataURL("image/jpeg", 0.92));
  };

  const onFile = (file: File) => {
    stopCamera();
    const reader = new FileReader();
    reader.onload = () => void runOcr(reader.result as string);
    reader.readAsDataURL(file);
  };

  const continueToForm = async () => {
    if (!parsedPreview) return;
    const base = createEmptyLead();
    const leadId = draftLeadId ?? parsedPreview.lead.id ?? base.id;

    let imageId = cardImageId;
    if (backupPromiseRef.current) {
      imageId = (await backupPromiseRef.current) ?? imageId;
    }

    const merged = {
      ...base,
      ...parsedPreview.lead,
      id: leadId,
      name: parsedPreview.lead.name ?? "",
      company: parsedPreview.lead.company ?? "",
      designation: parsedPreview.lead.designation ?? "",
      mobile: parsedPreview.lead.mobile ?? "",
      email: parsedPreview.lead.email ?? "",
      city: parsedPreview.lead.city ?? "",
      fieldConfidence: parsedPreview.confidence,
    };
    const ocrConfidence = averageConfidence(parsedPreview.confidence);
    verifyCapturedLead(merged, { fieldConfidence: parsedPreview.confidence });

    const captureMeta: CaptureMeta = {
      ocrText,
      ocrConfidence,
      verifiedAt: new Date().toISOString(),
      fieldConfidence: parsedPreview.confidence as CaptureMeta["fieldConfidence"],
    };
    if (imageId) captureMeta.cardImageId = imageId;
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

    navigate({ to: "/leads/$leadId", params: { leadId: "new" }, search: { source: "card" } });
  };

  return (
    <div className="space-y-4">
      {!preview && (
        <>
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
              <p className="text-sm text-muted-foreground">Capture or upload a visiting card</p>
            </div>
          )}
          <div className="flex gap-2">
            {!cameraOn ? (
              <Button className="h-11 flex-1 rounded-xl" onClick={() => void startCamera()}>
                <Camera className="size-4" />
                Open camera
              </Button>
            ) : (
              <Button className="h-11 flex-1 rounded-xl" onClick={captureFrame}>
                Capture card
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

      {preview && (
        <>
          <img src={preview} alt="Captured card" className="w-full rounded-xl border border-border" />
          {(progress !== null || statusLabel) && (
            <p className="text-center text-sm text-muted-foreground">
              {statusLabel ?? "Reading card…"}
              {progress !== null ? ` ${progress}%` : ""}
            </p>
          )}
          {parsedPreview && (
            <div className="rounded-xl border border-border bg-card p-4 text-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{parsedPreview.lead.name}</p>
                  <p className="text-muted-foreground">{parsedPreview.lead.designation}</p>
                  <p>{parsedPreview.lead.company}</p>
                  <p className="mt-2 text-xs">{parsedPreview.lead.mobile}</p>
                  <p className="text-xs">{parsedPreview.lead.email}</p>
                </div>
                <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                  {parsedPreview.source === "gemini" ? "Verified" : "On-device read"}
                </span>
              </div>
              {parsedPreview.ocrQuality && (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Image quality: {parsedPreview.ocrQuality}
                </p>
              )}
              {cardImageId ? (
                <p className="mt-1 text-[11px] text-muted-foreground">Card photo backed up</p>
              ) : pendingImageKey ? (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Card photo saved on device — will upload when online
                </p>
              ) : null}
              {parsedPreview.aiIssues.length > 0 && (
                <ul className="mt-2 space-y-1 text-[11px] text-warning-foreground">
                  {parsedPreview.aiIssues.map((issue) => (
                    <li key={issue}>• {issue}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <div className="flex gap-2">
            <Button
              className="h-11 flex-1 rounded-xl"
              disabled={!parsedPreview}
              onClick={() => void continueToForm()}
            >
              Continue to verify
            </Button>
            <Button
              variant="outline"
              className="h-11 rounded-xl"
              onClick={() => {
                setPreview(null);
                setParsedPreview(null);
                setStatusLabel(null);
                setCardImageId(undefined);
                setPendingImageKey(undefined);
                void startCamera();
              }}
            >
              <RotateCcw className="size-4" />
              Retake
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
