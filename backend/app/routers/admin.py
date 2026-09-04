from __future__ import annotations

import csv
import io
import uuid
from datetime import timedelta
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status

from app.database import get_connection
from app.mappers import LEAD_SELECT_BY_ID_SQL, LEAD_SELECT_SQL, map_appointment_row, map_lead_row
from app.schemas import (
    AdminOverview,
    Appointment,
    AppointmentStatusBreakdown,
    AuthUserOut,
    BoothReportResponse,
    CaptureSource,
    CaptureSourceBreakdown,
    InterestCount,
    InviteCreateRequest,
    InvitePinResponse,
    Lead,
    PatchAppointmentRequest,
    PatchUserRequest,
    Priority,
    ResetPinResponse,
)
from app.security import (
    PIN_TTL_SECONDS,
    CurrentUser,
    generate_pin,
    generate_token,
    hash_pin,
    require_admin,
    utcnow,
)
from app.services.mail import mail_configured, send_pin_email

router = APIRouter(
    prefix="/api/admin",
    tags=["admin"],
    dependencies=[Depends(require_admin)],
)


def _user_out(row: dict) -> AuthUserOut:
    return AuthUserOut(
        id=row["id"],
        name=row["name"],
        email=row["email"],
        role=row["role"],
        status=row["status"],
        company=row.get("company"),
        designation=row.get("designation"),
        mobile=row.get("mobile"),
        event_name=row.get("event_name"),
        share_token=row.get("share_token"),
        login_pin_plain=row.get("login_pin_plain"),
        last_login_at=row.get("last_login_at"),
        created_at=row.get("created_at"),
        activated_at=row.get("activated_at"),
        leads_captured=int(row.get("leads_captured") or 0),
    )


_USER_WITH_COUNTS_SQL = """
            SELECT
              u.id, u.name, u.email, u.role, u.status, u.company, u.designation, u.mobile,
              u.event_name, u.share_token, u.login_pin_plain, u.last_login_at, u.created_at, u.activated_at,
              COUNT(l.id) AS leads_captured
            FROM users u
            LEFT JOIN leads l ON l.captured_by = u.id
"""


def _get_user_row(cur, user_id: str) -> dict | None:
    cur.execute(f"{_USER_WITH_COUNTS_SQL} WHERE u.id = %s GROUP BY u.id", (user_id,))
    return cur.fetchone()


def _latest_invite(cur, admin_id: str) -> dict | None:
    cur.execute(
        """
        SELECT id, token, pin_hash, expires_at, created_by
        FROM invites WHERE created_by = %s
        ORDER BY created_at DESC LIMIT 1
        """,
        (admin_id,),
    )
    return cur.fetchone()


def _rotate_pin(cur, invite_id: str) -> tuple[str, object]:
    pin = generate_pin()
    expires_at = utcnow() + timedelta(seconds=PIN_TTL_SECONDS)
    cur.execute(
        "UPDATE invites SET pin_hash = %s, expires_at = %s WHERE id = %s",
        (hash_pin(pin), expires_at, invite_id),
    )
    return pin, expires_at


def _create_invite(cur, admin_id: str) -> tuple[str, str, object]:
    invite_id = str(uuid.uuid4())
    token = generate_token()
    pin = generate_pin()
    expires_at = utcnow() + timedelta(seconds=PIN_TTL_SECONDS)
    cur.execute(
        """
        INSERT INTO invites (id, token, pin_hash, expires_at, created_by)
        VALUES (%s, %s, %s, %s, %s)
        """,
        (invite_id, token, hash_pin(pin), expires_at, admin_id),
    )
    return token, pin, expires_at


def _lead_filters(
    q: str | None,
    priority: Priority | None,
    synced: bool | None,
    source: CaptureSource | Literal["unknown"] | None,
    captured_by: str | None,
) -> tuple[str, list]:
    clauses: list[str] = []
    params: list = []
    if q:
        like = f"%{q.strip()}%"
        clauses.append(
            "(l.name LIKE %s OR l.company LIKE %s OR l.email LIKE %s OR l.mobile LIKE %s OR l.city LIKE %s)"
        )
        params.extend([like, like, like, like, like])
    if priority:
        clauses.append("l.priority = %s")
        params.append(priority)
    if synced is not None:
        clauses.append("l.synced = %s")
        params.append(1 if synced else 0)
    if source == "unknown":
        clauses.append("l.capture_source IS NULL")
    elif source:
        clauses.append("l.capture_source = %s")
        params.append(source)
    if captured_by:
        clauses.append("l.captured_by = %s")
        params.append(captured_by)
    where = (" WHERE " + " AND ".join(clauses)) if clauses else ""
    return where, params


