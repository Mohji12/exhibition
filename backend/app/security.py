from __future__ import annotations

import secrets
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Annotated

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import settings
from app.database import get_connection

bearer_scheme = HTTPBearer(auto_error=False)

PIN_TTL_SECONDS = 60
JWT_TTL_HOURS = 12
RATE_LIMIT_MAX = 8
RATE_LIMIT_WINDOW = 300.0

_attempts: dict[str, list[float]] = {}


@dataclass(frozen=True)
class CurrentUser:
    id: str
    name: str
    email: str
    role: str
    status: str


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def hash_pin(pin: str) -> str:
    return bcrypt.hashpw(pin.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_pin(pin: str, pin_hash: str) -> bool:
    try:
        return bcrypt.checkpw(pin.encode("utf-8"), pin_hash.encode("utf-8"))
    except ValueError:
        return False


def store_login_pin(cur, user_id: str, pin: str) -> None:
    """Persist both the hash (for auth) and recoverable plain PIN (for admin)."""
    cur.execute(
        "UPDATE users SET pin_hash = %s, login_pin_plain = %s WHERE id = %s",
        (hash_pin(pin), pin, user_id),
    )


def generate_pin() -> str:
    return f"{secrets.randbelow(10000):04d}"


def generate_token() -> str:
    return secrets.token_urlsafe(24)


def issue_jwt(user: CurrentUser) -> str:
    payload = {
        "sub": user.id,
        "role": user.role,
        "email": user.email,
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_TTL_HOURS),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, settings.auth_secret, algorithm="HS256")


def check_rate_limit(key: str) -> None:
    now = time.time()
    stamps = [stamp for stamp in _attempts.get(key, []) if now - stamp < RATE_LIMIT_WINDOW]
    if len(stamps) >= RATE_LIMIT_MAX:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many attempts. Try again later.",
        )
    stamps.append(now)
    _attempts[key] = stamps


def load_user_by_id(user_id: str) -> CurrentUser | None:
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT id, name, email, role, status FROM users WHERE id = %s",
            (user_id,),
        )
        row = cur.fetchone()
    if not row:
        return None
    return CurrentUser(
        id=row["id"],
        name=row["name"],
        email=row["email"],
        role=row["role"],
        status=row["status"],
    )


def require_user(
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> CurrentUser:
    if creds is None or not creds.credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sign in required")
    try:
        payload = jwt.decode(creds.credentials, settings.auth_secret, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired session")
    user = load_user_by_id(str(payload.get("sub", "")))
    if not user or user.status != "active":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Account is not active")
    return user


def require_admin(user: Annotated[CurrentUser, Depends(require_user)]) -> CurrentUser:
    if user.role != "Admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return user
