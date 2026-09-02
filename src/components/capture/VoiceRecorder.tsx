import { useEffect, useRef, useState } from "react";
import { Mic, Square, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
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

export function VoiceRecorder({
  summary,
  consentAt,
  onSummaryChange,
  onConsentChange,
  onTranscript,
}: Props) {
  const [consented, setConsented] = useState(!!consentAt);
  const [recording, setRecording] = useState(false);
  const [interim, setInterim] = useState("");
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const transcriptRef = useRef("");

  const stopMedia = () => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    mediaRef.current?.stop();
    mediaRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  useEffect(() => () => stopMedia(), []);

  const start = async () => {
    if (!consented) {
      toast.error("Visitor must consent before recording");
      return;
    }

    const SpeechRecognitionClass = getSpeechRecognition();
    transcriptRef.current = summary;
    setInterim("");
    setRecording(true);
    onConsentChange(
      new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
    );

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      mediaRef.current = new MediaRecorder(stream);
      mediaRef.current.start();
    } catch {
      toast.message("Microphone unavailable — using speech-to-text only");
    }

    if (SpeechRecognitionClass) {
      const recognition = new SpeechRecognitionClass();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-IN";
      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let chunk = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          chunk += event.results[i][0].transcript;
        }
        if (event.results[event.results.length - 1]?.isFinal) {
          transcriptRef.current = `${transcriptRef.current} ${chunk}`.trim();
          onTranscript?.(transcriptRef.current);
          setInterim(transcriptRef.current);
        } else {
          setInterim(`${transcriptRef.current} ${chunk}`.trim());
        }
      };
      recognition.onerror = () => toast.error("Speech recognition error");
      recognition.start();
      recognitionRef.current = recognition;
    } else {
      toast.message("Speech recognition not supported — type summary manually");
    }
  };

  const stop = () => {
    setRecording(false);
    stopMedia();

    const full = interim || transcriptRef.current;
    if (full && !summary.trim()) {
      const generated = summarizeTranscript(full);
      onSummaryChange(generated);
      toast.success("AI summary generated from the conversation");
    } else if (full) {
      onTranscript?.(full);
    }
    setInterim("");
  };

  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-card">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Sparkles className="size-4 text-accent" />
          AI Conversation Recorder
        </h2>
        {recording && (
          <span className="flex items-center gap-1.5 text-xs font-medium text-destructive">
            <span className="size-2 animate-ping rounded-full bg-destructive" />
            Recording…
          </span>
        )}
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
        onClick={recording ? stop : () => void start()}
        variant={recording ? "destructive" : "secondary"}
        className="mt-3 h-11 w-full rounded-xl"
        disabled={!consented && !recording}
      >
        {recording ? <Square className="size-4" /> : <Mic className="size-4" />}
        {recording ? "Stop recording" : "Start recording"}
      </Button>

      <Textarea
        value={recording ? interim || summary : summary}
        onChange={(e) => onSummaryChange(e.target.value)}
        placeholder="AI transcript summary will appear here after recording…"
        className="mt-3 min-h-28 rounded-xl text-sm"
      />

      {consentAt && (
        <p className="mt-2 text-[11px] text-accent">Visitor consented to recording ✓ {consentAt}</p>
      )}
    </section>
  );
}
