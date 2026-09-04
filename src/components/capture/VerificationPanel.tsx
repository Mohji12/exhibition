import { AlertCircle, CheckCircle2, AlertTriangle, Camera, QrCode } from "lucide-react";
import type { CaptureVerification, FieldStatus } from "@/lib/domain/capture/verify-capture";
import { filterStaleAiIssues } from "@/lib/domain/capture/verify-capture";
import type { CaptureSource, Lead } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const STATUS_ICON: Record<FieldStatus, typeof CheckCircle2> = {
  ok: CheckCircle2,
  warning: AlertTriangle,
  error: AlertCircle,
};

const STATUS_STYLE: Record<FieldStatus, string> = {
  ok: "text-accent",
  warning: "text-warning-foreground",
  error: "text-destructive",
};

type Props = {
  verification: CaptureVerification;
  lead: Lead;
  captureSource?: CaptureSource;
  onRecapture?: () => void;
};

export function VerificationPanel({ verification, lead, captureSource, onRecapture }: Props) {
  const seen = new Set<string>();
  const uniqueFields = verification.fields.filter((f) => {
    if (seen.has(f.field)) return false;
    seen.add(f.field);
    return ["name", "company", "designation", "mobile", "email", "city"].includes(f.field);
  });
  const aiIssues = filterStaleAiIssues(lead, lead.captureMeta?.aiIssues);
  const ocrQuality = lead.captureMeta?.ocrQuality;
  const aiVerified = Boolean(lead.captureMeta?.aiVerifiedAt);

  return (
    <section className="mt-3 rounded-xl border border-border bg-card p-4 shadow-card">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">Capture verification</h2>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[11px] font-semibold",
            verification.readyToSave ? "bg-accent-soft text-accent" : "bg-destructive/10 text-destructive",
          )}
        >
          {verification.readyToSave ? "Ready to save" : "Fix errors before saving"}
        </span>
      </div>

      {(aiVerified || ocrQuality) && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          {aiVerified ? "AI verified card fields" : captureSource === "qr" ? "QR scan" : "Local OCR"}
          {ocrQuality ? ` · Image quality: ${ocrQuality}` : ""}
        </p>
      )}

      {onRecapture && (
        <Button
          type="button"
          variant="outline"
          className="mt-3 h-10 w-full rounded-xl text-xs font-semibold"
          onClick={onRecapture}
        >
          {captureSource === "qr" ? (
            <>
              <QrCode className="size-3.5" />
              Re-scan QR
            </>
          ) : (
            <>
              <Camera className="size-3.5" />
              Re-capture card
            </>
          )}
        </Button>
      )}

      {aiIssues.length > 0 && (
        <ul className="mt-2 space-y-1 rounded-lg bg-secondary/60 px-3 py-2 text-[11px] text-warning-foreground">
          {aiIssues.map((issue) => (
            <li key={issue}>• {issue}</li>
          ))}
        </ul>
      )}

      <div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${verification.overallScore}%` }}
        />
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Overall confidence: {verification.overallScore}%
      </p>

      <ul className="mt-3 space-y-2">
        {uniqueFields.map((f) => {
          const Icon = STATUS_ICON[f.status];
          const value = String(lead[f.field as keyof Lead] ?? "—");
          return (
            <li key={f.field} className="flex items-start gap-2 text-xs">
              <Icon className={cn("mt-0.5 size-3.5 shrink-0", STATUS_STYLE[f.status])} />
              <div className="min-w-0 flex-1">
                <span className="font-medium capitalize">{f.field}</span>
                <span className="text-muted-foreground"> — {f.message}</span>
                <p className="truncate text-muted-foreground">{value}</p>
              </div>
              <span className="shrink-0 text-muted-foreground">{f.confidence}%</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function inputBorderForStatus(status?: FieldStatus): string {
  if (status === "error") return "border-destructive focus-visible:ring-destructive";
  if (status === "warning") return "border-warning focus-visible:ring-warning";
  return "";
}
