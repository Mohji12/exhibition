#!/usr/bin/env python3
"""Send welcome + PIN email to all active users with a deliverable email."""
from __future__ import annotations

import time

from app.database import get_connection
from app.security import generate_pin, store_login_pin
from app.services.mail import mail_configured, send_pin_email


def main() -> None:
    if not mail_configured():
        raise SystemExit("mail not configured")

    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, name, email, login_pin_plain, role, status
            FROM users
            WHERE status = 'active'
            ORDER BY created_at, id
            """
        )
        rows = list(cur.fetchall())

    print(f"users={len(rows)}")
    for row in rows:
        email = str(row["email"] or "").strip().lower()
        name = str(row["name"] or "there")
        if not email or email.endswith(".example"):
            print(f"skip|{email}|placeholder")
            continue

        pin = (row.get("login_pin_plain") or "").strip()
        generated = False
        if len(pin) != 4 or not pin.isdigit():
            pin = generate_pin()
            generated = True
            with get_connection() as conn, conn.cursor() as cur:
                store_login_pin(cur, row["id"], pin)
                conn.commit()

        ok, msg = send_pin_email(email, name, pin)
        print(f"{'ok' if ok else 'fail'}|{email}|generated={generated}|{msg}")
        time.sleep(0.4)


if __name__ == "__main__":
    main()
