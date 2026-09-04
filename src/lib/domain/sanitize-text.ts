/** Coerce API/LLM nullish strings so UI never shows "null" / "undefined". */
export function sanitizeText(value: unknown): string {
  if (value == null) return "";
  const text = String(value).trim();
  if (!text) return "";
  const lower = text.toLowerCase();
  if (lower === "null" || lower === "undefined" || lower === "none" || lower === "n/a") {
    return "";
  }
  return text;
}
