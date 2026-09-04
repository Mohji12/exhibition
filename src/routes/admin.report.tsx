import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { InlineLoader, PageLoader } from "@/components/PageLoader";
import { exportAdminLeadsXlsx, generateBoothReport } from "@/lib/api/http-client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/admin/report")({
  head: () => ({
    meta: [{ title: "Booth report — Conninter" }],
  }),
  component: AdminReportPage,
});

function AdminReportPage() {
  const { session, ready } = useAuth();
  const [markdown, setMarkdown] = useState("");
  const [generatedAt, setGeneratedAt] = useState("");
  const [usedAi, setUsedAi] = useState(false);
  const [busy, setBusy] = useState(false);

  const onGenerate = async () => {
    if (!ready || session?.user.role !== "Admin") return;
    setBusy(true);
    try {
      const report = await generateBoothReport();
      setMarkdown(report.markdown);
      setGeneratedAt(report.generatedAt);
      setUsedAi(report.usedAi);
      toast.success(report.usedAi ? "Report ready" : "Stats summary ready");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Report failed");
    } finally {
      setBusy(false);
    }
  };

  const onDownloadMd = () => {
    if (!markdown) return;
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "conninter-booth-report.md";
    a.click();
    URL.revokeObjectURL(url);
  };

  const onExcel = async () => {
    setBusy(true);
    try {
      const blob = await exportAdminLeadsXlsx({});
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "conninter-leads.xlsx";
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Excel workbook downloaded");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Excel export failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Conninter</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight text-foreground">Booth report</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Generate a booth narrative from stats and download a full Excel workbook (Leads, Stats,
        Summary).
      </p>

      <div className="mt-6 flex flex-wrap gap-2">
        <Button className="h-10 rounded-xl" disabled={busy} onClick={() => void onGenerate()}>
          {busy ? <InlineLoader className="mr-1" /> : null}
          {busy ? "Working…" : "Generate report"}
        </Button>
        <Button
          variant="outline"
          className="h-10 rounded-xl"
          disabled={busy || !markdown}
          onClick={onDownloadMd}
        >
          Download Markdown
        </Button>
        <Button
          variant="outline"
          className="h-10 rounded-xl"
          disabled={busy}
          onClick={() => void onExcel()}
        >
          {busy ? <InlineLoader className="mr-1" /> : null}
          Download Excel
        </Button>
        <Button variant="ghost" className="h-10 rounded-xl" asChild>
          <Link to="/admin/leads">Open leads</Link>
        </Button>
      </div>

      {busy && !markdown ? <PageLoader label="Preparing report…" compact className="mt-6" /> : null}

      {generatedAt ? (
        <p className="mt-4 text-[11px] text-muted-foreground">
          Generated {new Date(generatedAt).toLocaleString()}
          {usedAi ? "" : " · summary"}
        </p>
      ) : null}

      {markdown ? (
        <article className="prose prose-sm mt-4 max-w-none rounded-xl border border-border bg-card p-5 shadow-card whitespace-pre-wrap text-sm text-foreground">
          {markdown}
        </article>
      ) : (
        <div className="mt-6 rounded-xl border border-dashed border-border bg-secondary/40 p-8 text-center text-sm text-muted-foreground">
          Click Generate report to create a booth summary.
        </div>
      )}
    </div>
  );
}