def _filtered_leads(
    cur,
    q: str | None,
    priority: Priority | None,
    synced: bool | None,
    source: CaptureSource | Literal["unknown"] | None,
    captured_by: str | None,
) -> list[Lead]:
    where, params = _lead_filters(q, priority, synced, source, captured_by)
    # Wrap LEAD_SELECT so WHERE applies before GROUP BY via subquery filter on ids,
    # or inject before GROUP BY.
    sql = LEAD_SELECT_SQL.replace(
        "GROUP BY l.id",
        f"{where} GROUP BY l.id" if where else "GROUP BY l.id",
    )
    # LEAD_SELECT already has FROM leads l ... — WHERE must sit before GROUP BY.
    # Current LEAD_SELECT ends with joins then GROUP BY. Our replace puts WHERE before GROUP BY.
    # But WHERE after JOINs is correct. However empty where leaves " GROUP BY" fine.
    # Bug: if where is " WHERE ...", we get " WHERE ... GROUP BY l.id" which is correct.
    # If replace finds GROUP BY once — good.
    sql = f"{sql} ORDER BY l.captured_at DESC"
    cur.execute(sql, params)
    return [map_lead_row(row) for row in cur.fetchall()]


@router.post("/invite", response_model=InvitePinResponse)
def start_invite(
    body: InviteCreateRequest,
    admin: Annotated[CurrentUser, Depends(require_admin)],
) -> InvitePinResponse:
    with get_connection() as conn, conn.cursor() as cur:
        if body.fresh:
            cur.execute("DELETE FROM invites WHERE created_by = %s", (admin.id,))
            token, pin, expires_at = _create_invite(cur, admin.id)
        else:
            existing = _latest_invite(cur, admin.id)
            if existing:
                pin, expires_at = _rotate_pin(cur, existing["id"])
                token = existing["token"]
            else:
                token, pin, expires_at = _create_invite(cur, admin.id)
        conn.commit()
    return InvitePinResponse(token=token, pin=pin, expires_at=expires_at)


@router.post("/invite/refresh", response_model=InvitePinResponse)
def refresh_invite(admin: Annotated[CurrentUser, Depends(require_admin)]) -> InvitePinResponse:
    with get_connection() as conn, conn.cursor() as cur:
        existing = _latest_invite(cur, admin.id)
        if existing:
            pin, expires_at = _rotate_pin(cur, existing["id"])
            token = existing["token"]
        else:
            token, pin, expires_at = _create_invite(cur, admin.id)
        conn.commit()
    return InvitePinResponse(token=token, pin=pin, expires_at=expires_at)


