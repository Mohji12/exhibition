import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Camera, RotateCcw, Upload } from "lucide-react";
import { createWorker } from "tesseract.js";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { saveLeadDraft } from "@/lib/domain/capture/draft";
import { averageConfidence, parseBusinessCardText } from "@/lib/domain/capture/parse-ocr";
import { verifyCapturedLead } from "@/lib/domain/capture/verify-capture";
import { createEmptyLead } from "@/lib/domain/leads";

export function CardCapture() {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [parsedPreview, setParsedPreview] = useState<ReturnType<typeof parseBusinessCardText> | null>(
    null,
  );
  const [ocrText, setOcrText] = useState("");
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

  const runOcr = async (dataUrl: string) => {
    setProgress(0);
    setPreview(dataUrl);
    setParsedPreview(null);
    setOcrText("");

    const worker = await createWorker("eng", undefined, {
      logger: (m) => {
        if (m.status === "recognizing text" && typeof m.progress === "number") {
          setProgress(Math.round(m.progress * 100));
        }
      },
    });

    try {
      const { data } = await worker.recognize(dataUrl);
      setOcrText(data.text);
      const parsed = parseBusinessCardText(data.text);
      setParsedPreview(parsed);
      setProgress(null);
    } catch (error) {
      setProgress(null);
      console.error(error);
      toast.error("Could not read card text — try a clearer photo");
    } finally {
      await worker.terminate();
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
    stopCamera();
    void runOcr(canvas.toDataURL("image/jpeg", 0.92));
  };

  const onFile = (file: File) => {
    stopCamera();
    const reader = new FileReader();
    reader.onload = () => void runOcr(reader.result as string);
    reader.readAsDataURL(file);
  };

  const continueToForm = () => {
    if (!parsedPreview) return;
    const base = createEmptyLead();
    const merged = {
      ...base,
      ...parsedPreview.lead,
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

    saveLeadDraft({
      lead: merged,
      captureSource: "card",
      captureMeta: {
        ocrText,
        ocrConfidence,
        verifiedAt: new Date().toISOString(),
      },
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
          {progress !== null && (
            <p className="text-center text-sm text-muted-foreground">Reading card… {progress}%</p>
          )}
          {parsedPreview && (
            <div className="rounded-xl border border-border bg-card p-4 text-sm">
              <p className="font-semibold">{parsedPreview.lead.name}</p>
              <p className="text-muted-foreground">{parsedPreview.lead.designation}</p>
              <p>{parsedPreview.lead.company}</p>
              <p className="mt-2 text-xs">{parsedPreview.lead.mobile}</p>
              <p className="text-xs">{parsedPreview.lead.email}</p>
            </div>
          )}
          <div className="flex gap-2">
            <Button
              className="h-11 flex-1 rounded-xl"
              disabled={!parsedPreview}
              onClick={continueToForm}
            >
              Continue to verify
            </Button>
            <Button
              variant="outline"
              className="h-11 rounded-xl"
              onClick={() => {
                setPreview(null);
                setParsedPreview(null);
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
