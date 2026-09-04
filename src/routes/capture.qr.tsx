import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { z } from "zod";
import { AppShell } from "@/components/AppShell";
import { QrScanner } from "@/components/capture/QrScanner";
import { Button } from "@/components/ui/button";

const searchSchema = z.object({
  leadId: z.string().min(1).optional(),
});

export const Route = createFileRoute("/capture/qr")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [{ title: "Scan delegate QR — Conninter Visitor Book" }],
  }),
  component: QrScanPage,
});

function QrScanPage() {
  const { leadId } = Route.useSearch();
  const isRecapture = Boolean(leadId);

  return (
    <AppShell
      title="Scan QR"
      subtitle={isRecapture ? "Re-scan and verify again" : "Delegate badge scanner"}
    >
      {leadId ? (
        <Link to="/leads/$leadId" params={{ leadId }}>
          <Button variant="ghost" size="sm" className="mb-3 -ml-2 gap-1 text-muted-foreground">
            <ArrowLeft className="size-4" />
            Back
          </Button>
        </Link>
      ) : (
        <Link to="/capture">
          <Button variant="ghost" size="sm" className="mb-3 -ml-2 gap-1 text-muted-foreground">
            <ArrowLeft className="size-4" />
            Back
          </Button>
        </Link>
      )}
      {leadId ? <QrScanner recaptureLeadId={leadId} /> : <QrScanner />}
    </AppShell>
  );
}
