import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { z } from "zod";
import { AppShell } from "@/components/AppShell";
import { CardCapture } from "@/components/capture/CardCapture";
import { Button } from "@/components/ui/button";

const searchSchema = z.object({
  leadId: z.string().min(1).optional(),
});

export const Route = createFileRoute("/capture/card")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [{ title: "Capture visiting card — Conninter Visitor Book" }],
  }),
  component: CardCapturePage,
});

function CardCapturePage() {
  const { leadId } = Route.useSearch();
  const isRecapture = Boolean(leadId);

  return (
    <AppShell
      title="Visiting card"
      subtitle={isRecapture ? "Re-capture and verify again" : "Camera OCR capture"}
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
      {leadId ? <CardCapture recaptureLeadId={leadId} /> : <CardCapture />}
    </AppShell>
  );
}
