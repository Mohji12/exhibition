import { createFileRoute } from "@tanstack/react-router";
import { AdminLayout } from "@/components/AdminShell";

export const Route = createFileRoute("/admin")({
  component: AdminLayout,
});
