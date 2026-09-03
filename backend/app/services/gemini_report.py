from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from google import genai
from google.genai import types

from app.config import settings
from app.schemas import AdminOverview, BoothReportResponse, Lead

logger = logging.getLogger(__name__)


def _fallback_markdown(overview: AdminOverview) -> str:
    interests = ", ".join(f"{i.name} ({i.count})" for i in overview.top_interests) or "n/a"
    return (
        f"# Booth report\n\n"
        f"Generated without Gemini (API unavailable).\n\n"
        f"- Total leads: **{overview.leads}** (hot {overview.hot_leads}, "
        f"warm {overview.warm_leads}, cold {overview.cold_leads})\n"
        f"- Synced: {overview.synced_leads} · Pending sync: {overview.unsynced_leads}\n"
        f"- Sources — QR {overview.by_source.qr}, card {overview.by_source.card}, "
        f"manual {overview.by_source.manual}, unknown {overview.by_source.unknown}\n"
        f"- Top interests: {interests}\n"
        f"- Pending follow-ups: {overview.pending_follow_ups}\n"
    )


def generate_booth_report(
    overview: AdminOverview,
    leads: list[Lead],
) -> BoothReportResponse:
    generated_at = datetime.now(timezone.utc).isoformat()
    compact: list[dict[str, Any]] = []
    for lead in leads[:80]:
        compact.append(
            {
                "name": lead.name,
                "company": lead.company,
                "priority": lead.priority,
                "city": lead.city,
                "interests": lead.interests[:5],
                "source": lead.capture_source,
                "summary": (lead.summary or "")[:160],
            }
        )

    stats = {
        "leads": overview.leads,
        "hot": overview.hot_leads,
        "warm": overview.warm_leads,
        "cold": overview.cold_leads,
        "synced": overview.synced_leads,
        "unsynced": overview.unsynced_leads,
        "bySource": overview.by_source.model_dump(by_alias=True),
        "topInterests": [i.model_dump(by_alias=True) for i in overview.top_interests],
        "pendingFollowUps": overview.pending_follow_ups,
        "staffActive": overview.staff_active,
    }

    if not settings.gemini_api_key.strip():
        return BoothReportResponse(
            markdown=_fallback_markdown(overview),
            generated_at=generated_at,
            stats=stats,
            used_ai=False,
        )

    prompt = f"""You are writing a concise exhibition booth report for Conninter MEDICON.

Use the stats and lead samples to produce Markdown with these sections:
## Highlights
## Priority follow-ups
## Interest themes
## Capture quality notes

Be factual. Do not invent visitors. Keep under 400 words.

STATS JSON:
{stats}

LEAD SAMPLES JSON:
{compact}
"""

    try:
        client = genai.Client(api_key=settings.gemini_api_key.strip())
        response = client.models.generate_content(
            model=settings.gemini_model.strip() or "gemini-2.5-flash",
            contents=prompt,
            config=types.GenerateContentConfig(
                temperature=0.3,
                automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
            ),
        )
        text = (response.text or "").strip()
        if not text:
            raise RuntimeError("Empty Gemini report")
        return BoothReportResponse(
            markdown=text,
            generated_at=generated_at,
            stats=stats,
            used_ai=True,
        )
    except Exception:
        logger.warning("Gemini booth report failed", exc_info=True)
        return BoothReportResponse(
            markdown=_fallback_markdown(overview),
            generated_at=generated_at,
            stats=stats,
            used_ai=False,
        )
