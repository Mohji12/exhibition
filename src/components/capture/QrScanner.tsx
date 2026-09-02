import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Html5Qrcode, Html5QrcodeScannerState } from "html5-qrcode";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { parseDelegateQr } from "@/lib/domain/capture/parse-qr";
import { saveLeadDraft } from "@/lib/domain/capture/draft";
import { createEmptyLead } from "@/lib/domain/leads";
import { verifyCapturedLead } from "@/lib/domain/capture/verify-capture";

const SCANNER_ID = "qr-reader";

async function safeStopScanner(scanner: Html5Qrcode | null): Promise<void> {
  if (!scanner) return;
  try {
    const state = scanner.getState();
    if (
      state === Html5QrcodeScannerState.NOT_STARTED ||
      state === Html5QrcodeScannerState.UNKNOWN
    ) {
      return;
    }
    await scanner.stop();
  } catch {
    /* html5-qrcode throws if stop races with start/unmount */
  }
}

export function QrScanner() {
  const navigate = useNavigate();
  const handledRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(true);
  const [retryCount, setRetryCount] = useState(0);

  const processScan = useCallback(
    (raw: string): boolean => {
      const parsed = parseDelegateQr(raw);
      if (!parsed.ok) {
        toast.error("Could not read badge — try another QR code");
        return false;
      }

      handledRef.current = true;
      const base = createEmptyLead();
      const merged: typeof base = {
        ...base,
        ...parsed.lead,
        name: parsed.lead.name ?? "",
        company: parsed.lead.company ?? "",
        designation: parsed.lead.designation ?? "",
        mobile: parsed.lead.mobile ?? "",
        email: parsed.lead.email ?? "",
        city: parsed.lead.city ?? "",
        fieldConfidence: parsed.confidence,
      };

      const verification = verifyCapturedLead(merged, { fieldConfidence: parsed.confidence });

      saveLeadDraft({
        lead: merged,
        captureSource: "qr",
        captureMeta: { rawQr: raw, verifiedAt: new Date().toISOString() },
        fieldConfidence: parsed.confidence,
      });

      toast.success("Delegate badge scanned", {
        description: verification.readyToSave ? "Review and save" : "Some fields need verification",
      });

      navigate({ to: "/leads/$leadId", params: { leadId: "new" }, search: { source: "qr" } });
      return true;
    },
    [navigate],
  );

  const restartScanner = useCallback(() => {
    handledRef.current = false;
    setError(null);
    setScanning(true);
    setRetryCount((c) => c + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let scanner: Html5Qrcode | null = null;

    const startScanner = async () => {
      scanner = new Html5Qrcode(SCANNER_ID);

      try {
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decoded) => {
            if (cancelled || handledRef.current) return;
            void (async () => {
              await safeStopScanner(scanner);
              if (cancelled) return;

              const accepted = processScan(decoded);
              if (accepted) {
                setScanning(false);
                return;
              }

              if (!cancelled) restartScanner();
            })();
          },
          () => {},
        );

        if (cancelled) {
          await safeStopScanner(scanner);
        }
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "Camera access denied";
        setError(message);
        setScanning(false);
      }
    };

    void startScanner();

    return () => {
      cancelled = true;
      void safeStopScanner(scanner);
    };
  }, [processScan, restartScanner, retryCount]);

  return (
    <div className="space-y-4">
      <div
        id={SCANNER_ID}
        className="min-h-[320px] overflow-hidden rounded-xl border border-border bg-black/5 [&_video]:rounded-xl"
      />
      {scanning && !error && (
        <p className="text-center text-xs text-muted-foreground">Point camera at delegate QR badge</p>
      )}
      {error && (
        <div className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>
      )}
      {error && (
        <Button className="h-11 w-full rounded-xl" onClick={restartScanner}>
          Try camera again
        </Button>
      )}
      <Button
        variant="outline"
        className="h-11 w-full rounded-xl"
        onClick={() =>
          navigate({
            to: "/leads/$leadId",
            params: { leadId: "new" },
            search: { source: "manual" },
          })
        }
      >
        Enter manually instead
      </Button>
    </div>
  );
}
