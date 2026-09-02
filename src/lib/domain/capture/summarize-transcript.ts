const PRODUCT_KEYWORDS = [
  "Medical Equipment",
  "Surgical",
  "Diagnostics",
  "Software",
  "AI",
  "Hospital Infrastructure",
  "ventilator",
  "imaging",
  "equipment",
];

const TIMELINE_RE = /\b(this week|next week|within \d+|6\+?\s*months?|quarter|immediate)\b/i;
const ACTION_RE = /\b(demo|brochure|pricing|quotation|quote|follow-up|call|visit|site visit)\b/i;

export function summarizeTranscript(transcript: string): string {
  const text = transcript.trim();
  if (!text) return "";

  const sentences: string[] = [];
  sentences.push(`Booth conversation recorded: ${text.slice(0, 120)}${text.length > 120 ? "…" : ""}.`);

  const products = PRODUCT_KEYWORDS.filter((k) => text.toLowerCase().includes(k.toLowerCase()));
  if (products.length) {
    sentences.push(`Interest areas mentioned: ${products.slice(0, 3).join(", ")}.`);
  }

  const timeline = text.match(TIMELINE_RE)?.[0];
  const action = text.match(ACTION_RE)?.[0];
  if (timeline || action) {
    const parts = [];
    if (action) parts.push(`Requested ${action}`);
    if (timeline) parts.push(`timeline ${timeline}`);
    sentences.push(`${parts.join("; ")}.`);
  } else {
    sentences.push("Follow up with product information as discussed.");
  }

  return sentences.join(" ");
}
