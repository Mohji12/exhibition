from __future__ import annotations

import base64
import hashlib
import re
import uuid

import pymysql

from app.schemas import UploadCardImageResponse


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


def store_card_image(
    conn: pymysql.connections.Connection,
    *,
    image_base64: str,
    mime_type: str = "image/jpeg",
    lead_id: str | None = None,
    capturer_id: str | None = None,
) -> UploadCardImageResponse:
    image_bytes, detected_mime = _strip_data_url(image_base64)
    if len(image_bytes) < 64:
        raise ValueError("Image payload is too small")
    # Cap ~4MB to protect MySQL MEDIUMBLOB path
    if len(image_bytes) > 4 * 1024 * 1024:
        raise ValueError("Image payload is too large (max 4MB)")

    mime = detected_mime or mime_type or "image/jpeg"
    digest = hashlib.sha256(image_bytes).hexdigest()
    image_id = str(uuid.uuid4())

    with conn.cursor() as cur:
        # Reuse existing blob for same hash + capturer when orphaned or same lead
        cur.execute(
            """
            SELECT id FROM lead_card_images
            WHERE sha256 = %s AND (lead_id IS NULL OR lead_id = %s OR %s IS NULL)
            ORDER BY created_at DESC
            LIMIT 1
            """,
            (digest, lead_id, lead_id),
        )
        existing = cur.fetchone()
        if existing:
            image_id = existing["id"]
            if lead_id:
                cur.execute(
                    "UPDATE lead_card_images SET lead_id = COALESCE(lead_id, %s) WHERE id = %s",
                    (lead_id, image_id),
                )
            conn.commit()
            return UploadCardImageResponse(ok=True, id=image_id)

        cur.execute(
            """
            INSERT INTO lead_card_images (id, lead_id, mime_type, image_blob, sha256, captured_by)
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            (image_id, lead_id, mime, image_bytes, digest, capturer_id),
        )
    conn.commit()
    return UploadCardImageResponse(ok=True, id=image_id)


def attach_card_image_to_lead(
    conn: pymysql.connections.Connection,
    image_id: str,
    lead_id: str,
) -> None:
    with conn.cursor() as cur:
        cur.execute(
            "UPDATE lead_card_images SET lead_id = %s WHERE id = %s",
            (lead_id, image_id),
        )


def get_card_image_for_lead(
    conn: pymysql.connections.Connection,
    lead_id: str,
    *,
    image_id: str | None = None,
) -> dict | None:
    with conn.cursor() as cur:
        if image_id:
            cur.execute(
                """
                SELECT id, mime_type, image_blob, sha256, created_at
                FROM lead_card_images
                WHERE lead_id = %s AND id = %s
                LIMIT 1
                """,
                (lead_id, image_id),
            )
            return cur.fetchone()
        cur.execute(
            """
            SELECT id, mime_type, image_blob, sha256, created_at
            FROM lead_card_images
            WHERE lead_id = %s
            ORDER BY created_at ASC
            LIMIT 1
            """,
            (lead_id,),
        )
        return cur.fetchone()


def lead_has_card_image(conn: pymysql.connections.Connection, lead_id: str) -> bool:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT 1 AS ok FROM lead_card_images WHERE lead_id = %s LIMIT 1",
            (lead_id,),
        )
        return cur.fetchone() is not None
