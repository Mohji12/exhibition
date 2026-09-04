import json
from typing import Any

from app.schemas import Appointment, CaptureMeta, Lead, TeamMember


def map_lead_row(row: dict[str, Any]) -> Lead:
    capture_meta: CaptureMeta | None = None
    raw_meta = row.get("capture_meta")
    if raw_meta:
        if isinstance(raw_meta, str):
            capture_meta = CaptureMeta.model_validate(json.loads(raw_meta))
        elif isinstance(raw_meta, dict):
            capture_meta = CaptureMeta.model_validate(raw_meta)

    interest_names = row.get("interest_names")
    interests = interest_names.split("||") if interest_names else []

    field_confidence = None
    if capture_meta and capture_meta.field_confidence:
        field_confidence = capture_meta.field_confidence

    return Lead(
        id=row["id"],
        name=row["name"],
        company=row["company"],
        designation=row["designation"],
        mobile=row["mobile"],
        email=row["email"],
        city=row["city"],
        priority=row["priority"],
        summary=row.get("summary") or "",
        synced=bool(row.get("synced")),
        captured_at=row["captured_at"],
        consent_at=row.get("consent_at"),
        interests=interests,
        capture_source=row.get("capture_source"),
        capture_meta=capture_meta,
        field_confidence=field_confidence,
        captured_by=row.get("captured_by"),
        capturer_name=row.get("capturer_name"),
        capturer_email=row.get("capturer_email"),
        filled_by=row.get("filled_by") or "exhibitor",
    )


def map_appointment_row(row: dict[str, Any]) -> Appointment:
    return Appointment(
        id=row["id"],
        lead=row["lead_name"],
        type=row["type"],
        when=row["when_label"],
        status=row["status"],
    )


def map_team_row(row: dict[str, Any]) -> TeamMember:
    return TeamMember(
        name=row["name"],
        role=row["role"],
        email=row["email"],
    )


LEAD_SELECT_SQL = """
  SELECT
    l.id,
    l.name,
    l.company,
    l.designation,
    l.mobile,
    l.email,
    l.city,
    l.priority,
    l.summary,
    l.synced,
    l.captured_at,
    l.consent_at,
    l.capture_source,
    l.capture_meta,
    l.captured_by,
    l.filled_by,
    u.name AS capturer_name,
    u.email AS capturer_email,
    GROUP_CONCAT(pi.name ORDER BY pi.id SEPARATOR '||') AS interest_names
  FROM leads l
  LEFT JOIN users u ON l.captured_by = u.id
  LEFT JOIN lead_interests li ON l.id = li.lead_id
  LEFT JOIN product_interests pi ON li.interest_id = pi.id
  GROUP BY l.id
"""

LEAD_SELECT_BY_ID_SQL = f"{LEAD_SELECT_SQL} HAVING l.id = %s"
