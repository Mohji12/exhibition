from __future__ import annotations

import logging
import uuid

from app.config import settings
from app.database import get_connection
from app.security import generate_token, hash_pin

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

_DEMO_LEAD_IDS = ("1", "2", "3", "4", "5")
_DEMO_APPOINTMENT_IDS = ("a1", "a2", "a3")


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


def _ensure_user_profile_columns(cur) -> None:
    if not _column_exists(cur, "users", "company"):
        cur.execute("ALTER TABLE users ADD COLUMN company VARCHAR(200) NULL")
        logger.info("Added users.company column")
    if not _column_exists(cur, "users", "designation"):
        cur.execute("ALTER TABLE users ADD COLUMN designation VARCHAR(120) NULL")
        logger.info("Added users.designation column")
    if not _column_exists(cur, "users", "mobile"):
        cur.execute("ALTER TABLE users ADD COLUMN mobile VARCHAR(32) NULL")
        logger.info("Added users.mobile column")
    if not _column_exists(cur, "users", "share_token"):
        cur.execute("ALTER TABLE users ADD COLUMN share_token VARCHAR(64) NULL")
        logger.info("Added users.share_token column")
        try:
            cur.execute(
                "ALTER TABLE users ADD UNIQUE INDEX uq_users_share_token (share_token)"
            )
        except Exception:
            logger.warning("Could not add uq_users_share_token", exc_info=True)
    cur.execute("SELECT id FROM users WHERE share_token IS NULL OR share_token = ''")
    missing = cur.fetchall()
    for row in missing:
        cur.execute(
            "UPDATE users SET share_token = %s WHERE id = %s",
            (generate_token(), row["id"]),
        )
    if missing:
        logger.info("Backfilled share_token for %s user(s)", len(missing))


def _ensure_user(cur, name: str, email: str, pin: str, role: str) -> str:
    cur.execute("SELECT id FROM users WHERE email = %s", (email,))
    row = cur.fetchone()
    if row:
        return row["id"]
    user_id = str(uuid.uuid4())
    cur.execute(
        """
        INSERT INTO users (id, name, email, pin_hash, role, status, activated_at, share_token)
        VALUES (%s, %s, %s, %s, %s, 'active', CURRENT_TIMESTAMP, %s)
        """,
        (user_id, name, email, hash_pin(pin), role, generate_token()),
    )
    logger.info("Bootstrapped %s account for %s", role, email)
    return user_id


def _purge_demo_data(cur, keep_admin_email: str) -> None:
    """Remove mock seed rows. Keep the bootstrap admin and real staff/leads."""
    cur.execute(
        "DELETE FROM lead_interests WHERE lead_id IN ("
        + ",".join(["%s"] * len(_DEMO_LEAD_IDS))
        + ")",
        _DEMO_LEAD_IDS,
    )
    if _column_exists(cur, "lead_card_images", "lead_id"):
        cur.execute(
            "DELETE FROM lead_card_images WHERE lead_id IN ("
            + ",".join(["%s"] * len(_DEMO_LEAD_IDS))
            + ")",
            _DEMO_LEAD_IDS,
        )
    cur.execute(
        "DELETE FROM leads WHERE id IN (" + ",".join(["%s"] * len(_DEMO_LEAD_IDS)) + ")",
        _DEMO_LEAD_IDS,
    )
    cur.execute("DELETE FROM leads WHERE email LIKE %s", ("%.example",))
    cur.execute(
        "DELETE FROM appointments WHERE id IN ("
        + ",".join(["%s"] * len(_DEMO_APPOINTMENT_IDS))
        + ")",
        _DEMO_APPOINTMENT_IDS,
    )
    cur.execute(
        "SELECT id FROM users WHERE LOWER(email) <> %s AND email LIKE %s",
        (keep_admin_email.lower(), "%@conninter.example"),
    )
    demo_ids = [row["id"] for row in cur.fetchall()]
    if demo_ids:
        id_ph = ",".join(["%s"] * len(demo_ids))
        cur.execute(f"UPDATE leads SET captured_by = NULL WHERE captured_by IN ({id_ph})", demo_ids)
        if _column_exists(cur, "lead_card_images", "captured_by"):
            cur.execute(
                f"UPDATE lead_card_images SET captured_by = NULL WHERE captured_by IN ({id_ph})",
                demo_ids,
            )
        cur.execute(f"DELETE FROM invites WHERE created_by IN ({id_ph})", demo_ids)
        cur.execute(f"DELETE FROM users WHERE id IN ({id_ph})", demo_ids)
        logger.info("Removed %s demo user(s)", len(demo_ids))


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

        _ensure_user_profile_columns(cur)
        _ensure_user(cur, name, email, pin, "Admin")
        _ensure_captured_by(cur)
        _ensure_card_images(cur)
        _purge_demo_data(cur, email)
        conn.commit()
