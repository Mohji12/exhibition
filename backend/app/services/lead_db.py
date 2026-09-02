import json
from typing import Any

import pymysql

from app.mappers import LEAD_SELECT_BY_ID_SQL, map_lead_row
from app.schemas import Lead, UpsertLeadResponse


def upsert_lead_in_db(
    conn: pymysql.connections.Connection,
    lead: Lead,
    mark_synced: bool = True,
) -> UpsertLeadResponse:
    try:
        conn.begin()
        capture_meta_json = (
            json.dumps(lead.capture_meta.model_dump(by_alias=True, exclude_none=True))
            if lead.capture_meta
            else None
        )

        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO leads (
                  id, name, company, designation, mobile, email, city, priority,
                  summary, synced, captured_at, consent_at, capture_source, capture_meta
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
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
                  capture_meta = VALUES(capture_meta)
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

            cur.execute(LEAD_SELECT_BY_ID_SQL, (lead.id,))
            result = cur.fetchone()

        conn.commit()

        if not result:
            return UpsertLeadResponse(ok=False, error="Lead saved but could not be reloaded")

        return UpsertLeadResponse(ok=True, lead=map_lead_row(result))
    except Exception as exc:
        conn.rollback()
        return UpsertLeadResponse(ok=False, error=str(exc))
