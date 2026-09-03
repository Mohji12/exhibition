/**
 * Admin export + booth report smoke — run: npm run test:admin-export
 * Requires local API with admin credentials.
 */
import { writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const API_BASE = (process.env.TEST_API_URL ?? process.env.VITE_API_URL ?? "http://127.0.0.1:8000").replace(
  /\/$/,
  "",
);

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

console.log(`\nAdmin export / report test → ${API_BASE}\n`);

const loginRes = await fetch(`${API_BASE}/api/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "admin@conninter.example", pin: "2026" }),
});
const loginBody = await loginRes.json().catch(() => ({}));
assert("Admin login", loginRes.ok && Boolean(loginBody.token), loginBody.detail ?? String(loginRes.status));
if (!loginBody.token) {
  process.exitCode = 1;
  process.exit();
}
const auth = { Authorization: `Bearer ${loginBody.token}` };

const unauth = await fetch(`${API_BASE}/api/admin/reports/booth`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: "{}",
});
assert("Report requires auth", unauth.status === 401 || unauth.status === 403, `got ${unauth.status}`);

const reportRes = await fetch(`${API_BASE}/api/admin/reports/booth`, {
  method: "POST",
  headers: { ...auth, "Content-Type": "application/json" },
  body: "{}",
});
const report = await reportRes.json().catch(() => ({}));
assert("Booth report 200", reportRes.ok, report.detail ?? String(reportRes.status));
assert("Report has markdown", Boolean(report.markdown?.trim()), String(report.markdown ?? "").slice(0, 80));
assert("Report has stats", Boolean(report.stats), JSON.stringify(report.stats ?? null));
pass("usedAi flag", `usedAi=${report.usedAi}`);

const xlsxRes = await fetch(`${API_BASE}/api/admin/leads/export.xlsx`, { headers: auth });
assert("Excel export 200", xlsxRes.ok, `status ${xlsxRes.status}`);
const buf = Buffer.from(await xlsxRes.arrayBuffer());
assert("Excel is zip/xlsx", buf.length > 1000 && buf[0] === 0x50 && buf[1] === 0x4b, `size ${buf.length}`);
const out = resolve(root, "backend/tests/fixtures/last-export.xlsx");
writeFileSync(out, buf);
pass("Wrote sample xlsx", out);

// Tiny PNG upload as card image backup
const tinyPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const imgRes = await fetch(`${API_BASE}/api/capture/card-image`, {
  method: "POST",
  headers: { ...auth, "Content-Type": "application/json" },
  body: JSON.stringify({
    imageBase64: tinyPng.toString("base64"),
    mimeType: "image/png",
  }),
});
const imgBody = await imgRes.json().catch(() => ({}));
assert("Card image upload", imgRes.ok && imgBody.ok && imgBody.id, imgBody.detail ?? JSON.stringify(imgBody));

const failed = results.filter((r) => !r).length;
const passed = results.filter((r) => r).length;
console.log(`\n${passed} passed, ${failed} failed\n`);
process.exitCode = failed ? 1 : 0;
