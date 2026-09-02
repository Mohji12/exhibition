# Conninter Connect

# Frontend mockup prompt — Conninter Exhibition Visitor Book

Original product specification used to build this mockup:

---

Build a mobile-first web app called **"Conninter Visitor Book"** — a lead-capture tool used by booth staff at medical-equipment trade exhibitions. This is a **UI mockup with realistic sample data** — no real backend or auth required, just working navigation and interactive-looking components with mock state (clicking "Save Lead" should visibly add it to a list, toggling filters should visibly filter, etc.).

## Visual style
- Clean, professional B2B SaaS aesthetic — this is used in front of hospital procurement staff, so it should feel trustworthy and modern, not flashy.
- Primary color: deep blue (#0A5EA8). Accent: teal (#16A085) for success/positive actions. Neutral grays for backgrounds and cards.
- Mobile-first (this is used on a phone/tablet at a booth) but should also look good at desktop width — design for a max content width of ~430px on mobile, centered card-based layout on desktop.
- Rounded cards (12px radius), soft shadows, generous spacing — avoid a cramped, form-heavy feel even though there's a lot of data entry.
- Use a bottom tab bar on mobile for primary navigation (Capture / Leads / Schedule / Card / Profile).

## Screens to build

### 1. Login screen
- Conninter logo/wordmark, event name shown ("MEDICON 2026"), simple email + PIN login
- "Access valid until 30 Sept 2026" notice banner

### 2. Home / Capture screen
Three big tappable action cards:
- "Scan Delegate QR" (camera icon)
- "Capture Visiting Card" (card icon)
- "Manual Entry" (pencil icon)

Below that, a small "Today" summary strip: leads captured today (e.g. 14), hot leads (e.g. 4), pending follow-ups (e.g. 3).

Include a **sync status indicator** in the header — a small pill showing "All synced" (green) or "3 pending sync" (amber with a spinning icon) to visually communicate the offline-first behavior.

### 3. Visitor Details / Lead form screen
- Editable fields: Name, Company, Designation, Mobile, Email, City — pre-filled with sample scanned data to simulate a successful QR/OCR capture, with a small "Auto-filled — please verify" notice above the fields
- Product Interest checklist: Medical Equipment, Surgical, Diagnostics, Software, AI Solutions, Hospital Infrastructure
- Lead Priority selector: Hot 🔴 / Warm 🟡 / Cold 🔵 (segmented control style)
- "AI Conversation Recorder" section: a record button (with a pulsing red dot when "recording" — just a UI state toggle), a transcript/summary textarea pre-filled with a realistic sample AI summary (see sample data below), and a visible "Visitor consented to recording ✓ 14:32" line to represent the consent capture
- Sticky bottom bar with "Save Lead" / "Save & Schedule" buttons

### 4. Leads dashboard (list/table)
- Searchable, filterable list of captured leads (filter chips: Hot/Warm/Cold, product interest, synced/pending)
- Each row: name, company, priority badge, product interest tags, small sync-status dot
- Tapping a row opens the Visitor Details screen pre-filled with that lead's data
- Empty state design for "no leads match your filter"

### 5. Schedule / Follow-up screen
- List of upcoming appointments (date, time, visitor name, meeting type icon: Online/Physical/Product Demo/Site Visit)
- "Schedule new" flow: date/time picker, meeting type, duration, and a preview line: "Confirmation will be sent via WhatsApp and Email"
- Status badges: Confirmed / Pending / Rescheduled

### 6. Digital Business Card screen
- A shareable card preview (Conninter branding, rep name, contact info, QR code placeholder)
- Share buttons: WhatsApp, Email, SMS, "Show QR"
- Small "Viewed by 6 visitors" engagement stat

### 7. Event admin (simple settings screen)
- Event name, date range, access window
- Editable product-interest taxonomy (add/remove tags)
- Team members list with role badges (Rep / Admin)

## Sample data to use throughout (fictional, for mockup purposes)

**Leads:**
1. Dr. Ananya Rao — Fortis Medical Centre — Chief Procurement Officer — +91 98765 43210 — ananya.rao@fortismedical.example — Hot 🔴 — Interests: Medical Equipment, Diagnostics — AI summary: "Interested in ICU ventilators for a 300-bed expansion. Requested pricing and a product demo next week. Budget approved for this quarter."
2. Rajesh Kumar — CityCare Hospitals — Purchase Manager — +91 91234 56780 — rajesh.kumar@citycare.example — Warm 🟡 — Interests: Surgical, Hospital Infrastructure — AI summary: "Exploring surgical equipment upgrade for new wing, timeline is 6+ months out. Wants brochure emailed."
3. Dr. Meera Nair — Sunrise Diagnostics — Director — +91 99887 66554 — meera.nair@sunrisediag.example — Hot 🔴 — Interests: Diagnostics, AI Solutions — AI summary: "Very engaged, asked detailed questions about AI-assisted diagnostic imaging. Wants a follow-up call this week."
4. Faisal Ahmed — Al Noor Hospital Group — IT Director — +91 90000 11223 — faisal.ahmed@alnoorhealth.example — Warm 🟡 — Interests: Software, AI Solutions — Not yet recorded.
5. Sunita Deshpande — Wellness Care Clinics — Operations Head — +91 98111 22334 — sunita.d@wellnesscare.example — Cold 🔵 — Interests: Hospital Infrastructure — "Just browsing, took a brochure."

**Appointments:**
- Dr. Ananya Rao — Product Demo — Tomorrow, 11:00 AM — Confirmed
- Dr. Meera Nair — Online call — Thu, 3:00 PM — Pending
- Rajesh Kumar — Site Visit — Next Mon, 10:00 AM — Confirmed

**Today's summary:** 14 leads captured, 4 hot, 3 pending follow-ups, 11/14 synced.

**Team members:** Ditto (Rep), Priya S. (Rep), Conninter Admin (Admin).

## Interaction notes
- Clicking "Save Lead" should show a brief success toast and add/update the lead in the dashboard list (client-side state only)
- Toggling the record button should visually animate a "recording" state and then reveal the pre-filled AI summary after a short simulated delay
- Filter chips on the dashboard should actually filter the visible sample leads
- All of this can run on mock/local state — no real backend, auth, or API calls needed for this mockup

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
