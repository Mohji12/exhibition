from __future__ import annotations

import logging
import uuid

from app.config import settings
from app.database import get_connection
from app.security import hash_pin

logger = logging.getLogger(__name__)

_CREATE_USERS = """
CREATE TABLE IF NOT EXISTS users (
  id CHAR(36) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(200) NOT NULL UNIQUE,
  pin_hash VARCHAR(255) NOT NULL,
  role ENUM('Rep', 'Admin') NOT NULL,
  status ENUM('active', 'disabled') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  activated_at TIMESTAMP NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
"""

_CREATE_INVITES = """
CREATE TABLE IF NOT EXISTS invites (
  id CHAR(36) PRIMARY KEY,
  token VARCHAR(64) NOT NULL UNIQUE,
  pin_hash VARCHAR(255) NOT NULL,
  expires_at DATETIME NOT NULL,
  created_by CHAR(36) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
"""

_SAMPLE_REPS = [
    ("Priya S.", "priya@conninter.example", "1111"),
    ("Ditto", "ditto@conninter.example", "2222"),
]


def _column_exists(cur, table: str, column: str) -> bool:
    cur.execute(
        """
        SELECT COUNT(*) AS c FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = %s AND COLUMN_NAME = %s
        """,
        (table, column),
    )
    return int(cur.fetchone()["c"]) > 0


def _constraint_exists(cur, name: str) -> bool:
    cur.execute(
        """
        SELECT COUNT(*) AS c FROM information_schema.TABLE_CONSTRAINTS
        WHERE TABLE_SCHEMA = DATABASE() AND CONSTRAINT_NAME = %s
        """,
        (name,),
    )
    return int(cur.fetchone()["c"]) > 0


def _ensure_captured_by(cur) -> None:
    if not _column_exists(cur, "leads", "captured_by"):
        cur.execute("ALTER TABLE leads ADD COLUMN captured_by CHAR(36) NULL")
        logger.info("Added leads.captured_by column")
    if not _constraint_exists(cur, "fk_leads_captured_by"):
        cur.execute(
            """
            ALTER TABLE leads
              ADD CONSTRAINT fk_leads_captured_by
              FOREIGN KEY (captured_by) REFERENCES users(id) ON DELETE SET NULL
            """
        )
        logger.info("Added fk_leads_captured_by")


def _ensure_user(cur, name: str, email: str, pin: str, role: str) -> str:
    cur.execute("SELECT id FROM users WHERE email = %s", (email,))
    row = cur.fetchone()
    if row:
        return row["id"]
    user_id = str(uuid.uuid4())
    cur.execute(
        """
        INSERT INTO users (id, name, email, pin_hash, role, status, activated_at)
        VALUES (%s, %s, %s, %s, %s, 'active', CURRENT_TIMESTAMP)
        """,
        (user_id, name, email, hash_pin(pin), role),
    )
    logger.info("Bootstrapped %s account for %s", role, email)
    return user_id


def _attribute_sample_leads(cur, ditto_id: str, priya_id: str) -> None:
    # Assign demo seed leads (if present) so admin filters have data.
    assignments = [
        ("1", ditto_id, "qr"),
        ("2", ditto_id, "card"),
        ("5", ditto_id, "manual"),
        ("3", priya_id, "qr"),
        ("4", priya_id, "manual"),
    ]
    for lead_id, user_id, source in assignments:
        cur.execute(
            """
            UPDATE leads
            SET captured_by = COALESCE(captured_by, %s),
                capture_source = COALESCE(capture_source, %s)
            WHERE id = %s
            """,
            (user_id, source, lead_id),
        )


_CREATE_CARD_IMAGES = """
CREATE TABLE IF NOT EXISTS lead_card_images (
  id CHAR(36) PRIMARY KEY,
  lead_id VARCHAR(36) NULL,
  mime_type VARCHAR(64) NOT NULL DEFAULT 'image/jpeg',
  image_blob MEDIUMBLOB NOT NULL,
  sha256 CHAR(64) NOT NULL,
  captured_by CHAR(36) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_lead_card_images_lead (lead_id),
  INDEX idx_lead_card_images_sha (sha256)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
"""


def _ensure_card_images(cur) -> None:
    cur.execute(_CREATE_CARD_IMAGES)
    if not _constraint_exists(cur, "fk_lead_card_images_lead"):
        try:
            cur.execute(
                """
                ALTER TABLE lead_card_images
                  ADD CONSTRAINT fk_lead_card_images_lead
                  FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL
                """
            )
        except Exception:
            logger.warning("Could not add fk_lead_card_images_lead", exc_info=True)
    if not _constraint_exists(cur, "fk_lead_card_images_user"):
        try:
            cur.execute(
                """
                ALTER TABLE lead_card_images
                  ADD CONSTRAINT fk_lead_card_images_user
                  FOREIGN KEY (captured_by) REFERENCES users(id) ON DELETE SET NULL
                """
            )
        except Exception:
            logger.warning("Could not add fk_lead_card_images_user", exc_info=True)


def bootstrap_auth() -> None:
    email = settings.auth_bootstrap_email.strip().lower()
    pin = settings.auth_bootstrap_pin.strip()
    name = settings.auth_bootstrap_name.strip() or "Conninter Admin"

    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(_CREATE_USERS)
        cur.execute(_CREATE_INVITES)
        conn.commit()

        _ensure_user(cur, name, email, pin, "Admin")

        sample_ids: dict[str, str] = {}
        for rep_name, rep_email, rep_pin in _SAMPLE_REPS:
            sample_ids[rep_email] = _ensure_user(cur, rep_name, rep_email, rep_pin, "Rep")

        _ensure_captured_by(cur)
        _ensure_card_images(cur)
        _attribute_sample_leads(
            cur,
            sample_ids["ditto@conninter.example"],
            sample_ids["priya@conninter.example"],
        )
        conn.commit()
