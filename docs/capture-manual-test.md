# Capture Flow — Manual Device Test Checklist

Use this checklist on real hardware with camera and microphone. Automated tests cover routing and domain logic; this matrix validates live QR decode, OCR quality, and mic behavior.

## Environment matrix

| Environment | URL | Notes |
|-------------|-----|-------|
| Chrome desktop | `http://localhost:8080` | Prefer Incognito; disable Scrnli and similar extensions |
| Chrome Android | Same LAN IP or USB remote debug | Grant camera/mic when prompted |
| Safari iOS | HTTPS tunnel or local network | iOS requires secure context for getUserMedia |
| Incognito / clean profile | Any | Avoids hydration noise from injected extension DOM |

**Prerequisites**

- Dev server running: `npm run dev`
- MySQL schema applied: `sql/004_capture_metadata.sql` (capture columns on `leads`)
- Booth Wi-Fi or offline mode tested separately if relevant

---

## QR scan scenarios

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| Q1 | JSON badge QR | Scan `{"name":"Dr. Test","email":"a@b.example","company":"Fortis","mobile":"9876543210","city":"Mumbai"}` | Navigates to lead form; fields populated; verification panel visible |
| Q2 | vCard QR | Scan vCard with FN, ORG, TEL, EMAIL | Name/company/contact filled with reasonable confidence |
| Q3 | URL query QR | Scan `https://example.com/badge?name=Rajesh+Kumar&email=r@x.example` | Name (and email if present) populated |
| Q4 | Garbage / invalid QR | Scan random text or unrelated QR | Toast “Could not read badge”; **no** navigation with placeholder data; scanner resumes |
| Q5 | Deny camera | Block camera permission on `/capture/qr` | Error message + **Try camera again** button; manual entry escape works |
| Q6 | Scan success → verify | Complete Q1, review form | Banner “Auto-filled from QR scan”; save blocked until required fields valid |

---

## Card OCR scenarios

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| C1 | Open camera | `/capture/card` → Open camera | Live preview visible (not black screen) |
| C2 | Capture frame | Capture a clear printed card | Progress % → parsed preview with name/company |
| C3 | Upload JPG/PNG | Upload image from disk | Same OCR flow as camera capture |
| C4 | Blurry card | Upload low-quality image | Verification panel shows warnings on low-confidence fields |
| C5 | Continue to form | Continue to verify after OCR | Lead form populated; banner “Auto-filled from card OCR”; `ocrText` stored in capture meta on save |
| C6 | Retake | Retake after capture | Preview clears; camera can reopen |

---

## Voice scenarios

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| V1 | Consent gate | Start recording without checking consent | Error toast; recording does not start |
| V2 | Speech → textarea | Consent → Start → speak → Stop | Interim/final text appears; summary generated if empty |
| V3 | Stop summary | Stop after conversation | AI summary populated in textarea |
| V4 | Mic indicator off | After Stop | Recording indicator gone; no lingering mic icon in browser tab (tracks released) |

---

## Persistence scenarios

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| P1 | Save with metadata | Save lead from QR or card capture | MySQL row includes `capture_source` and `capture_meta` JSON |
| P2 | Dashboard refresh | Save → go to `/leads` → refresh | Lead appears in list with correct name |
| P3 | Missing draft deep link | Open `/leads/new?source=qr` without prior scan | Redirect to `/capture` with warning toast (no fake auto-fill) |
| P4 | Manual entry | `/leads/new?source=manual` | Empty form; no placeholder name flash |

---

## Console / stability checks

- [ ] `/capture/qr` — navigate away: no “Cannot stop scanner” loop in console
- [ ] `/capture/card` — open/close camera: no uncaught errors
- [ ] Lead form — no hydration errors in clean Incognito session

---

## Sign-off

| Tester | Device / browser | Date | High-priority (Q1, Q4, Q5, C1, V4, P3) |
|--------|------------------|------|----------------------------------------|
| | | | ☐ Pass |

**High-priority minimum:** Q1, Q4, Q5, C1, V4, P3 on at least one desktop and one mobile browser.
