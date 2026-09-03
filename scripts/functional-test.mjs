/**
 * Functional & logic tests for Conninter Visitor Book.
 * Run: node scripts/functional-test.mjs
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

// Load .env manually
function loadEnv() {
  try {
    const envPath = resolve(root, ".env");
    const content = readFileSync(envPath, "utf8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    /* optional */
  }
}

loadEnv();

const results = [];

function pass(name, detail = "") {
  results.push({ name, ok: true, detail });
  console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ""}`);
}

function fail(name, detail = "") {
  results.push({ name, ok: false, detail });
  console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
}

function assert(name, condition, detail = "") {
  if (condition) pass(name, detail);
  else fail(name, detail);
}

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

function normalizeMobile(mobile) {
  return (mobile ?? "").replace(/\D/g, "").slice(-10);
}

function findDuplicateLead(leads, candidate) {
  const email = normalizeEmail(candidate.email);
  const mobile = normalizeMobile(candidate.mobile);
  return leads.find(
    (l) =>
      l.id !== candidate.id &&
      ((email && normalizeEmail(l.email) === email) ||
        (mobile.length >= 10 && normalizeMobile(l.mobile) === mobile)),
  );
}

function buildSyncQueue(leads) {
  return leads.filter((l) => !l.synced);
}

function applySyncResults(leads, result) {
  const syncedSet = new Set(result.synced);
  return leads.map((l) => (syncedSet.has(l.id) ? { ...l, synced: true } : l));
}

function validateLead(lead) {
  const errors = [];
  if (!lead.name?.trim()) errors.push("Name is required");
  if (!lead.company?.trim()) errors.push("Company is required");
  if (!lead.email?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email)) errors.push("Valid email is required");
  if (!lead.mobile?.trim() || lead.mobile.replace(/\D/g, "").length < 10) errors.push("Mobile number is required");
  return errors;
}

// --- Pure logic: leads filter (mirrors domain/leads.ts) ---
function filterLeads(leads, { query = "", priority = null, interest = null, sync = null } = {}) {
  return leads.filter((l) => {
    const q = query.trim().toLowerCase();
    if (q && !`${l.name} ${l.company} ${l.email}`.toLowerCase().includes(q)) return false;
    if (priority && l.priority !== priority) return false;
    if (interest && !l.interests.includes(interest)) return false;
    if (sync === "synced" && !l.synced) return false;
    if (sync === "pending" && l.synced) return false;
    return true;
  });
}

// --- Pure logic: store operations (mirrors store.tsx) ---
function saveLead(leads, lead) {
  const exists = leads.some((l) => l.id === lead.id);
  return exists ? leads.map((l) => (l.id === lead.id ? lead : l)) : [lead, ...leads];
}

function syncAll(leads) {
  return leads.map((l) => ({ ...l, synced: true }));
}

function addInterest(interests, tag) {
  return interests.includes(tag) || !tag.trim() ? interests : [...interests, tag.trim()];
}

function removeInterest(interests, tag) {
  return interests.filter((t) => t !== tag);
}

function captureStats(leads, appointments) {
  const captured = leads.length;
  const hot = leads.filter((l) => l.priority === "hot").length;
  const followUps = appointments.filter((a) => a.status === "Pending").length;
  const synced = leads.filter((l) => l.synced).length;
  const syncPct = captured ? Math.round((synced / captured) * 100) : 0;
  return { captured, hot, followUps, synced, syncPct, pendingSync: leads.filter((l) => !l.synced).length };
}

const MOCK_LEADS = [
  {
    id: "1",
    name: "Dr. Ananya Rao",
    company: "Fortis Medical Centre",
    email: "ananya.rao@fortismedical.example",
    priority: "hot",
    interests: ["Medical Equipment", "Diagnostics"],
    synced: true,
  },
  {
    id: "2",
    name: "Rajesh Kumar",
    company: "CityCare Hospitals",
    email: "rajesh.kumar@citycare.example",
    priority: "warm",
    interests: ["Surgical"],
    synced: true,
  },
  {
    id: "3",
    name: "Dr. Meera Nair",
    company: "Sunrise Diagnostics",
    email: "meera.nair@sunrisediag.example",
    mobile: "+91 99887 66554",
    priority: "hot",
    interests: ["Diagnostics"],
    synced: false,
  },
];

const MOCK_APPOINTMENTS = [
  { id: "a1", lead: "Dr. Ananya Rao", type: "Product Demo", when: "Tomorrow", status: "Confirmed" },
  { id: "a2", lead: "Dr. Meera Nair", type: "Online call", when: "Thu", status: "Pending" },
];

console.log("\n=== Logic tests ===\n");

// Filter: priority hot
const hotOnly = filterLeads(MOCK_LEADS, { priority: "hot" });
assert("Filter by Hot priority", hotOnly.length === 2, `got ${hotOnly.length}`);

// Filter: search
const searchFortis = filterLeads(MOCK_LEADS, { query: "fortis" });
assert("Search by company name", searchFortis.length === 1 && searchFortis[0].id === "1");

// Filter: interest
const diag = filterLeads(MOCK_LEADS, { interest: "Diagnostics" });
assert("Filter by Diagnostics interest", diag.length === 2);

// Filter: pending sync
const pending = filterLeads(MOCK_LEADS, { sync: "pending" });
assert("Filter pending sync", pending.length === 1 && pending[0].id === "3");

// Filter: combined empty
const none = filterLeads(MOCK_LEADS, { priority: "cold" });
assert("Filter cold returns empty", none.length === 0);

// Save lead: new
const afterNew = saveLead(MOCK_LEADS, {
  id: "99",
  name: "Test User",
  company: "Test Co",
  email: "t@test.example",
  priority: "warm",
  interests: [],
  synced: false,
});
assert("Save new lead prepends list", afterNew.length === 4 && afterNew[0].id === "99");

// Save lead: update
const afterUpdate = saveLead(MOCK_LEADS, { ...MOCK_LEADS[0], priority: "cold" });
assert(
  "Save existing lead updates in place",
  afterUpdate.length === 3 && afterUpdate.find((l) => l.id === "1")?.priority === "cold",
);

// Sync all
const afterSync = syncAll(MOCK_LEADS);
assert("Sync all marks every lead synced", afterSync.every((l) => l.synced));

// Interest add/remove
assert("Add interest dedupes", addInterest(["A", "B"], "A").length === 2);
assert("Add interest appends", addInterest(["A"], "B").join() === "A,B");
assert("Remove interest", removeInterest(["A", "B", "C"], "B").join() === "A,C");

// Capture stats
const stats = captureStats(MOCK_LEADS, MOCK_APPOINTMENTS);
assert("Capture stats: captured count", stats.captured === 3);
assert("Capture stats: hot count", stats.hot === 2);
assert("Capture stats: pending follow-ups", stats.followUps === 1);
assert("Capture stats: pending sync", stats.pendingSync === 1);
assert("Capture stats: sync percentage", stats.syncPct === 67);

console.log("\n=== Domain: validation ===\n");

assert("Validation rejects empty name", validateLead({ name: "", company: "Co", email: "a@b.c", mobile: "9876543210" }).length > 0);
assert("Validation rejects bad email", validateLead({ name: "A", company: "Co", email: "bad", mobile: "9876543210" }).length > 0);
assert(
  "Validation accepts valid lead",
  validateLead({ name: "A", company: "Co", email: "a@b.example", mobile: "+91 9876543210" }).length === 0,
);

console.log("\n=== Domain: dedup ===\n");

const dupByEmail = findDuplicateLead(MOCK_LEADS, {
  id: "new",
  email: "ananya.rao@fortismedical.example",
  mobile: "0000000000",
});
assert("Dedup detects same email", dupByEmail?.id === "1");

const dupByMobile = findDuplicateLead(MOCK_LEADS, {
  id: "new",
  email: "unique@example.com",
  mobile: "+91 99887 66554",
});
assert("Dedup detects same mobile", dupByMobile?.id === "3");

const noDup = findDuplicateLead(MOCK_LEADS, {
  id: "new",
  email: "unique@example.com",
  mobile: "+91 7000000000",
});
assert("Dedup passes unique contact", noDup === undefined);

console.log("\n=== Domain: sync queue ===\n");

const queue = buildSyncQueue(MOCK_LEADS);
assert("Sync queue picks unsynced only", queue.length === 1 && queue[0].id === "3");

const afterApply = applySyncResults(MOCK_LEADS, { synced: ["3"], failed: [] });
assert("Apply sync results marks ids synced", afterApply.find((l) => l.id === "3")?.synced === true);

console.log("\n=== FastAPI backend tests ===\n");

const API_BASE = process.env.TEST_API_URL ?? (process.env.VITE_API_URL || "http://localhost:8000");
const ADMIN_EMAIL = process.env.AUTH_BOOTSTRAP_EMAIL || "admin@conninter.example";
const ADMIN_PIN = process.env.AUTH_BOOTSTRAP_PIN || "2026";

function authHeaders(token) {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

try {
  const health = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(3000) });
  assert("FastAPI health", health.ok, `status ${health.status}`);

  const unauthSeed = await fetch(`${API_BASE}/api/seed`, { signal: AbortSignal.timeout(5000) });
  assert("Seed rejects unauthenticated", unauthSeed.status === 401, `status ${unauthSeed.status}`);

  const badLogin = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: ADMIN_EMAIL, pin: "0000" }),
    signal: AbortSignal.timeout(5000),
  });
  assert("Login rejects bad PIN", badLogin.status === 401, `status ${badLogin.status}`);

  const loginRes = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: ADMIN_EMAIL, pin: ADMIN_PIN }),
    signal: AbortSignal.timeout(5000),
  });
  const loginBody = await loginRes.json();
  assert(
    "Admin login",
    loginRes.ok && loginBody.token && loginBody.user?.role === "Admin",
    loginBody.detail ?? `status ${loginRes.status}`,
  );
  const token = loginBody.token;

  const seedRes = await fetch(`${API_BASE}/api/seed`, {
    headers: authHeaders(token),
    signal: AbortSignal.timeout(5000),
  });
  assert("FastAPI seed endpoint", seedRes.ok, `status ${seedRes.status}`);
  const seed = await seedRes.json();

  assert("Seed: at least 5 leads", (seed?.leads?.length ?? 0) >= 5, `found ${seed?.leads?.length ?? 0}`);
  assert(
    "Seed: 3 appointments",
    seed?.appointments?.length === 3,
    `found ${seed?.appointments?.length ?? 0}`,
  );
  assert(
    "Seed: 6 product interests",
    seed?.interests?.length === 6,
    `found ${seed?.interests?.length ?? 0}`,
  );
  assert(
    "Seed: team includes admin",
    Array.isArray(seed?.team) &&
      seed.team.length >= 1 &&
      seed.team.some((m) => m.email === ADMIN_EMAIL),
    `found ${seed?.team?.length ?? 0}`,
  );

  const hotCount = seed.leads.filter((l) => l.priority === "hot").length;
  assert("Seed: 2 hot leads", hotCount === 2, `found ${hotCount}`);

  const pendingAppt = seed.appointments.filter((a) => a.status === "Pending").length;
  assert("Seed: 1 pending appointment", pendingAppt === 1, `found ${pendingAppt}`);

  const ananya = seed.leads.find((l) => l.id === "1");
  assert(
    "Lead interests join for Ananya Rao",
    ananya?.interests?.includes("Medical Equipment") &&
      ananya?.interests?.includes("Diagnostics"),
    ananya?.interests?.join(", ") ?? "missing",
  );

  const onlineAppt = seed.appointments.find((a) => a.id === "a2");
  assert("Appointment a2 is Online call", onlineAppt?.type === "Online call");

  const testId = `test-${Date.now()}`;
  const testLead = {
    id: testId,
    name: "Test Persist",
    company: "Test Hospital",
    designation: "Director",
    mobile: "+91 9000000001",
    email: "persist.test@conninter.example",
    city: "Mumbai",
    priority: "warm",
    interests: [],
    summary: "Phase 3 persistence test",
    synced: false,
    capturedAt: "Today, test",
  };

  const upsertRes = await fetch(`${API_BASE}/api/leads`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(testLead),
    signal: AbortSignal.timeout(5000),
  });
  const upsertBody = await upsertRes.json();
  assert(
    "Persistence: insert lead",
    upsertRes.ok && upsertBody.ok && upsertBody.lead?.name === "Test Persist",
    upsertBody.error ?? upsertBody.detail ?? `status ${upsertRes.status}`,
  );

  const inviteRes = await fetch(`${API_BASE}/api/admin/invite`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ fresh: true }),
    signal: AbortSignal.timeout(5000),
  });
  const invite1 = await inviteRes.json();
  assert(
    "Invite QR created",
    inviteRes.ok && invite1.token && /^\d{4}$/.test(invite1.pin),
    invite1.detail ?? `status ${inviteRes.status}`,
  );

  const lookupRes = await fetch(`${API_BASE}/api/auth/invite/${invite1.token}`, {
    signal: AbortSignal.timeout(5000),
  });
  const lookupBody = await lookupRes.json();
  assert("Invite lookup public", lookupRes.ok && lookupBody.ok);

  const refreshRes = await fetch(`${API_BASE}/api/admin/invite/refresh`, {
    method: "POST",
    headers: authHeaders(token),
    body: "{}",
    signal: AbortSignal.timeout(5000),
  });
  const invite2 = await refreshRes.json();
  assert(
    "PIN rotates on refresh",
    refreshRes.ok && invite2.token === invite1.token && invite2.pin !== invite1.pin,
    `token match ${invite2.token === invite1.token}, pins ${invite1.pin} -> ${invite2.pin}`,
  );

  const stamp = Date.now();
  const newEmail = `rep.${stamp}@conninter.example`;
  const staleActivate = await fetch(`${API_BASE}/api/auth/activate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      token: invite1.token,
      pin: invite1.pin,
      name: "Stale Pin Rep",
      email: `stale.${stamp}@conninter.example`,
      loginPin: "1357",
    }),
    signal: AbortSignal.timeout(5000),
  });
  assert("Activate rejects old PIN", staleActivate.status === 401, `status ${staleActivate.status}`);

  const activateRes = await fetch(`${API_BASE}/api/auth/activate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      token: invite2.token,
      pin: invite2.pin,
      name: "Test Rep",
      email: newEmail,
      loginPin: "2468",
    }),
    signal: AbortSignal.timeout(5000),
  });
  const activateBody = await activateRes.json();
  assert(
    "Activate with current PIN",
    activateRes.ok && activateBody.user?.role === "Rep" && activateBody.token,
    activateBody.detail ?? `status ${activateRes.status}`,
  );

  const dupActivate = await fetch(`${API_BASE}/api/auth/activate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      token: invite2.token,
      pin: invite2.pin,
      name: "Test Rep 2",
      email: newEmail,
      loginPin: "2468",
    }),
    signal: AbortSignal.timeout(5000),
  });
  assert("Activate rejects duplicate email", dupActivate.status === 409, `status ${dupActivate.status}`);

  const overviewRes = await fetch(`${API_BASE}/api/admin/overview`, {
    headers: authHeaders(token),
    signal: AbortSignal.timeout(5000),
  });
  const overview = await overviewRes.json();
  assert(
    "Admin overview expanded",
    overviewRes.ok &&
      overview.staffActive >= 2 &&
      overview.leads >= 5 &&
      typeof overview.warmLeads === "number" &&
      typeof overview.syncedLeads === "number" &&
      overview.bySource &&
      Array.isArray(overview.topInterests) &&
      overview.appointmentsByStatus,
    overview.detail ?? JSON.stringify(overview),
  );

  const usersRes = await fetch(`${API_BASE}/api/admin/users`, {
    headers: authHeaders(token),
    signal: AbortSignal.timeout(5000),
  });
  const users = await usersRes.json();
  const priya = users.find((u) => u.email === "priya@conninter.example");
  const ditto = users.find((u) => u.email === "ditto@conninter.example");
  assert(
    "Sample reps exist with lead counts",
    usersRes.ok && priya && ditto && typeof priya.leadsCaptured === "number",
    JSON.stringify({ priya, ditto }),
  );

  const priyaLogin = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "priya@conninter.example", pin: "1111" }),
    signal: AbortSignal.timeout(5000),
  });
  const priyaBody = await priyaLogin.json();
  assert("Priya sample login", priyaLogin.ok && priyaBody.token, priyaBody.detail);
  const priyaToken = priyaBody.token;
  const priyaId = priyaBody.user.id;

  const attrId = `attr-${Date.now()}`;
  const attrLead = {
    id: attrId,
    name: "Attributed Lead",
    company: "Attr Hospital",
    designation: "CMO",
    mobile: "+91 9333333333",
    email: `attr.${Date.now()}@conninter.example`,
    city: "Chennai",
    priority: "hot",
    interests: ["Diagnostics"],
    summary: "Attribution test",
    synced: false,
    capturedAt: "Today, attr",
    captureSource: "qr",
  };
  const attrRes = await fetch(`${API_BASE}/api/leads`, {
    method: "POST",
    headers: authHeaders(priyaToken),
    body: JSON.stringify(attrLead),
    signal: AbortSignal.timeout(5000),
  });
  const attrBody = await attrRes.json();
  assert(
    "Lead stamped with capturer",
    attrRes.ok && attrBody.ok && attrBody.lead?.capturedBy === priyaId,
    attrBody.error ?? attrBody.detail ?? JSON.stringify(attrBody.lead),
  );

  const filtered = await fetch(
    `${API_BASE}/api/admin/leads?capturedBy=${encodeURIComponent(priyaId)}&priority=hot`,
    { headers: authHeaders(token), signal: AbortSignal.timeout(5000) },
  );
  const filteredLeads = await filtered.json();
  assert(
    "Admin leads filter by capturer",
    filtered.ok &&
      Array.isArray(filteredLeads) &&
      filteredLeads.some((l) => l.id === attrId) &&
      filteredLeads.every((l) => l.capturedBy === priyaId),
    `count ${filteredLeads?.length}`,
  );

  const exportRes = await fetch(`${API_BASE}/api/admin/leads/export?capturedBy=${encodeURIComponent(priyaId)}`, {
    headers: authHeaders(token),
    signal: AbortSignal.timeout(5000),
  });
  const csvText = await exportRes.text();
  assert(
    "Admin leads CSV export",
    exportRes.ok && csvText.includes("Attributed Lead") && csvText.includes("name,"),
    csvText.slice(0, 120),
  );

  const delRes = await fetch(`${API_BASE}/api/admin/leads/${encodeURIComponent(attrId)}`, {
    method: "DELETE",
    headers: authHeaders(token),
    signal: AbortSignal.timeout(5000),
  });
  assert("Admin delete lead", delRes.ok, `status ${delRes.status}`);

  const apptsRes = await fetch(`${API_BASE}/api/admin/appointments`, {
    headers: authHeaders(token),
    signal: AbortSignal.timeout(5000),
  });
  const appts = await apptsRes.json();
  assert("Admin appointments list", apptsRes.ok && appts.length >= 3, `count ${appts?.length}`);
  const targetAppt = appts.find((a) => a.id === "a2") ?? appts[0];
  const patchAppt = await fetch(`${API_BASE}/api/admin/appointments/${encodeURIComponent(targetAppt.id)}`, {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify({ status: "Rescheduled" }),
    signal: AbortSignal.timeout(5000),
  });
  const patchedAppt = await patchAppt.json();
  assert(
    "Admin patch appointment status",
    patchAppt.ok && patchedAppt.status === "Rescheduled",
    patchedAppt.detail ?? JSON.stringify(patchedAppt),
  );
  // restore pending for seed consistency of other checks if a2
  if (targetAppt.id === "a2") {
    await fetch(`${API_BASE}/api/admin/appointments/a2`, {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify({ status: "Pending" }),
      signal: AbortSignal.timeout(5000),
    });
  }

  const repInterest = await fetch(`${API_BASE}/api/interests`, {
    method: "POST",
    headers: authHeaders(priyaToken),
    body: JSON.stringify({ name: `BlockedTag-${Date.now()}` }),
    signal: AbortSignal.timeout(5000),
  });
  assert("Rep cannot add interest", repInterest.status === 403, `status ${repInterest.status}`);

  const adminTag = `AdminTag-${Date.now()}`;
  const adminInterest = await fetch(`${API_BASE}/api/interests`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ name: adminTag }),
    signal: AbortSignal.timeout(5000),
  });
  const adminInterestBody = await adminInterest.json();
  assert(
    "Admin can add interest",
    adminInterest.ok && adminInterestBody.ok,
    adminInterestBody.error ?? `status ${adminInterest.status}`,
  );
  await fetch(`${API_BASE}/api/interests/remove`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ name: adminTag }),
    signal: AbortSignal.timeout(5000),
  });
} catch (err) {
  fail("FastAPI backend", err instanceof Error ? err.message : String(err));
  console.log(
    "  → Start backend with: cd backend && uvicorn app.main:app --reload --port 8000",
  );
}

