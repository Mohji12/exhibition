import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ShieldCheck, Stethoscope } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Conninter Visitor Book — Sign in" },
      {
        name: "description",
        content:
          "Booth lead-capture app for Conninter at MEDICON 2026. Sign in to scan delegates, capture cards and schedule follow-ups.",
      },
      { property: "og:title", content: "Conninter Visitor Book — Sign in" },
      {
        property: "og:description",
        content: "Lead capture for medical-equipment exhibitions. Scan, qualify and follow up.",
      },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");

  return (
    <div className="flex min-h-screen items-center justify-center bg-[image:var(--gradient-brand)] px-5 py-10">
      <div className="w-full max-w-[430px] rounded-3xl bg-card p-7 shadow-float">
        <div className="flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-2xl bg-primary text-primary-foreground">
            <Stethoscope className="size-6" />
          </div>
          <div>
            <p className="text-lg font-semibold tracking-tight text-foreground">CONNINTER</p>
            <p className="text-xs text-muted-foreground">Exhibition Visitor Book</p>
          </div>
        </div>

        <div className="mt-6 rounded-xl bg-primary-soft px-4 py-3">
          <p className="text-sm font-semibold text-primary">MEDICON 2026</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="size-3.5 text-accent" />
            Access valid until 30 Sept 2026
          </p>
        </div>

        <form
          className="mt-6 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            navigate({ to: "/capture" });
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="email">Work email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@conninter.com"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pin">Event PIN</Label>
            <Input
              id="pin"
              type="password"
              inputMode="numeric"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="••••"
            />
          </div>
          <Button type="submit" className="h-11 w-full rounded-xl text-base">
            Sign in
          </Button>
        </form>
      </div>
    </div>
  );
}
