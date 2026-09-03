from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException, status

from app.database import get_connection
from app.schemas import ActivateRequest, AuthResponse, AuthUserOut, InviteStatus, LoginRequest
from app.security import (
    check_rate_limit,
    hash_pin,
    issue_jwt,
    utcnow,
    verify_pin,
    CurrentUser,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _row_to_user(row: dict) -> AuthUserOut:
    return AuthUserOut(
        id=row["id"],
        name=row["name"],
        email=row["email"],
        role=row["role"],
        status=row["status"],
        created_at=row.get("created_at"),
        activated_at=row.get("activated_at"),
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
            """
            SELECT id, name, email, pin_hash, role, status, created_at, activated_at
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
            INSERT INTO users (id, name, email, pin_hash, role, status, activated_at)
            VALUES (%s, %s, %s, %s, 'Rep', 'active', CURRENT_TIMESTAMP)
            """,
            (user_id, name, email, hash_pin(body.login_pin)),
        )
        conn.commit()
        cur.execute(
            """
            SELECT id, name, email, role, status, created_at, activated_at
            FROM users WHERE id = %s
            """,
            (user_id,),
        )
        row = cur.fetchone()

    return _auth_response(row)
