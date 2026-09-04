import { useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { transcribeConversation } from "@/lib/api/http-client";
import { summarizeTranscript } from "@/lib/domain/capture/summarize-transcript";

type SpeechRecognitionCtor = new () => SpeechRecognition;

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

type Props = {
  summary: string;
  consentAt?: string;
  onSummaryChange: (summary: string) => void;
  onConsentChange: (consentAt: string | undefined) => void;
  onTranscript?: (transcript: string) => void;
};

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const base64 = result.includes(",") ? result.split(",")[1]! : result;
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("Could not read recording"));
    reader.readAsDataURL(blob);
  });
}

export function VoiceRecorder({
  summary,
  consentAt,
  onSummaryChange,
  onConsentChange,
  onTranscript,
}: Props) {
  const [consented, setConsented] = useState(!!consentAt);
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [interim, setInterim] = useState("");
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const transcriptRef = useRef("");

  const stopTracks = () => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  useEffect(() => () => stopTracks(), []);

  const start = async () => {
    if (!consented) {
      toast.error("Visitor must consent before recording");
      return;
    }

    const SpeechRecognitionClass = getSpeechRecognition();
    transcriptRef.current = "";
    chunksRef.current = [];
    setInterim("");
    setRecording(true);
    onConsentChange(
      new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
    );

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : MediaRecorder.isTypeSupported("audio/mp4")
          ? "audio/mp4"
          : "";
      const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      mediaRef.current = recorder;
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      recorder.start(1000);
    } catch {
      toast.message("Microphone unavailable — type notes after you stop");
    }

    if (SpeechRecognitionClass) {
      const recognition = new SpeechRecognitionClass();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-IN";
      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let chunk = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          chunk += event.results[i]?.[0]?.transcript ?? "";
        }
        if (event.results[event.results.length - 1]?.isFinal) {
          transcriptRef.current = `${transcriptRef.current} ${chunk}`.trim();
          onTranscript?.(transcriptRef.current);
          setInterim(transcriptRef.current);
        } else {
          setInterim(`${transcriptRef.current} ${chunk}`.trim());
        }
      };
      recognition.onerror = () => {
        /* keep recording; server notes can still work */
      };
      recognition.start();
      recognitionRef.current = recognition;
    }
  };

  const stop = async () => {
    setRecording(false);
    const liveHint = (interim || transcriptRef.current).trim();
    const recorder = mediaRef.current;

    const finishLocal = () => {
      if (liveHint && !summary.trim()) {
        onSummaryChange(summarizeTranscript(liveHint));
        onTranscript?.(liveHint);
        toast.success("Conversation notes ready — edit if needed");
      } else if (liveHint) {
        onTranscript?.(liveHint);
      }
    };

    if (!recorder || recorder.state === "inactive") {
      stopTracks();
      mediaRef.current = null;
      finishLocal();
      setInterim("");
      return;
    }

    setProcessing(true);
    const blob: Blob = await new Promise((resolve) => {
      recorder.onstop = () => {
        resolve(new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" }));
      };
      recorder.stop();
    });
    stopTracks();
    mediaRef.current = null;

    try {
      if (blob.size < 64) {
        finishLocal();
        return;
      }
      const audioBase64 = await blobToBase64(blob);
      const result = await transcribeConversation({
        audioBase64,
        mimeType: blob.type || "audio/webm",
        transcriptHint: liveHint || undefined,
      });
      if (!result.ok) {
        finishLocal();
        toast.message("Could not process recording — type notes instead");
        return;
      }
      if (result.transcript) onTranscript?.(result.transcript);
      if (result.summary) onSummaryChange(result.summary);
      else if (result.transcript && !summary.trim()) {
        onSummaryChange(summarizeTranscript(result.transcript));
      }
      toast.success("Summary ready");
    } catch {
      finishLocal();
      toast.message("Could not process recording — type notes instead");
    } finally {
      setProcessing(false);
      setInterim("");
    }
  };

  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-card">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Conversation notes</h2>
        {recording ? (
          <span className="flex items-center gap-1.5 text-xs font-medium text-destructive">
            <span className="size-2 animate-ping rounded-full bg-destructive" />
            Recording…
          </span>
        ) : null}
        {processing ? <span className="text-xs text-muted-foreground">Processing…</span> : null}
      </div>

      <label className="mt-3 flex items-center gap-2 text-sm text-foreground">
        <Checkbox
          checked={consented}
          onCheckedChange={(v) => {
            const ok = v === true;
            setConsented(ok);
            if (!ok) onConsentChange(undefined);
          }}
        />
        Visitor consented to recording
      </label>

      <Button
        type="button"
        onClick={recording ? () => void stop() : () => void start()}
        variant={recording ? "destructive" : "secondary"}
        className="mt-3 h-11 w-full rounded-xl"
        disabled={(!consented && !recording) || processing}
      >
        {recording ? <Square className="size-4" /> : <Mic className="size-4" />}
        {recording ? "Stop recording" : processing ? "Processing…" : "Start recording"}
      </Button>

      <Textarea
        value={recording ? interim || summary : summary}
        onChange={(e) => onSummaryChange(e.target.value)}
        placeholder="Conversation summary appears here after recording…"
        className="mt-3 min-h-28 rounded-xl text-sm"
      />

      {consentAt ? (
        <p className="mt-2 text-[11px] text-accent">Visitor consented to recording · {consentAt}</p>
      ) : null}
    </section>
  );
}