console.log("\n=== Route smoke tests (dev server) ===\n");

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:8080";
const routes = [
  "/",
  "/join",
  "/capture",
  "/capture/qr",
  "/capture/card",
  "/leads/new?source=manual",
  "/leads",
  "/schedule",
  "/card",
  "/profile",
  "/admin",
  "/admin/leads",
  "/admin/followups",
];

const routeAssertions = {
  "/capture/qr": (html) => html.includes("Scan QR") || html.includes("Point camera"),
  "/capture/card": (html) => html.includes("Visiting card") || html.includes("Open camera"),
  "/leads/new?source=manual": (html) => html.includes("Visitor details"),
};

let serverUp = false;
try {
  const ping = await fetch(BASE, { signal: AbortSignal.timeout(3000) });
  serverUp = ping.ok || ping.status === 200 || ping.status === 304;
} catch {
  serverUp = false;
}

if (!serverUp) {
  console.log("  ⚠ Dev server not running — skipping HTTP tests (start with: npm run dev)");
} else {
  for (const route of routes) {
    try {
      const res = await fetch(`${BASE}${route}`, { signal: AbortSignal.timeout(5000) });
      const html = await res.text();
      const hasRoot = html.includes("Conninter") || html.includes("CONNINTER") || html.length > 500;
      assert(`GET ${route} returns page`, res.status === 200 && hasRoot, `status ${res.status}`);
      const extraCheck = routeAssertions[route];
      if (extraCheck) {
        assert(`GET ${route} content smoke`, extraCheck(html));
      }
    } catch (err) {
      fail(`GET ${route}`, err instanceof Error ? err.message : String(err));
    }
  }

  // Profile route should not 404
  try {
    const profileRes = await fetch(`${BASE}/profile`, { signal: AbortSignal.timeout(5000) });
    assert("Profile route not 404", profileRes.status !== 404, `status ${profileRes.status}`);
  } catch (err) {
    fail("Profile route", err instanceof Error ? err.message : String(err));
  }
}

console.log("\n=== Summary ===\n");
const passed = results.filter((r) => r.ok).length;
const failed = results.filter((r) => !r.ok);
console.log(`${passed}/${results.length} checks passed`);
if (failed.length) {
  console.log("\nFailed:");
  for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`);
  process.exit(1);
}
console.log("\nAll checks passed.\n");
