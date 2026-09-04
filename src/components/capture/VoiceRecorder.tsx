import { useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { reprocessAudio, transcribeConversation, uploadAudio } from "@/lib/api/http-client";
import { makeAudioKey, putPendingAudio } from "@/lib/domain/capture/audio-store";
import { summarizeTranscript } from "@/lib/domain/capture/summarize-transcript";
import { sanitizeText } from "@/lib/domain/sanitize-text";
import type { CaptureMeta } from "@/lib/types";

type SpeechRecognitionCtor = new () => SpeechRecognition;

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const PROCESS_NOTE =
  "Processing may take a moment. Save the lead now — we keep the recording and notes as backup and finish in the background when the connection is good.";

type Props = {
  leadId: string;
  summary: string;
  consentAt?: string;
  captureMeta?: CaptureMeta;
  onSummaryChange: (summary: string) => void;
  onConsentChange: (consentAt: string | undefined) => void;
  onCaptureMetaChange: (patch: Partial<CaptureMeta>) => void;
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
  leadId,
  summary,
  consentAt,
  captureMeta,
  onSummaryChange,
  onConsentChange,
  onCaptureMetaChange,
}: Props) {
  const [consented, setConsented] = useState(!!consentAt);
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [liveNotes, setLiveNotes] = useState("");
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const transcriptRef = useRef("");
  const autoSummaryRef = useRef("");
  const summaryRef = useRef(summary);

  useEffect(() => {
    summaryRef.current = summary;
  }, [summary]);

  const stopTracks = () => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  useEffect(() => () => stopTracks(), []);

  const applyLive = (text: string) => {
    const clean = sanitizeText(text);
    setLiveNotes(clean);
    onCaptureMetaChange({
      liveTranscript: clean || undefined,
      transcript: clean || undefined,
      voiceStatus: "recording",
    });
  };

  const start = async () => {
    if (!consented) {
      toast.error("Visitor must consent before recording");
      return;
    }

    const SpeechRecognitionClass = getSpeechRecognition();
    transcriptRef.current = "";
    chunksRef.current = [];
    setLiveNotes("");
    setRecording(true);
    onConsentChange(
      new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
    );
    onCaptureMetaChange({ voiceStatus: "recording", voiceError: undefined, processingNote: true });

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
      toast.message("Microphone unavailable — type live notes while talking");
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
          applyLive(transcriptRef.current);
        } else {
          applyLive(`${transcriptRef.current} ${chunk}`.trim());
        }
      };
      recognition.onerror = () => {
        /* keep recording; live notes + audio backup still work */
      };
      recognition.start();
      recognitionRef.current = recognition;
    }
  };

  const processInBackground = async (opts: {
    audioBase64: string;
    mimeType: string;
    audioKey: string;
    liveHint: string;
  }) => {
    const { audioBase64, mimeType, audioKey, liveHint: rawHint } = opts;
    const liveHint = sanitizeText(rawHint);
    let audioId = captureMeta?.audioId;

    try {
      if (!navigator.onLine) {
        onCaptureMetaChange({
          audioKey,
          liveTranscript: liveHint || undefined,
          transcript: liveHint || undefined,
          voiceStatus: "saved",
          processingNote: true,
        });
        toast.message(PROCESS_NOTE);
        return;
      }

      const uploaded = await uploadAudio({
        audioBase64,
        mimeType,
        leadId,
      });
      if (uploaded.ok && uploaded.id) {
        audioId = uploaded.id;
        await putPendingAudio({
          key: audioKey,
          audioBase64,
          mimeType,
          leadId,
          liveTranscript: liveHint,
          audioId,
          createdAt: new Date().toISOString(),
          status: "uploaded",
        });
        onCaptureMetaChange({
          audioId,
          audioKey,
          liveTranscript: liveHint || undefined,
          voiceStatus: "processing",
          processingNote: true,
        });
      }

      let result = audioId
        ? await reprocessAudio(audioId, liveHint || undefined)
        : await transcribeConversation({
            audioBase64,
            mimeType,
            transcriptHint: liveHint || undefined,
          });

      if (!result.ok && liveHint) {
        result = {
          ok: true,
          transcript: liveHint,
          summary: summarizeTranscript(liveHint),
          error: null,
        };
      }

      if (!result.ok) {
        onCaptureMetaChange({
          audioId,
          audioKey,
          liveTranscript: liveHint || undefined,
          transcript: liveHint || undefined,
          voiceStatus: "failed",
          voiceError: "Could not finish automatically. Your recording and live notes are kept.",
          processingNote: true,
        });
        toast.message(
          "Could not finish automatically. Your recording and live notes are kept — edit the summary if needed.",
        );
        return;
      }

      const nextTranscript = sanitizeText(result.transcript) || liveHint;
      const nextSummary =
        sanitizeText(result.summary) ||
        (nextTranscript ? summarizeTranscript(nextTranscript) : "");
      if (nextTranscript) {
        onCaptureMetaChange({
          audioId,
          audioKey,
          liveTranscript: liveHint || nextTranscript,
          transcript: nextTranscript,
          voiceStatus: "ready",
          voiceError: undefined,
          processingNote: false,
        });
      } else {
        onCaptureMetaChange({
          audioId,
          audioKey,
          liveTranscript: undefined,
          transcript: undefined,
          voiceStatus: "ready",
          voiceError: undefined,
          processingNote: false,
        });
      }
      if (nextSummary) {
        const current = sanitizeText(summaryRef.current);
        const previousAuto = autoSummaryRef.current;
        if (
          !current ||
          current === previousAuto ||
          (liveHint && current === summarizeTranscript(liveHint)) ||
          current.toLowerCase() === "null"
        ) {
          autoSummaryRef.current = nextSummary;
          onSummaryChange(nextSummary);
        }
      } else if (sanitizeText(summaryRef.current).toLowerCase() === "null") {
        onSummaryChange("");
      }
      toast.success(nextSummary || nextTranscript ? "Summary ready" : "Recording saved");
    } catch {
      onCaptureMetaChange({
        audioId,
        audioKey,
        liveTranscript: liveHint || undefined,
        transcript: liveHint || undefined,
        voiceStatus: navigator.onLine ? "failed" : "saved",
        voiceError: "Could not finish automatically. Your recording and live notes are kept.",
        processingNote: true,
      });
      toast.message(PROCESS_NOTE);
    }
  };

  const stop = async () => {
    setRecording(false);
    const liveHint = sanitizeText(liveNotes || transcriptRef.current);
    const recorder = mediaRef.current;

    if (liveHint) {
      onCaptureMetaChange({
        liveTranscript: liveHint,
        transcript: liveHint,
        voiceStatus: "processing",
        processingNote: true,
      });
      if (!sanitizeText(summary)) {
        const local = summarizeTranscript(liveHint);
        autoSummaryRef.current = local;
        onSummaryChange(local);
      }
    } else if (sanitizeText(summary).toLowerCase() === "null") {
      onSummaryChange("");
    }

    if (!recorder || recorder.state === "inactive") {
      stopTracks();
      mediaRef.current = null;
      if (liveHint) toast.message(PROCESS_NOTE);
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
        onCaptureMetaChange({
          liveTranscript: liveHint || undefined,
          transcript: liveHint || undefined,
          voiceStatus: liveHint ? "ready" : undefined,
        });
        return;
      }
      const audioBase64 = await blobToBase64(blob);
      const mimeType = blob.type || "audio/webm";
      const audioKey = makeAudioKey(leadId);
      await putPendingAudio({
        key: audioKey,
        audioBase64,
        mimeType,
        leadId,
        liveTranscript: liveHint,
        createdAt: new Date().toISOString(),
        status: "pending",
      });
      onCaptureMetaChange({
        audioKey,
        liveTranscript: liveHint || undefined,
        transcript: liveHint || undefined,
        voiceStatus: "processing",
        processingNote: true,
      });
      toast.message(PROCESS_NOTE);
      void processInBackground({ audioBase64, mimeType, audioKey, liveHint }).finally(() => {
        setProcessing(false);
      });
      setProcessing(false);
    } catch {
      onCaptureMetaChange({
        liveTranscript: liveHint || undefined,
        transcript: liveHint || undefined,
        voiceStatus: "failed",
        voiceError: "Could not save recording backup locally.",
        processingNote: true,
      });
      toast.message(PROCESS_NOTE);
      setProcessing(false);
    }
  };

  const voiceStatus = captureMeta?.voiceStatus;
  const showProcessBanner =
    voiceStatus === "processing" ||
    voiceStatus === "saved" ||
    voiceStatus === "failed" ||
    captureMeta?.processingNote;

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
        {processing || voiceStatus === "processing" ? (
          <span className="text-xs text-muted-foreground">Processing in background…</span>
        ) : null}
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
        disabled={!consented && !recording}
      >
        {recording ? <Square className="size-4" /> : <Mic className="size-4" />}
        {recording ? "Stop recording" : "Start recording"}
      </Button>

      {(recording || liveNotes || captureMeta?.liveTranscript) && (
        <div className="mt-3 rounded-xl border border-border bg-secondary/40 px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Live notes (backup)
          </p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">
            {recording
              ? liveNotes || "Listening…"
              : liveNotes || captureMeta?.liveTranscript || "—"}
          </p>
        </div>
      )}

      {showProcessBanner ? (
        <p className="mt-3 rounded-xl border border-primary/20 bg-primary-soft px-3 py-2 text-xs text-primary">
          {captureMeta?.voiceError || PROCESS_NOTE}
        </p>
      ) : null}

      <Textarea
        value={summary === "null" || summary === "undefined" ? "" : summary}
        onChange={(e) => {
          const next = e.target.value;
          onSummaryChange(next === "null" || next === "undefined" ? "" : next);
        }}
        placeholder="Conversation summary — editable anytime"
        className="mt-3 min-h-28 rounded-xl text-sm"
      />

      {consentAt ? (
        <p className="mt-2 text-[11px] text-accent">Visitor consented to recording · {consentAt}</p>
      ) : null}
    </section>
  );
}
