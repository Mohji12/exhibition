#!/usr/bin/env python3
"""Remove leftover e2e / smoke product-interest tags from the catalog."""
from __future__ import annotations

from app.database import get_connection

PATTERNS = (
    "%E2E%",
    "%e2e%",
    "Custom E2E Widget%",
    "%Widget Co%",
)


def main() -> None:
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, name FROM product_interests
            WHERE name LIKE %s OR name LIKE %s OR name LIKE %s OR name LIKE %s
            """,
            PATTERNS,
        )
        rows = cur.fetchall()
        if not rows:
            print("no_test_interests")
            return
        ids = [r["id"] for r in rows]
        ph = ",".join(["%s"] * len(ids))
        cur.execute(f"DELETE FROM lead_interests WHERE interest_id IN ({ph})", ids)
        cur.execute(f"DELETE FROM product_interests WHERE id IN ({ph})", ids)
        conn.commit()
        for r in rows:
            print(f"deleted|{r['name']}")
        print(f"removed={len(rows)}")


if __name__ == "__main__":
    main()
