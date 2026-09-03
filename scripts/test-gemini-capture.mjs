/**
 * Live Gemini card analysis test — run: npm run test:gemini
 * Requires local API with GEMINI_API_KEY set in backend/.env
 */
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const API_BASE = (process.env.TEST_API_URL ?? process.env.VITE_API_URL ?? "http://127.0.0.1:8000").replace(
  /\/$/,
  "",
);
const FIXTURE = resolve(root, "backend/tests/fixtures/sample-card.png");

const results = [];
function pass(n, d = "") {
  results.push(true);
  console.log(`  ✓ ${n}${d ? ` — ${d}` : ""}`);
}
function fail(n, d = "") {
  results.push(false);
  console.log(`  ✗ ${n}${d ? ` — ${d}` : ""}`);
}
function assert(n, c, d = "") {
  c ? pass(n, d) : fail(n, d);
}

async function readDetail(res) {
  try {
    const body = await res.json();
    if (typeof body.detail === "string") return body.detail;
    return JSON.stringify(body).slice(0, 200);
  } catch {
    return `status ${res.status}`;
  }
}

console.log(`\nGemini capture test → ${API_BASE}\n`);

if (!existsSync(FIXTURE)) {
  fail("Fixture exists", FIXTURE);
  process.exit(1);
}
pass("Fixture exists", FIXTURE);

const unauth = await fetch(`${API_BASE}/api/capture/analyze-card`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ imageBase64: "a".repeat(40) }),
});
assert("Unauthenticated returns 401", unauth.status === 401, `got ${unauth.status}`);

const loginRes = await fetch(`${API_BASE}/api/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "admin@conninter.example", pin: "2026" }),
});
const loginBody = await loginRes.json().catch(() => ({}));
assert(
  "Admin login",
  loginRes.ok && Boolean(loginBody.token),
  loginBody.detail ?? `status ${loginRes.status}`,
);

if (!loginBody.token) {
  console.log("\nCannot continue without auth token. Is the backend running?");
  process.exit(1);
}

const png = readFileSync(FIXTURE);
const imageBase64 = png.toString("base64");

const analyzeRes = await fetch(`${API_BASE}/api/capture/analyze-card`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${loginBody.token}`,
  },
  body: JSON.stringify({
    imageBase64,
    mimeType: "image/png",
    ocrText:
      "Dr. Ananya Mehta\nProcurement Head\nApollo Diagnostics Pvt Ltd\n+91 98765 43210\nananya.mehta@apollodx.example\nMumbai",
  }),
});

if (analyzeRes.status === 503) {
  fail("Analyze card (Gemini key configured)", await readDetail(analyzeRes));
  console.log("\nSet GEMINI_API_KEY in backend/.env and restart uvicorn.");
  process.exit(1);
}

const body = await analyzeRes.json().catch(() => ({}));
assert("Analyze card HTTP 200", analyzeRes.ok, body.error ?? body.detail ?? `status ${analyzeRes.status}`);
assert("Response ok flag", body.ok === true, body.error ?? "");
assert("Extracted name", Boolean(body.fields?.name?.trim()), body.fields?.name ?? "");
assert("Extracted email", Boolean(body.fields?.email?.trim()), body.fields?.email ?? "");
assert("Extracted mobile", Boolean(body.fields?.mobile?.trim()), body.fields?.mobile ?? "");
assert(
  "fieldConfidence present",
  body.fieldConfidence && typeof body.fieldConfidence === "object",
  JSON.stringify(body.fieldConfidence ?? null),
);
assert(
  "ocrQuality present",
  ["good", "fair", "poor"].includes(body.ocrQuality),
  String(body.ocrQuality),
);

const email = String(body.fields?.email ?? "").toLowerCase();
assert(
  "Email matches fixture domain",
  email.includes("ananya") || email.includes("apollo") || email.includes("@"),
  email,
);

const failed = results.filter((r) => !r).length;
const passed = results.filter((r) => r).length;
console.log(`\n${passed} passed, ${failed} failed\n`);
if (body.fields) {
  console.log("Extracted fields:", JSON.stringify(body.fields, null, 2));
  console.log("Confidence:", JSON.stringify(body.fieldConfidence, null, 2));
  if (body.issues?.length) console.log("Issues:", body.issues);
}
process.exitCode = failed ? 1 : 0;