@router.get("/overview", response_model=AdminOverview)
def overview() -> AdminOverview:
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) AS c FROM users WHERE status = 'active'")
        staff_active = int(cur.fetchone()["c"])
        cur.execute("SELECT COUNT(*) AS c FROM users WHERE status = 'disabled'")
        staff_disabled = int(cur.fetchone()["c"])
        cur.execute("SELECT COUNT(*) AS c FROM users WHERE role = 'Admin' AND status = 'active'")
        admins = int(cur.fetchone()["c"])

        cur.execute("SELECT COUNT(*) AS c FROM leads")
        leads = int(cur.fetchone()["c"])
        cur.execute("SELECT COUNT(*) AS c FROM leads WHERE priority = 'hot'")
        hot_leads = int(cur.fetchone()["c"])
        cur.execute("SELECT COUNT(*) AS c FROM leads WHERE priority = 'warm'")
        warm_leads = int(cur.fetchone()["c"])
        cur.execute("SELECT COUNT(*) AS c FROM leads WHERE priority = 'cold'")
        cold_leads = int(cur.fetchone()["c"])
        cur.execute("SELECT COUNT(*) AS c FROM leads WHERE synced = 1")
        synced_leads = int(cur.fetchone()["c"])
        cur.execute("SELECT COUNT(*) AS c FROM leads WHERE synced = 0")
        unsynced_leads = int(cur.fetchone()["c"])
        cur.execute("SELECT COUNT(*) AS c FROM appointments WHERE status = 'Pending'")
        pending = int(cur.fetchone()["c"])

        by_source = CaptureSourceBreakdown()
        cur.execute(
            """
            SELECT COALESCE(capture_source, 'unknown') AS src, COUNT(*) AS c
            FROM leads GROUP BY COALESCE(capture_source, 'unknown')
            """
        )
        for row in cur.fetchall():
            src = row["src"]
            count = int(row["c"])
            if src == "qr":
                by_source.qr = count
            elif src == "card":
                by_source.card = count
            elif src == "manual":
                by_source.manual = count
            else:
                by_source.unknown = count

        cur.execute(
            """
            SELECT pi.name AS name, COUNT(*) AS c
            FROM lead_interests li
            JOIN product_interests pi ON pi.id = li.interest_id
            GROUP BY pi.id, pi.name
            ORDER BY c DESC, pi.name ASC
            LIMIT 6
            """
        )
        top_interests = [InterestCount(name=row["name"], count=int(row["c"])) for row in cur.fetchall()]

        appt = AppointmentStatusBreakdown()
        cur.execute("SELECT status, COUNT(*) AS c FROM appointments GROUP BY status")
        for row in cur.fetchall():
            st = row["status"]
            count = int(row["c"])
            if st == "Confirmed":
                appt.confirmed = count
            elif st == "Pending":
                appt.pending = count
            elif st == "Rescheduled":
                appt.rescheduled = count

    return AdminOverview(
        staff_active=staff_active,
        staff_disabled=staff_disabled,
        admins=admins,
        leads=leads,
        hot_leads=hot_leads,
        warm_leads=warm_leads,
        cold_leads=cold_leads,
        synced_leads=synced_leads,
        unsynced_leads=unsynced_leads,
        pending_follow_ups=pending,
        by_source=by_source,
        top_interests=top_interests,
        appointments_by_status=appt,
    )


@router.get("/users", response_model=list[AuthUserOut])
def list_users() -> list[AuthUserOut]:
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(f"{_USER_WITH_COUNTS_SQL} GROUP BY u.id ORDER BY u.created_at ASC")
        rows = cur.fetchall()
    return [_user_out(row) for row in rows]


