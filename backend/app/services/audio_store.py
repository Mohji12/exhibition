from __future__ import annotations

import base64
import hashlib
import re
import uuid

import pymysql

from app.schemas import TranscribeResponse, UploadAudioResponse
from app.services.voice_notes import transcribe_conversation


def _strip_data_url(audio_base64: str) -> tuple[bytes, str | None]:
    raw = audio_base64.strip()
    mime: str | None = None
    if raw.startswith("data:") and "," in raw:
        header, payload = raw.split(",", 1)
        match = re.match(r"data:([^;]+)", header)
        if match:
            mime = match.group(1)
        raw = payload
    return base64.b64decode(raw), mime


def store_audio(
    conn: pymysql.connections.Connection,
    *,
    audio_base64: str,
    mime_type: str = "audio/webm",
    lead_id: str | None = None,
    capturer_id: str | None = None,
) -> UploadAudioResponse:
    audio_bytes, detected_mime = _strip_data_url(audio_base64)
    if len(audio_bytes) < 32:
        raise ValueError("Audio payload is too small")
    # Cap ~8MB
    if len(audio_bytes) > 8 * 1024 * 1024:
        raise ValueError("Audio payload is too large (max 8MB)")

    mime = detected_mime or mime_type or "audio/webm"
    digest = hashlib.sha256(audio_bytes).hexdigest()
    audio_id = str(uuid.uuid4())

    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id FROM lead_audio
            WHERE sha256 = %s AND (lead_id IS NULL OR lead_id = %s OR %s IS NULL)
            ORDER BY created_at DESC
            LIMIT 1
            """,
            (digest, lead_id, lead_id),
        )
        existing = cur.fetchone()
        if existing:
            audio_id = existing["id"]
            if lead_id:
                cur.execute(
                    "UPDATE lead_audio SET lead_id = COALESCE(lead_id, %s) WHERE id = %s",
                    (lead_id, audio_id),
                )
            conn.commit()
            return UploadAudioResponse(ok=True, id=audio_id)

        cur.execute(
            """
            INSERT INTO lead_audio (id, lead_id, mime_type, audio_blob, sha256, captured_by)
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            (audio_id, lead_id, mime, audio_bytes, digest, capturer_id),
        )
    conn.commit()
    return UploadAudioResponse(ok=True, id=audio_id)


def get_audio_row(conn: pymysql.connections.Connection, audio_id: str) -> dict | None:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, lead_id, mime_type, audio_blob, sha256, created_at
            FROM lead_audio
            WHERE id = %s
            """,
            (audio_id,),
        )
        return cur.fetchone()


def transcribe_stored_audio(
    conn: pymysql.connections.Connection,
    audio_id: str,
    transcript_hint: str | None = None,
) -> TranscribeResponse:
    row = get_audio_row(conn, audio_id)
    if not row:
        return TranscribeResponse(ok=False, error="Recording not found")
    blob: bytes = row["audio_blob"]
    mime = row.get("mime_type") or "audio/webm"
    b64 = base64.b64encode(blob).decode("ascii")
    return transcribe_conversation(
        audio_base64=b64,
        mime_type=mime,
        transcript_hint=transcript_hint,
    )
