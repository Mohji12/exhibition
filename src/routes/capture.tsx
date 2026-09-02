import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/capture")({
  component: CaptureLayout,
});

function CaptureLayout() {
  return <Outlet />;
}
