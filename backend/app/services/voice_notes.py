from __future__ import annotations

import base64
import json
import logging
import re
from typing import Any

from google import genai
from google.genai import types

from app.config import settings
from app.schemas import TranscribeResponse

logger = logging.getLogger(__name__)

_PROMPT = """You are helping a booth rep capture notes from a short visitor conversation at a medical exhibition.

Given the audio (and optional rough transcript hint), return ONLY valid JSON:
{
  "transcript": "full cleaned transcript of what was said",
  "summary": "2-4 short sentences covering products discussed, interest level, and next steps"
}

Rules:
- Prefer the audio when it conflicts with the hint.
- Keep names/products factual; do not invent details.
- If audio is empty or unusable, use the hint or return empty strings.
"""


def _strip_data_url(payload: str) -> tuple[bytes, str | None]:
    raw = payload.strip()
    mime: str | None = None
    if raw.startswith("data:") and "," in raw:
        header, body = raw.split(",", 1)
        match = re.match(r"data:([^;]+)", header)
        if match:
            mime = match.group(1)
        raw = body
    return base64.b64decode(raw), mime


def _parse_json(text: str) -> dict[str, Any]:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)
    return json.loads(cleaned)


def transcribe_conversation(
    audio_base64: str,
    mime_type: str = "audio/webm",
    transcript_hint: str | None = None,
) -> TranscribeResponse:
    if not settings.gemini_api_key.strip():
        hint = (transcript_hint or "").strip()
        return TranscribeResponse(
            ok=bool(hint),
            transcript=hint,
            summary="",
            error=None if hint else "Voice processing is not configured",
        )

    try:
        audio_bytes, detected = _strip_data_url(audio_base64)
        mime = detected or mime_type or "audio/webm"
        if len(audio_bytes) < 32 and not (transcript_hint or "").strip():
            return TranscribeResponse(ok=False, error="Recording was too short")

        prompt = _PROMPT
        if transcript_hint and transcript_hint.strip():
            prompt += f"\n\nRough transcript hint:\n{transcript_hint.strip()[:6000]}"

        contents: list[Any] = [prompt]
        if len(audio_bytes) >= 32:
            contents.insert(0, types.Part.from_bytes(data=audio_bytes, mime_type=mime))

        client = genai.Client(api_key=settings.gemini_api_key.strip())
        response = client.models.generate_content(
            model=settings.gemini_model.strip() or "gemini-2.5-flash",
            contents=contents,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=0.2,
                automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
            ),
        )
        text = (response.text or "").strip()
        if not text:
            return TranscribeResponse(ok=False, error="Could not process recording")
        payload = _parse_json(text)
        transcript = str(payload.get("transcript") or "").strip()
        summary = str(payload.get("summary") or "").strip()
        if not transcript and not summary:
            return TranscribeResponse(ok=False, error="Could not process recording")
        return TranscribeResponse(ok=True, transcript=transcript, summary=summary)
    except Exception:
        logger.warning("Voice transcription failed", exc_info=True)
        hint = (transcript_hint or "").strip()
        if hint:
            return TranscribeResponse(ok=True, transcript=hint, summary="")
        return TranscribeResponse(ok=False, error="Could not process recording")
