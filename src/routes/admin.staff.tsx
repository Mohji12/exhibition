import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/staff")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/clients" });
  },
});
