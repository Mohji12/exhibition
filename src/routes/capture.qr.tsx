import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { QrScanner } from "@/components/capture/QrScanner";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/capture/qr")({
  head: () => ({
    meta: [{ title: "Scan delegate QR — Conninter Visitor Book" }],
  }),
  component: QrScanPage,
});

function QrScanPage() {
  return (
    <AppShell title="Scan QR" subtitle="Delegate badge scanner">
      <Link to="/capture">
        <Button variant="ghost" size="sm" className="mb-3 -ml-2 gap-1 text-muted-foreground">
          <ArrowLeft className="size-4" />
          Back
        </Button>
      </Link>
      <QrScanner />
    </AppShell>
  );
}
