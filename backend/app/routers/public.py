from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query, Request, status

from app.config import settings
from app.database import get_connection
from app.schemas import (
    AnalyzeCardRequest,
    AnalyzeCardResponse,
    CaptureMeta,
    Lead,
    PublicExhibitorOut,
    PublicVisitorLeadRequest,
    TranscribeResponse,
    UploadAudioRequest,
    UploadAudioResponse,
    UpsertLeadResponse,
)
from app.security import check_rate_limit
from app.services.audio_store import store_audio, transcribe_stored_audio
from app.services.gemini_capture import analyze_visiting_card
from app.services.lead_db import upsert_lead_in_db

router = APIRouter(prefix="/api/public", tags=["public"])

_PLACEHOLDER = "—"
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _client_key(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return "unknown"


def _load_active_exhibitor(cur, token: str) -> dict | None:
    cur.execute(
        """
        SELECT id, name, email, company, designation, mobile, event_name, status, role
        FROM users
        WHERE share_token = %s
        """,
        (token,),
    )
    row = cur.fetchone()
    if not row or row["status"] != "active":
        return None
    return row


@router.get("/exhibitors/{token}", response_model=PublicExhibitorOut)
def get_public_exhibitor(token: str) -> PublicExhibitorOut:
    with get_connection() as conn, conn.cursor() as cur:
        exhibitor = _load_active_exhibitor(cur, token)
        if not exhibitor:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exhibitor not found")
        cur.execute("SELECT name FROM product_interests ORDER BY id")
        interests = [row["name"] for row in cur.fetchall()]
    return PublicExhibitorOut(
        name=exhibitor["name"],
        email=exhibitor["email"],
        company=exhibitor.get("company"),
        designation=exhibitor.get("designation"),
        mobile=exhibitor.get("mobile"),
        event_name=exhibitor.get("event_name"),
        interests=interests,
    )


@router.post("/exhibitors/{token}/audio", response_model=UploadAudioResponse)
def upload_public_audio(
    token: str,
    body: UploadAudioRequest,
    request: Request,
) -> UploadAudioResponse:
    check_rate_limit(f"public-audio:{_client_key(request)}:{token}")
    with get_connection() as conn, conn.cursor() as cur:
        exhibitor = _load_active_exhibitor(cur, token)
        if not exhibitor:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exhibitor not found")
    try:
        with get_connection() as conn:
            return store_audio(
                conn,
                audio_base64=body.audio_base64,
                mime_type=body.mime_type or "audio/webm",
                lead_id=body.lead_id,
                capturer_id=exhibitor["id"],
            )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not save recording",
        ) from None


@router.post("/exhibitors/{token}/audio/{audio_id}/transcribe", response_model=TranscribeResponse)
def reprocess_public_audio(
    token: str,
    audio_id: str,
    request: Request,
    transcript_hint: str | None = Query(default=None),
) -> TranscribeResponse:
    check_rate_limit(f"public-tx:{_client_key(request)}:{token}")
    with get_connection() as conn, conn.cursor() as cur:
        exhibitor = _load_active_exhibitor(cur, token)
        if not exhibitor:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exhibitor not found")
    with get_connection() as conn:
        return transcribe_stored_audio(conn, audio_id, transcript_hint=transcript_hint)


@router.post("/exhibitors/{token}/leads", response_model=UpsertLeadResponse)
def submit_public_lead(
    token: str,
    body: PublicVisitorLeadRequest,
    request: Request,
) -> UpsertLeadResponse:
    check_rate_limit(f"public-lead:{_client_key(request)}:{token}")

    name = body.name.strip()
    mobile = (body.mobile or "").strip()
    email_raw = (body.email or "").strip().lower()
    if not name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Name is required")
    if not mobile and not email_raw:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Provide a mobile number or email",
        )
    if email_raw and not _EMAIL_RE.match(email_raw):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid email")

    with get_connection() as conn, conn.cursor() as cur:
        exhibitor = _load_active_exhibitor(cur, token)
        if not exhibitor:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exhibitor not found")

    lead_id = f"v{uuid.uuid4().hex[:16]}"
    if not email_raw:
        email_raw = f"visitor.{lead_id}@conninter.example"
    if not mobile:
        mobile = "0000000000"
    elif len(re.sub(r"\D", "", mobile)) < 10:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Mobile number must have at least 10 digits",
        )

    company = (body.company or "").strip() or _PLACEHOLDER
    designation = (body.designation or "").strip() or _PLACEHOLDER
    city = (body.city or "").strip() or _PLACEHOLDER
    capture_source = body.capture_source if body.capture_source in ("qr", "card", "manual") else "qr"
    now = datetime.now(timezone.utc).replace(tzinfo=None).isoformat(timespec="seconds") + "Z"

    meta = body.capture_meta or CaptureMeta()
    if body.ocr_text and not meta.ocr_text:
        meta.ocr_text = body.ocr_text
    if not meta.verified_at:
        meta.verified_at = now

    lead = Lead(
        id=lead_id,
        name=name,
        company=company,
        designation=designation,
        mobile=mobile,
        email=email_raw,
        city=city,
        priority="warm",
        interests=body.interests,
        summary=(body.summary or "").strip(),
        synced=True,
        captured_at=now,
        consent_at=body.consent_at or now,
        capture_source=capture_source,
        capture_meta=meta,
        filled_by="visitor",
    )

    with get_connection() as conn:
        result = upsert_lead_in_db(conn, lead, mark_synced=True, capturer_id=exhibitor["id"])
    if not result.ok:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=result.error or "Could not save lead",
        )
    return result


@router.post("/exhibitors/{token}/analyze-card", response_model=AnalyzeCardResponse)
def analyze_public_card(
    token: str,
    body: AnalyzeCardRequest,
    request: Request,
) -> AnalyzeCardResponse:
    check_rate_limit(f"public-ocr:{_client_key(request)}:{token}")

    with get_connection() as conn, conn.cursor() as cur:
        exhibitor = _load_active_exhibitor(cur, token)
        if not exhibitor:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exhibitor not found")

    if not settings.gemini_api_key.strip():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Card scan is temporarily unavailable",
        )

    return analyze_visiting_card(
        image_base64=body.image_base64,
        mime_type=body.mime_type or "image/jpeg",
        ocr_text=body.ocr_text,
    )
