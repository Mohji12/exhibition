import logging

from fastapi import APIRouter, Depends

from app.database import get_connection
from app.mappers import LEAD_SELECT_SQL, map_appointment_row, map_lead_row, map_team_row
from app.schemas import SeedData
from app.security import require_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["seed"], dependencies=[Depends(require_user)])


@router.get("/seed", response_model=SeedData | None)
def fetch_seed_data() -> SeedData | None:
    try:
        with get_connection() as conn, conn.cursor() as cur:
            cur.execute("SELECT name FROM product_interests ORDER BY id")
            interests = [row["name"] for row in cur.fetchall()]

            cur.execute(f"{LEAD_SELECT_SQL} ORDER BY l.captured_at DESC")
            leads = [map_lead_row(row) for row in cur.fetchall()]

            cur.execute(
                "SELECT id, lead_name, type, when_label, status FROM appointments ORDER BY id"
            )
            appointments = [map_appointment_row(row) for row in cur.fetchall()]

            cur.execute(
                """
                SELECT name, role, email FROM users
                WHERE status = 'active'
                ORDER BY created_at
                """
            )
            team = [map_team_row(row) for row in cur.fetchall()]

        return SeedData(
            leads=leads,
            appointments=appointments,
            interests=interests,
            team=team,
        )
    except Exception:
        logger.warning("MySQL seed fetch failed", exc_info=True)
        return None
