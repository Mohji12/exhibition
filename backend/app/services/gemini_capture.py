from __future__ import annotations

import base64
import json
import logging
import re
from typing import Any

from google import genai
from google.genai import types

from app.config import settings
from app.schemas import AnalyzeCardFields, AnalyzeCardResponse

logger = logging.getLogger(__name__)

_PROMPT = """You are validating a medical-exhibition visiting card photo for Conninter Visitor Book.

Extract contact fields from the card image. Optionally use the OCR text hint if provided.
Return ONLY valid JSON with this exact shape:
{
  "name": "string",
  "company": "string",
  "designation": "string",
  "mobile": "string",
  "email": "string",
  "city": "string",
  "fieldConfidence": {
    "name": 0-100,
    "company": 0-100,
    "designation": 0-100,
    "mobile": 0-100,
    "email": 0-100,
    "city": 0-100
  },
  "issues": ["short validation notes"],
  "ocrQuality": "good" | "fair" | "poor"
}

Rules:
- Prefer values clearly readable on the card.
- Normalize email to lowercase; keep mobile digits with optional leading +.
- If a field is missing or unreadable, use "" and low confidence.
- Only list issues for fields that are empty OR have confidence below 60 in this same JSON.
- Never say a field is missing/unreadable/empty if you returned a non-empty value for it.
- Flag truncated emails, incomplete phones, blurry overall image, or uncertain values only when confidence is low.
- Do not invent companies or people not on the card.
"""

_FIELD_ISSUE_RE = {
    "name": re.compile(r"\bnames?\b", re.I),
    "company": re.compile(r"\bcompan(y|ies)\b", re.I),
    "designation": re.compile(r"\b(designation|title|role)\b", re.I),
    "mobile": re.compile(r"\b(mobile|phone|tel)\b", re.I),
    "email": re.compile(r"\be-?mails?\b", re.I),
    "city": re.compile(r"\bcit(y|ies)\b", re.I),
}
_MISSING_CLAIM_RE = re.compile(
    r"\b(missing|unreadable|empty|not\s+found|could\s+not|couldn'?t|absent|blank|unavailable)\b",
    re.I,
)

_client: genai.Client | None = None


def _get_client() -> genai.Client:
    global _client
    key = settings.gemini_api_key.strip()
    if _client is None:
        _client = genai.Client(api_key=key)
    return _client


def _strip_data_url(image_base64: str) -> tuple[bytes, str | None]:
    raw = image_base64.strip()
    mime: str | None = None
    if raw.startswith("data:") and "," in raw:
        header, payload = raw.split(",", 1)
        match = re.match(r"data:([^;]+)", header)
        if match:
            mime = match.group(1)
        raw = payload
    return base64.b64decode(raw), mime


def _clamp_confidence(value: Any) -> float:
    try:
        num = float(value)
    except (TypeError, ValueError):
        return 0.0
    return max(0.0, min(100.0, num))


def _parse_response_text(text: str) -> dict[str, Any]:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)
    return json.loads(cleaned)


def _filter_stale_issues(fields: AnalyzeCardFields, issues: list[str]) -> list[str]:
    values = {
        "name": fields.name,
        "company": fields.company,
        "designation": fields.designation,
        "mobile": fields.mobile,
        "email": fields.email,
        "city": fields.city,
    }
    kept: list[str] = []
    for issue in issues:
        text = issue.strip()
        if not text:
            continue
        if not _MISSING_CLAIM_RE.search(text):
            kept.append(text)
            continue
        drop = False
        for key, pattern in _FIELD_ISSUE_RE.items():
            if pattern.search(text) and values.get(key, "").strip():
                drop = True
                break
        if not drop:
            kept.append(text)
    return kept[:8]


def analyze_visiting_card(
    image_base64: str,
    mime_type: str = "image/jpeg",
    ocr_text: str | None = None,
) -> AnalyzeCardResponse:
    if not settings.gemini_api_key.strip():
        return AnalyzeCardResponse(
            ok=False,
            fields=AnalyzeCardFields(),
            error="Gemini API key is not configured",
        )

    try:
        image_bytes, detected_mime = _strip_data_url(image_base64)
        mime = detected_mime or mime_type or "image/jpeg"
        if len(image_bytes) < 64:
            return AnalyzeCardResponse(
                ok=False,
                fields=AnalyzeCardFields(),
                error="Image payload is too small",
            )

        prompt = _PROMPT
        if ocr_text and ocr_text.strip():
            prompt += f"\n\nOCR text hint:\n{ocr_text.strip()[:4000]}"

        client = _get_client()
        response = client.models.generate_content(
            model=settings.gemini_model.strip() or "gemini-2.5-flash",
            contents=[
                types.Part.from_bytes(data=image_bytes, mime_type=mime),
                prompt,
            ],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=0.1,
                automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
            ),
        )
        text = (response.text or "").strip()
        if not text:
            return AnalyzeCardResponse(
                ok=False,
                fields=AnalyzeCardFields(),
                error="Gemini returned an empty response",
            )

        payload = _parse_response_text(text)
        conf_raw = payload.get("fieldConfidence") or payload.get("field_confidence") or {}
        confidence = {
            key: _clamp_confidence(conf_raw.get(key, 0))
            for key in ("name", "company", "designation", "mobile", "email", "city")
        }
        quality = str(payload.get("ocrQuality") or payload.get("ocr_quality") or "fair").lower()
        if quality not in {"good", "fair", "poor"}:
            quality = "fair"
        issues_raw = payload.get("issues") or []
        issues = [str(item).strip() for item in issues_raw if str(item).strip()][:8]

        fields = AnalyzeCardFields(
            name=str(payload.get("name") or "").strip(),
            company=str(payload.get("company") or "").strip(),
            designation=str(payload.get("designation") or "").strip(),
            mobile=str(payload.get("mobile") or "").strip(),
            email=str(payload.get("email") or "").strip().lower(),
            city=str(payload.get("city") or "").strip(),
        )
        issues = _filter_stale_issues(fields, issues)

        return AnalyzeCardResponse(
            ok=True,
            fields=fields,
            field_confidence=confidence,
            issues=issues,
            ocr_quality=quality,  # type: ignore[arg-type]
        )
    except Exception as exc:
        logger.warning("Gemini card analysis failed", exc_info=True)
        return AnalyzeCardResponse(
            ok=False,
            fields=AnalyzeCardFields(),
            error=str(exc) or "Gemini analysis failed",
        )
