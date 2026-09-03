import { createFileRoute } from "@tanstack/react-router";
import { Camera, CheckCircle2, Upload, UserRound } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createWorker } from "tesseract.js";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  analyzePublicCard,
  fetchPublicExhibitor,
  submitPublicLead,
  type PublicExhibitor,
} from "@/lib/api/http-client";
import { compressDataUrl } from "@/lib/domain/capture/card-image-store";
import { parseBusinessCardText } from "@/lib/domain/capture/parse-ocr";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/e/$shareToken")({
  head: () => ({
    meta: [
      { title: "Leave your details — Conninter" },
      {
        name: "description",
        content: "Share your contact details and interests with this exhibitor.",
      },
    ],
  }),
  component: VisitorExhibitorPage,
});

type FormState = {
  name: string;
  company: string;
  designation: string;
  mobile: string;
  email: string;
  city: string;
};

const EMPTY_FORM: FormState = {
  name: "",
  company: "",
  designation: "",
  mobile: "",
  email: "",
  city: "",
};

function VisitorExhibitorPage() {
  const { shareToken } = Route.useParams();
  const [exhibitor, setExhibitor] = useState<PublicExhibitor | null>(null);
  const [error, setError] = useState("");
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [selected, setSelected] = useState<string[]>([]);
  const [captureSource, setCaptureSource] = useState<"qr" | "card">("qr");
  const [ocrText, setOcrText] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [done, setDone] = useState(false);
  const [showScan, setShowScan] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetchPublicExhibitor(shareToken)
      .then((data) => {
        if (!cancelled) setExhibitor(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Exhibitor not found");
      });
    return () => {
      cancelled = true;
    };
  }, [shareToken]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOn(false);
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  useEffect(() => {
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!cameraOn || !video || !stream) return;
    video.srcObject = stream;
    void video.play().catch(() => toast.error("Could not start camera"));
    return () => {
      video.srcObject = null;
    };
  }, [cameraOn]);

  const setField = (key: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const toggleInterest = (name: string) => {
    setSelected((prev) => (prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name]));
  };

  const applyParsed = (fields: Partial<FormState>, source: "qr" | "card", ocr?: string) => {
    setForm((prev) => ({
      name: fields.name?.trim() || prev.name,
      company: fields.company?.trim() || prev.company,
      designation: fields.designation?.trim() || prev.designation,
      mobile: fields.mobile?.trim() || prev.mobile,
      email: fields.email?.trim() || prev.email,
      city: fields.city?.trim() || prev.city,
    }));
    setCaptureSource(source);
    if (ocr) setOcrText(ocr);
    setShowScan(false);
    stopCamera();
    setPreview(null);
    toast.success("Card details filled — review and submit");
  };

  const processImage = async (dataUrl: string) => {
    setScanning(true);
    setPreview(dataUrl);
    try {
      const compressed = await compressDataUrl(dataUrl);
      const worker = await createWorker("eng");
      const result = await worker.recognize(compressed);
      await worker.terminate();
      const text = result.data.text || "";
      const parsed = parseBusinessCardText(text);

      let fields: Partial<FormState> = {
        name: parsed.lead.name,
        company: parsed.lead.company,
        designation: parsed.lead.designation,
        mobile: parsed.lead.mobile,
        email: parsed.lead.email,
        city: parsed.lead.city,
      };

      try {
        const base64 = compressed.includes(",") ? compressed.split(",")[1]! : compressed;
        const ai = await analyzePublicCard(shareToken, {
          imageBase64: base64,
          mimeType: "image/jpeg",
          ocrText: text,
        });
        if (ai.ok && ai.fields) {
          fields = {
            name: ai.fields.name || fields.name,
            company: ai.fields.company || fields.company,
            designation: ai.fields.designation || fields.designation,
            mobile: ai.fields.mobile || fields.mobile,
            email: ai.fields.email || fields.email,
            city: ai.fields.city || fields.city,
          };
        }
      } catch {
        // Tesseract-only fallback is fine for the public path.
      }

      applyParsed(fields, "card", text);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Could not read the card");
    } finally {
      setScanning(false);
    }
  };

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
      setShowScan(true);
    } catch {
      toast.error("Camera permission denied");
    }
  };

  const captureFrame = () => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    void processImage(canvas.toDataURL("image/jpeg", 0.92));
  };

  const onFile = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") void processImage(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const submit = async () => {
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (!form.mobile.trim() && !form.email.trim()) {
      toast.error("Provide a mobile number or email");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await submitPublicLead(shareToken, {
        name: form.name.trim(),
        company: form.company.trim() || undefined,
        designation: form.designation.trim() || undefined,
        mobile: form.mobile.trim() || undefined,
        email: form.email.trim() || undefined,
        city: form.city.trim() || undefined,
        interests: selected,
        captureSource,
        ocrText,
      });
      if (!result.ok) throw new Error(result.error || "Submit failed");
      setDone(true);
      toast.success("Details sent to the exhibitor");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Submit failed";
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  if (done && exhibitor) {
    return (
      <div className="min-h-screen bg-background">
        <div className="mx-auto flex min-h-screen w-full max-w-[430px] flex-col bg-background px-5 py-10 sm:my-6 sm:min-h-[calc(100vh-3rem)] sm:rounded-3xl sm:border sm:border-border">
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <CheckCircle2 className="size-14 text-accent" />
            <h1 className="mt-4 text-2xl font-semibold text-foreground">Thanks</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Your details were shared with {exhibitor.name}
              {exhibitor.company ? ` (${exhibitor.company})` : ""}.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex min-h-screen w-full max-w-[430px] flex-col bg-background sm:my-6 sm:min-h-[calc(100vh-3rem)] sm:rounded-3xl sm:border sm:border-border sm:overflow-hidden">
        <header className="bg-[image:var(--gradient-brand)] px-5 pb-6 pt-8 text-primary-foreground">
          <p className="text-[11px] uppercase tracking-[0.18em] text-primary-foreground/70">
            Conninter · MEDICON 2026
          </p>
          <h1 className="mt-1 text-xl font-semibold">Meet the exhibitor</h1>
          <p className="mt-1 text-xs text-primary-foreground/80">Leave your details in one step</p>
        </header>

        <main className="flex-1 space-y-4 px-5 py-5">
          {error && !exhibitor ? (
            <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              {error}
            </p>
          ) : null}

          {exhibitor ? (
            <section className="overflow-hidden rounded-2xl bg-[image:var(--gradient-brand)] p-5 text-primary-foreground shadow-float">
              <div className="flex items-center gap-3">
                <div className="grid size-11 place-items-center rounded-xl bg-card/15">
                  <UserRound className="size-6" />
                </div>
                <div>
                  <p className="text-sm font-semibold tracking-[0.12em]">
                    {exhibitor.company?.trim() || "Exhibitor"}
                  </p>
                  <p className="text-[11px] text-primary-foreground/75">
                    {exhibitor.designation?.trim() || "Booth contact"}
                  </p>
                </div>
              </div>
              <p className="mt-4 text-xl font-semibold">{exhibitor.name}</p>
              <div className="mt-2 space-y-0.5 text-xs text-primary-foreground/90">
                <p>{exhibitor.email}</p>
                {exhibitor.mobile ? <p>{exhibitor.mobile}</p> : null}
              </div>
            </section>
          ) : (
            <p className="text-sm text-muted-foreground">Loading exhibitor…</p>
          )}

          {exhibitor ? (
            <>
              <section className="rounded-xl border border-border bg-card p-4 shadow-card">
                <h2 className="text-sm font-semibold text-foreground">Scan your visiting card</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Optional — fill the form automatically if you prefer not to type.
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 rounded-xl"
                    disabled={scanning}
                    onClick={() => void startCamera()}
                  >
                    <Camera className="size-4" />
                    Camera
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 rounded-xl"
                    disabled={scanning}
                    onClick={() => fileRef.current?.click()}
                  >
                    <Upload className="size-4" />
                    Upload
                  </Button>
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => onFile(e.target.files?.[0] ?? null)}
                />
                {scanning ? (
                  <p className="mt-3 text-xs text-muted-foreground">Reading card…</p>
                ) : null}
                {showScan && cameraOn ? (
                  <div className="mt-3 space-y-2">
                    <video ref={videoRef} playsInline muted className="w-full rounded-xl bg-black" />
                    <div className="flex gap-2">
                      <Button className="h-10 flex-1 rounded-xl" onClick={captureFrame} disabled={scanning}>
                        Capture
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-10 rounded-xl"
                        onClick={() => {
                          stopCamera();
                          setShowScan(false);
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : null}
                {preview && !cameraOn ? (
                  <img src={preview} alt="Card preview" className="mt-3 max-h-40 w-full rounded-xl object-cover" />
                ) : null}
              </section>

              <section className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-card">
                <h2 className="text-sm font-semibold text-foreground">Your details</h2>
                {(
                  [
                    ["name", "Name", "text"],
                    ["company", "Company", "text"],
                    ["designation", "Designation", "text"],
                    ["mobile", "Mobile", "tel"],
                    ["email", "Email", "email"],
                    ["city", "City", "text"],
                  ] as const
                ).map(([key, label, type]) => (
                  <div key={key} className="space-y-1.5">
                    <Label htmlFor={`v-${key}`}>{label}</Label>
                    <Input
                      id={`v-${key}`}
                      type={type}
                      value={form[key]}
                      onChange={(e) => setField(key, e.target.value)}
                      className="h-11 rounded-xl"
                    />
                  </div>
                ))}

                {exhibitor.interests.length > 0 ? (
                  <div>
                    <p className="mb-2 text-sm font-medium text-foreground">Interests</p>
                    <div className="flex flex-wrap gap-2">
                      {exhibitor.interests.map((interest) => {
                        const on = selected.includes(interest);
                        return (
                          <button
                            key={interest}
                            type="button"
                            onClick={() => toggleInterest(interest)}
                            className={cn(
                              "rounded-full px-3 py-1.5 text-xs font-medium transition",
                              on
                                ? "bg-primary text-primary-foreground"
                                : "bg-secondary text-secondary-foreground",
                            )}
                          >
                            {interest}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                {error ? <p className="text-sm text-destructive">{error}</p> : null}

                <Button className="h-11 w-full rounded-xl" disabled={busy} onClick={() => void submit()}>
                  {busy ? "Sending…" : "Submit to exhibitor"}
                </Button>
              </section>
            </>
          ) : null}
        </main>
      </div>
    </div>
  );
}
