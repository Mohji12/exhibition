import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { CardCapture } from "@/components/capture/CardCapture";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/capture/card")({
  head: () => ({
    meta: [{ title: "Capture visiting card — Conninter Visitor Book" }],
  }),
  component: CardCapturePage,
});

function CardCapturePage() {
  return (
    <AppShell title="Visiting card" subtitle="Camera OCR capture">
      <Link to="/capture">
        <Button variant="ghost" size="sm" className="mb-3 -ml-2 gap-1 text-muted-foreground">
          <ArrowLeft className="size-4" />
          Back
        </Button>
      </Link>
      <CardCapture />
    </AppShell>
  );
}
