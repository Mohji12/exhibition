import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { CalendarDays, MapPin, MonitorPlay, Presentation, Plus, Send } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useStore } from "@/lib/store";
import { formatValidationErrors, validateAppointment } from "@/lib/domain/validation";
import type { Appointment } from "@/lib/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/schedule")({
  head: () => ({
    meta: [
      { title: "Follow-up schedule — Conninter Visitor Book" },
      {
        name: "description",
        content:
          "See upcoming demos, site visits and calls with booth visitors, and schedule new follow-ups.",
      },
      { property: "og:title", content: "Follow-up schedule — Conninter Visitor Book" },
      {
        property: "og:description",
        content: "Upcoming appointments with MEDICON 2026 visitors and quick scheduling.",
      },
    ],
  }),
  component: SchedulePage,
});

const TYPE_ICON = {
  "Online call": MonitorPlay,
  Physical: MapPin,
  "Product Demo": Presentation,
  "Site Visit": MapPin,
} as const;

const STATUS_STYLE: Record<Appointment["status"], string> = {
  Confirmed: "bg-accent-soft text-accent",
  Pending: "bg-warm-soft text-warning-foreground",
  Rescheduled: "bg-info-soft text-info",
};

function SchedulePage() {
  const { appointments, leads, addAppointment } = useStore();
  const [open, setOpen] = useState(false);
  const [lead, setLead] = useState(leads[0]?.name ?? "");
  const [type, setType] = useState<Appointment["type"]>("Product Demo");
  const [date, setDate] = useState("2026-09-18");
  const [time, setTime] = useState("11:00");
  const [duration, setDuration] = useState("30 min");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    const when = `${new Date(date).toDateString().slice(0, 10)}, ${time}`;
    const draft = { lead, type, when, status: "Pending" as const };
    const parsed = validateAppointment(draft);
    if (!parsed.success) {
      toast.error(formatValidationErrors(parsed));
      return;
    }

    setSubmitting(true);
    try {
      await addAppointment(parsed.data);
      setOpen(false);
      toast.success("Appointment scheduled", {
        description: "Confirmation sent via WhatsApp and Email",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppShell title="Schedule" subtitle={`${appointments.length} upcoming follow-ups`}>
      <div className="space-y-2.5">
        {appointments.map((a) => {
          const Icon = TYPE_ICON[a.type];
          return (
            <div
              key={a.id}
              className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-card"
            >
              <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
                <Icon className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold text-foreground">{a.lead}</p>
                <p className="text-xs text-muted-foreground">
                  {a.type} · {a.when}
                </p>
              </div>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                  STATUS_STYLE[a.status],
                )}
              >
                {a.status}
              </span>
            </div>
          );
        })}
      </div>

      {!open ? (
        <Button className="mt-4 h-11 w-full rounded-xl" onClick={() => setOpen(true)}>
          <Plus className="size-4" />
          Schedule new
        </Button>
      ) : (
        <section className="mt-4 space-y-3 rounded-xl border border-border bg-card p-4 shadow-card">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <CalendarDays className="size-4 text-primary" />
            New appointment
          </h2>

          <div className="space-y-1.5">
            <Label>Visitor</Label>
            <Select value={lead} onValueChange={setLead}>
              <SelectTrigger className="h-11 rounded-xl">
                <SelectValue placeholder="Select visitor" />
              </SelectTrigger>
              <SelectContent>
                {leads.map((l) => (
                  <SelectItem key={l.id} value={l.name}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="date">Date</Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="h-11 rounded-xl"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="time">Time</Label>
              <Input
                id="time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="h-11 rounded-xl"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Meeting type</Label>
              <Select value={type} onValueChange={(v) => setType(v as Appointment["type"])}>
                <SelectTrigger className="h-11 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(TYPE_ICON) as Appointment["type"][]).map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Duration</Label>
              <Select value={duration} onValueChange={setDuration}>
                <SelectTrigger className="h-11 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["15 min", "30 min", "45 min", "1 hour"].map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <p className="flex items-center gap-1.5 rounded-lg bg-secondary px-3 py-2 text-[11px] text-muted-foreground">
            <Send className="size-3.5" />
            Confirmation will be sent via WhatsApp and Email
          </p>

          <div className="flex gap-2">
            <Button className="h-11 flex-1 rounded-xl" disabled={submitting} onClick={() => void submit()}>
              {submitting ? "Saving…" : "Confirm booking"}
            </Button>
            <Button
              variant="outline"
              className="h-11 rounded-xl"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
          </div>
        </section>
      )}
    </AppShell>
  );
}
