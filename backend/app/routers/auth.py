from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from app.database import get_connection
from app.schemas import (
    ActivateRequest,
    AuthResponse,
    AuthUserOut,
    InviteStatus,
    LoginRequest,
    PatchMeRequest,
)
from app.security import (
    check_rate_limit,
    generate_token,
    hash_pin,
    issue_jwt,
    require_user,
    utcnow,
    verify_pin,
    CurrentUser,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])

_USER_COLS = (
    "id, name, email, role, status, company, designation, mobile, share_token, "
    "created_at, activated_at"
)


def _row_to_user(row: dict, leads_captured: int = 0) -> AuthUserOut:
    return AuthUserOut(
        id=row["id"],
        name=row["name"],
        email=row["email"],
        role=row["role"],
        status=row["status"],
        company=row.get("company"),
        designation=row.get("designation"),
        mobile=row.get("mobile"),
        share_token=row.get("share_token"),
        created_at=row.get("created_at"),
        activated_at=row.get("activated_at"),
        leads_captured=leads_captured,
    )


def _auth_response(row: dict) -> AuthResponse:
    user_out = _row_to_user(row)
    current = CurrentUser(
        id=row["id"],
        name=row["name"],
        email=row["email"],
        role=row["role"],
        status=row["status"],
    )
    return AuthResponse(token=issue_jwt(current), user=user_out)


@router.post("/login", response_model=AuthResponse)
def login(body: LoginRequest) -> AuthResponse:
    email = str(body.email).strip().lower()
    check_rate_limit(f"login:{email}")

    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            f"""
            SELECT {_USER_COLS}, pin_hash
            FROM users WHERE email = %s
            """,
            (email,),
        )
        row = cur.fetchone()

    if (
        not row
        or row["status"] != "active"
        or not verify_pin(body.pin, row["pin_hash"])
    ):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or PIN")

    return _auth_response(row)


@router.get("/invite/{token}", response_model=InviteStatus)
def lookup_invite(token: str) -> InviteStatus:
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute("SELECT token FROM invites WHERE token = %s", (token,))
        row = cur.fetchone()
    if not row:
        return InviteStatus(ok=False, error="This invite is no longer valid. Ask an admin for a new QR.")
    return InviteStatus(ok=True)


@router.post("/activate", response_model=AuthResponse)
def activate(body: ActivateRequest) -> AuthResponse:
    check_rate_limit(f"activate:{body.token}")
    email = str(body.email).strip().lower()
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Name is required")

    now = utcnow()
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT token, pin_hash, expires_at FROM invites WHERE token = %s",
            (body.token,),
        )
        invite = cur.fetchone()
        if not invite:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invite not found")
        if invite["expires_at"] < now:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="PIN expired. Ask the admin to refresh it.",
            )
        if not verify_pin(body.pin, invite["pin_hash"]):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect activation PIN")

        cur.execute("SELECT id FROM users WHERE email = %s", (email,))
        if cur.fetchone():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="An account with this email already exists")

        user_id = str(uuid.uuid4())
        cur.execute(
            """
            INSERT INTO users (id, name, email, pin_hash, role, status, activated_at, share_token)
            VALUES (%s, %s, %s, %s, 'Rep', 'active', CURRENT_TIMESTAMP, %s)
            """,
            (user_id, name, email, hash_pin(body.login_pin), generate_token()),
        )
        conn.commit()
        cur.execute(f"SELECT {_USER_COLS} FROM users WHERE id = %s", (user_id,))
        row = cur.fetchone()

    return _auth_response(row)


@router.patch("/me", response_model=AuthResponse)
def patch_me(
    body: PatchMeRequest,
    user: Annotated[CurrentUser, Depends(require_user)],
) -> AuthResponse:
    if (
        body.name is None
        and body.email is None
        and body.company is None
        and body.designation is None
        and body.mobile is None
        and body.login_pin is None
    ):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nothing to update")

    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(f"SELECT {_USER_COLS} FROM users WHERE id = %s", (user.id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

        new_name = body.name.strip() if body.name is not None else row["name"]
        new_email = str(body.email).strip().lower() if body.email is not None else row["email"]
        new_company = body.company.strip() if body.company is not None else row.get("company")
        new_designation = (
            body.designation.strip() if body.designation is not None else row.get("designation")
        )
        new_mobile = body.mobile.strip() if body.mobile is not None else row.get("mobile")

        if not new_name:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Name is required")

        if new_email != row["email"]:
            cur.execute("SELECT id FROM users WHERE email = %s AND id <> %s", (new_email, user.id))
            if cur.fetchone():
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already in use")

        sets = [
            "name = %s",
            "email = %s",
            "company = %s",
            "designation = %s",
            "mobile = %s",
        ]
        params: list = [new_name, new_email, new_company or None, new_designation or None, new_mobile or None]
        if body.login_pin:
            sets.append("pin_hash = %s")
            params.append(hash_pin(body.login_pin))
        params.append(user.id)
        cur.execute(f"UPDATE users SET {', '.join(sets)} WHERE id = %s", params)
        conn.commit()
        cur.execute(f"SELECT {_USER_COLS} FROM users WHERE id = %s", (user.id,))
        updated = cur.fetchone()

    return _auth_response(updated)


@router.get("/me", response_model=AuthResponse)
def get_me(user: Annotated[CurrentUser, Depends(require_user)]) -> AuthResponse:
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(f"SELECT {_USER_COLS} FROM users WHERE id = %s", (user.id,))
        row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return _auth_response(row)
