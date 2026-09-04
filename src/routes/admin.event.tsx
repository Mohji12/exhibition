import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/admin/event")({
  head: () => ({
    meta: [{ title: "Event settings — FUNNEL" }],
  }),
  component: EventSettingsPage,
});

function EventSettingsPage() {
  const { interests, addInterest, removeInterest } = useStore();
  const [newTag, setNewTag] = useState("");

  const addTag = () => {
    addInterest(newTag);
    setNewTag("");
  };

  return (
    <div className="mx-auto max-w-xl">
      <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">FUNNEL</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight text-foreground">Event</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Exhibition names are set by each exhibitor on their Profile. Manage the shared product-interest
        tags used on the lead form here.
      </p>

      <h2 className="mt-10 text-lg font-semibold text-foreground">Product interests</h2>
      <div className="mt-4 flex flex-wrap gap-2">
        {interests.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground"
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
      <div className="mt-4 flex gap-2">
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
    </div>
  );
}
