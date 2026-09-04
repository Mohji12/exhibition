import json

import pymysql

from app.mappers import LEAD_SELECT_BY_ID_SQL, map_lead_row
from app.schemas import Lead, UpsertLeadResponse


def upsert_lead_in_db(
    conn: pymysql.connections.Connection,
    lead: Lead,
    mark_synced: bool = True,
    capturer_id: str | None = None,
) -> UpsertLeadResponse:
    try:
        conn.begin()
        # Fold fieldConfidence into capture_meta for durable storage
        capture_meta = lead.capture_meta
        if lead.field_confidence:
            from app.schemas import CaptureMeta

            base = capture_meta.model_dump() if capture_meta else {}
            if not base.get("field_confidence"):
                base["field_confidence"] = lead.field_confidence
            capture_meta = CaptureMeta.model_validate(base)

        capture_meta_json = (
            json.dumps(capture_meta.model_dump(by_alias=True, exclude_none=True))
            if capture_meta
            else None
        )
        card_image_id = capture_meta.card_image_id if capture_meta else None
        card_image_id_back = capture_meta.card_image_id_back if capture_meta else None
        audio_id = capture_meta.audio_id if capture_meta else None

        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO leads (
                  id, name, company, designation, mobile, email, city, priority,
                  summary, synced, captured_at, consent_at, capture_source, capture_meta,
                  captured_by
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE
                  name = VALUES(name),
                  company = VALUES(company),
                  designation = VALUES(designation),
                  mobile = VALUES(mobile),
                  email = VALUES(email),
                  city = VALUES(city),
                  priority = VALUES(priority),
                  summary = VALUES(summary),
                  synced = VALUES(synced),
                  captured_at = VALUES(captured_at),
                  consent_at = VALUES(consent_at),
                  capture_source = VALUES(capture_source),
                  capture_meta = VALUES(capture_meta),
                  captured_by = COALESCE(leads.captured_by, VALUES(captured_by))
                """,
                (
                    lead.id,
                    lead.name,
                    lead.company,
                    lead.designation,
                    lead.mobile,
                    str(lead.email),
                    lead.city,
                    lead.priority,
                    lead.summary,
                    1 if mark_synced else 0,
                    lead.captured_at,
                    lead.consent_at,
                    lead.capture_source,
                    capture_meta_json,
                    capturer_id,
                ),
            )

            cur.execute("DELETE FROM lead_interests WHERE lead_id = %s", (lead.id,))

            for interest_name in lead.interests:
                cur.execute(
                    "SELECT id FROM product_interests WHERE name = %s",
                    (interest_name,),
                )
                row = cur.fetchone()
                if row:
                    interest_id = row["id"]
                else:
                    cur.execute(
                        "INSERT INTO product_interests (name) VALUES (%s)",
                        (interest_name,),
                    )
                    interest_id = cur.lastrowid

                cur.execute(
                    "INSERT INTO lead_interests (lead_id, interest_id) VALUES (%s, %s)",
                    (lead.id, interest_id),
                )

            if card_image_id:
                cur.execute(
                    "UPDATE lead_card_images SET lead_id = %s WHERE id = %s",
                    (lead.id, card_image_id),
                )

            if card_image_id_back:
                cur.execute(
                    "UPDATE lead_card_images SET lead_id = %s WHERE id = %s",
                    (lead.id, card_image_id_back),
                )

            if audio_id:
                cur.execute(
                    "UPDATE lead_audio SET lead_id = %s WHERE id = %s",
                    (lead.id, audio_id),
                )

            cur.execute(LEAD_SELECT_BY_ID_SQL, (lead.id,))
            result = cur.fetchone()

        conn.commit()

        if not result:
            return UpsertLeadResponse(ok=False, error="Lead saved but could not be reloaded")

        return UpsertLeadResponse(ok=True, lead=map_lead_row(result))
    except Exception as exc:
        conn.rollback()
        return UpsertLeadResponse(ok=False, error=str(exc))
