import { createFileRoute } from "@tanstack/react-router";
import { InvitePanel } from "@/components/InvitePanel";

export const Route = createFileRoute("/admin/invite")({
  head: () => ({
    meta: [{ title: "Invite exhibitors — FUNNEL" }],
  }),
  component: InvitePage,
});

function InvitePage() {
  return <InvitePanel variant="page" />;
}
