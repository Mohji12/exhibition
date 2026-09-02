import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { CalendarRange, Database, Plus, Tag, Users, X } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "Event admin — Conninter Visitor Book" },
      {
        name: "description",
        content: "Manage event settings, product interest tags and view your booth team.",
      },
      { property: "og:title", content: "Event admin — Conninter Visitor Book" },
      {
        property: "og:description",
        content: "Event configuration and team overview for Conninter booth staff.",
      },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const { interests, team, seedSource, lastSyncError, addInterest, removeInterest } = useStore();
  const [newTag, setNewTag] = useState("");

  const addTag = () => {
    addInterest(newTag);
    setNewTag("");
  };

  return (
    <AppShell title="Profile" subtitle="Event admin & settings">
      <section className="rounded-xl border border-border bg-card p-4 shadow-card">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <CalendarRange className="size-4 text-primary" />
          Event
        </h2>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Event name</dt>
            <dd className="font-medium text-foreground">MEDICON 2026</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Date range</dt>
            <dd className="font-medium text-foreground">28 – 30 Sept 2026</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Access window</dt>
            <dd className="font-medium text-foreground">Valid until 30 Sept 2026</dd>
          </div>
        </dl>
      </section>

      <section className="mt-4 rounded-xl border border-border bg-card p-4 shadow-card">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Database className="size-4 text-primary" />
          Data source
        </h2>
        <p className="mt-2 text-xs text-muted-foreground">
          {seedSource === "loading" && "Loading data from FastAPI backend…"}
          {seedSource === "api" &&
            "Connected to FastAPI backend. Saves sync to the exhibition database automatically."}
          {seedSource === "mock" &&
            "Using built-in mock data — FastAPI backend unavailable or not running."}
        </p>
        {lastSyncError ? (
          <p className="mt-2 text-xs text-destructive">Last sync issue: {lastSyncError}</p>
        ) : null}
      </section>

      <section className="mt-4 rounded-xl border border-border bg-card p-4 shadow-card">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Tag className="size-4 text-primary" />
          Product interest taxonomy
        </h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {interests.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground"
            >
              {tag}
              {interests.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeInterest(tag)}
                  className="rounded-full p-0.5 hover:bg-muted"
                  aria-label={`Remove ${tag}`}
                >
                  <X className="size-3" />
                </button>
              )}
            </span>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <Input
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            placeholder="Add new tag"
            className="h-10 rounded-xl"
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())}
          />
          <Button
            type="button"
            variant="outline"
            className="h-10 shrink-0 rounded-xl"
            onClick={addTag}
            disabled={!newTag.trim()}
          >
            <Plus className="size-4" />
            Add
          </Button>
        </div>
      </section>

      <section className="mt-4 rounded-xl border border-border bg-card p-4 shadow-card">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Users className="size-4 text-primary" />
          Team members
        </h2>
        <ul className="mt-3 space-y-2.5">
          {team.map((member) => (
            <li
              key={member.email}
              className="flex items-center justify-between gap-3 rounded-xl bg-secondary/60 px-3 py-2.5"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{member.name}</p>
                <p className="truncate text-xs text-muted-foreground">{member.email}</p>
              </div>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                  member.role === "Admin"
                    ? "bg-accent-soft text-accent"
                    : "bg-primary-soft text-primary",
                )}
              >
                {member.role}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </AppShell>
  );
}