@router.patch("/users/{user_id}", response_model=AuthUserOut)
def patch_user(
    user_id: str,
    body: PatchUserRequest,
    admin: Annotated[CurrentUser, Depends(require_admin)],
) -> AuthUserOut:
    if (
        body.status is None
        and body.role is None
        and body.name is None
        and body.email is None
        and body.company is None
        and body.designation is None
        and body.mobile is None
        and body.event_name is None
        and body.login_pin is None
    ):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nothing to update")

    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, name, email, role, status, company, designation, mobile, event_name,
                   share_token, created_at, activated_at
            FROM users WHERE id = %s
            """,
            (user_id,),
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

        new_status = body.status or row["status"]
        new_role = body.role or row["role"]
        new_name = body.name.strip() if body.name else row["name"]
        new_email = str(body.email).strip().lower() if body.email else row["email"]
        new_company = body.company.strip() if body.company is not None else row.get("company")
        new_designation = (
            body.designation.strip() if body.designation is not None else row.get("designation")
        )
        new_mobile = body.mobile.strip() if body.mobile is not None else row.get("mobile")
        new_event_name = (
            body.event_name.strip() if body.event_name is not None else row.get("event_name")
        )

        if user_id == admin.id and (new_status == "disabled" or new_role != "Admin"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="You cannot disable or demote your own admin account",
            )

        if row["role"] == "Admin" and (new_role != "Admin" or new_status == "disabled"):
            cur.execute(
                "SELECT COUNT(*) AS c FROM users WHERE role = 'Admin' AND status = 'active' AND id <> %s",
                (user_id,),
            )
            remaining = int(cur.fetchone()["c"])
            if remaining < 1:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="At least one active admin is required",
                )

        if new_email != row["email"]:
            cur.execute("SELECT id FROM users WHERE email = %s AND id <> %s", (new_email, user_id))
            if cur.fetchone():
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already in use")

        sets = [
            "status = %s",
            "role = %s",
            "name = %s",
            "email = %s",
            "company = %s",
            "designation = %s",
            "mobile = %s",
            "event_name = %s",
        ]
        params: list = [
            new_status,
            new_role,
            new_name,
            new_email,
            new_company or None,
            new_designation or None,
            new_mobile or None,
            new_event_name or None,
        ]
        if body.login_pin:
            sets.append("pin_hash = %s")
            params.append(hash_pin(body.login_pin))
            sets.append("login_pin_plain = %s")
            params.append(body.login_pin)
        params.append(user_id)
        cur.execute(f"UPDATE users SET {', '.join(sets)} WHERE id = %s", params)
        conn.commit()
        updated = _get_user_row(cur, user_id)

    return _user_out(updated)


@router.get("/users/{user_id}", response_model=AuthUserOut)
def get_user(user_id: str) -> AuthUserOut:
    with get_connection() as conn, conn.cursor() as cur:
        row = _get_user_row(cur, user_id)
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return _user_out(row)


@router.post("/users/{user_id}/reset-pin", response_model=ResetPinResponse)
def reset_user_pin(
    user_id: str,
    email: bool = Query(default=False),
) -> ResetPinResponse:
    pin = generate_pin()
    with get_connection() as conn, conn.cursor() as cur:
        row = _get_user_row(cur, user_id)
        if not row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
        cur.execute(
            "UPDATE users SET pin_hash = %s, login_pin_plain = %s WHERE id = %s",
            (hash_pin(pin), pin, user_id),
        )
        conn.commit()
        updated = _get_user_row(cur, user_id)

    emailed = False
    message = "New PIN ready — share it with the exhibitor"
    if email:
        if mail_configured():
            ok, msg = send_pin_email(str(updated["email"]), updated["name"], pin)
            emailed = ok
            message = msg if ok else "PIN reset, but email could not be sent — copy it manually"
        else:
            message = "Email not configured yet — copy the PIN and share it manually"

    return ResetPinResponse(
        ok=True,
        pin=pin,
        emailed=emailed,
        message=message,
        user=_user_out(updated),
    )


@router.delete("/users/{user_id}")
def delete_user(
    user_id: str,
    admin: Annotated[CurrentUser, Depends(require_admin)],
) -> dict[str, bool]:
    if user_id == admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot delete your own admin account",
        )
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute("SELECT id, role, status FROM users WHERE id = %s", (user_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
        if row["role"] == "Admin" and row["status"] == "active":
            cur.execute(
                "SELECT COUNT(*) AS c FROM users WHERE role = 'Admin' AND status = 'active' AND id <> %s",
                (user_id,),
            )
            if int(cur.fetchone()["c"]) < 1:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="At least one active admin is required",
                )
        cur.execute("SELECT id, name FROM leads WHERE captured_by = %s", (user_id,))
        leads = cur.fetchall()
        lead_ids = [item["id"] for item in leads]
        lead_names = [item["name"] for item in leads]
        if lead_ids:
            ph = ",".join(["%s"] * len(lead_ids))
            cur.execute(f"DELETE FROM lead_interests WHERE lead_id IN ({ph})", lead_ids)
            cur.execute(
                "SELECT COUNT(*) AS c FROM information_schema.TABLES "
                "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'lead_card_images'"
            )
            if int(cur.fetchone()["c"]) > 0:
                cur.execute(f"DELETE FROM lead_card_images WHERE lead_id IN ({ph})", lead_ids)
            cur.execute(f"DELETE FROM leads WHERE id IN ({ph})", lead_ids)
        if lead_names:
            name_ph = ",".join(["%s"] * len(lead_names))
            cur.execute(f"DELETE FROM appointments WHERE lead_name IN ({name_ph})", lead_names)
        cur.execute("DELETE FROM invites WHERE created_by = %s", (user_id,))
        cur.execute("DELETE FROM users WHERE id = %s", (user_id,))
        conn.commit()
    return {"ok": True}


@router.get("/leads/export")
def export_leads(
    q: str | None = None,
    priority: Priority | None = None,
    synced: bool | None = None,
    source: CaptureSource | Literal["unknown"] | None = None,
    captured_by: str | None = Query(default=None, alias="capturedBy"),
) -> Response:
    with get_connection() as conn, conn.cursor() as cur:
        leads = _filtered_leads(cur, q, priority, synced, source, captured_by)

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(
        [
            "id",
            "name",
            "company",
            "designation",
            "mobile",
            "email",
            "city",
            "priority",
            "interests",
            "synced",
            "captured_at",
            "capture_source",
            "capturer_name",
            "capturer_email",
            "summary",
        ]
    )
    for lead in leads:
        writer.writerow(
            [
                lead.id,
                lead.name,
                lead.company,
                lead.designation,
                lead.mobile,
                str(lead.email),
                lead.city,
                lead.priority,
                "|".join(lead.interests),
                "1" if lead.synced else "0",
                lead.captured_at,
                lead.capture_source or "",
                lead.capturer_name or "",
                str(lead.capturer_email or ""),
                lead.summary,
            ]
        )

    return Response(
        content=buf.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="conninter-leads.csv"'},
    )


@router.get("/leads/export.xlsx")
def export_leads_xlsx(
    q: str | None = None,
    priority: Priority | None = None,
    synced: bool | None = None,
    source: CaptureSource | Literal["unknown"] | None = None,
    captured_by: str | None = Query(default=None, alias="capturedBy"),
) -> Response:
    from app.services.card_images import lead_has_card_image
    from app.services.export_xlsx import build_leads_workbook
    from app.services.gemini_report import generate_booth_report

    with get_connection() as conn, conn.cursor() as cur:
        leads = _filtered_leads(cur, q, priority, synced, source, captured_by)
        image_flags = {lead.id: lead_has_card_image(conn, lead.id) for lead in leads}

    overview_data = overview()
    report = generate_booth_report(overview_data, leads)
    content = build_leads_workbook(leads, overview_data, report.markdown, image_flags)
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="conninter-leads.xlsx"'},
    )


@router.post("/reports/booth", response_model=BoothReportResponse)
def booth_report() -> BoothReportResponse:
    from app.services.gemini_report import generate_booth_report

    with get_connection() as conn, conn.cursor() as cur:
        leads = _filtered_leads(cur, None, None, None, None, None)
    return generate_booth_report(overview(), leads)


@router.get("/leads", response_model=list[Lead])
def list_leads(
    q: str | None = None,
    priority: Priority | None = None,
    synced: bool | None = None,
    source: CaptureSource | Literal["unknown"] | None = None,
    captured_by: str | None = Query(default=None, alias="capturedBy"),
) -> list[Lead]:
    with get_connection() as conn, conn.cursor() as cur:
        return _filtered_leads(cur, q, priority, synced, source, captured_by)


@router.get("/leads/{lead_id}", response_model=Lead)
def get_lead(lead_id: str) -> Lead:
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(LEAD_SELECT_BY_ID_SQL, (lead_id,))
        row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found")
    return map_lead_row(row)


@router.get("/leads/{lead_id}/card-image")
def get_lead_card_image(lead_id: str) -> Response:
    from app.services.card_images import get_card_image_for_lead

    with get_connection() as conn:
        row = get_card_image_for_lead(conn, lead_id)
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Card image not found")
    return Response(
        content=bytes(row["image_blob"]),
        media_type=row["mime_type"] or "image/jpeg",
        headers={
            "Content-Disposition": f'inline; filename="lead-{lead_id}-card.jpg"',
            "Cache-Control": "private, max-age=3600",
        },
    )


@router.delete("/leads/{lead_id}")
def delete_lead(lead_id: str) -> dict[str, bool]:
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute("SELECT id FROM leads WHERE id = %s", (lead_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found")
        cur.execute("DELETE FROM lead_card_images WHERE lead_id = %s", (lead_id,))
        cur.execute("DELETE FROM leads WHERE id = %s", (lead_id,))
        conn.commit()
    return {"ok": True}


@router.get("/appointments", response_model=list[Appointment])
def list_appointments() -> list[Appointment]:
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT id, lead_name, type, when_label, status FROM appointments ORDER BY id"
        )
        return [map_appointment_row(row) for row in cur.fetchall()]


@router.patch("/appointments/{appointment_id}", response_model=Appointment)
def patch_appointment(appointment_id: str, body: PatchAppointmentRequest) -> Appointment:
    if body.status is None and body.when is None and body.type is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nothing to update")

    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT id, lead_name, type, when_label, status FROM appointments WHERE id = %s",
            (appointment_id,),
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Appointment not found")

        new_status = body.status or row["status"]
        new_when = body.when.strip() if body.when else row["when_label"]
        new_type = body.type or row["type"]
        if not new_when:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="when is required")

        cur.execute(
            """
            UPDATE appointments
            SET status = %s, when_label = %s, type = %s
            WHERE id = %s
            """,
            (new_status, new_when, new_type, appointment_id),
        )
        conn.commit()
        cur.execute(
            "SELECT id, lead_name, type, when_label, status FROM appointments WHERE id = %s",
            (appointment_id,),
        )
        updated = cur.fetchone()

    return map_appointment_row(updated)
