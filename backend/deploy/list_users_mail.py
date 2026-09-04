#!/usr/bin/env python3
from app.database import get_connection

with get_connection() as conn, conn.cursor() as cur:
    cur.execute(
        """
        SELECT id, name, email, role, status,
               login_pin_plain IS NOT NULL AS has_pin,
               login_pin_plain
        FROM users
        ORDER BY id
        """
    )
    rows = cur.fetchall()
    print("count", len(rows))
    for r in rows:
        pin = r.get("login_pin_plain") or ""
        print(
            "|".join(
                [
                    str(r["id"]),
                    str(r["role"]),
                    str(r.get("status")),
                    f"has_pin={bool(r['has_pin'])}",
                    f"pin_len={len(pin)}",
                    str(r["email"]),
                    str(r["name"]),
                ]
            )
        )
