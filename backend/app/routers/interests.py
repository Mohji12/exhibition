from fastapi import APIRouter, Depends

from app.database import get_connection
from app.schemas import InterestNameRequest, ManageInterestResponse
from app.security import require_admin

router = APIRouter(
    prefix="/api/interests",
    tags=["interests"],
    dependencies=[Depends(require_admin)],
)


@router.post("", response_model=ManageInterestResponse)
def add_interest_tag(body: InterestNameRequest) -> ManageInterestResponse:
    name = body.name.strip()
    if not name:
        return ManageInterestResponse(ok=False, error="Tag name is required")

    try:
        with get_connection() as conn, conn.cursor() as cur:
            cur.execute("INSERT IGNORE INTO product_interests (name) VALUES (%s)", (name,))
            conn.commit()
        return ManageInterestResponse(ok=True)
    except Exception as exc:
        return ManageInterestResponse(ok=False, error=str(exc))


@router.post("/remove", response_model=ManageInterestResponse)
def remove_interest_tag(body: InterestNameRequest) -> ManageInterestResponse:
    trimmed = body.name.strip()
    if not trimmed:
        return ManageInterestResponse(ok=False, error="Tag name is required")

    try:
        with get_connection() as conn, conn.cursor() as cur:
            cur.execute(
                """
                SELECT COUNT(*) AS c FROM lead_interests li
                JOIN product_interests pi ON li.interest_id = pi.id
                WHERE pi.name = %s
                """,
                (trimmed,),
            )
            usage = cur.fetchone()
            if usage and int(usage["c"]) > 0:
                return ManageInterestResponse(
                    ok=False,
                    error="Cannot remove — tag is used by one or more leads",
                )

            cur.execute("DELETE FROM product_interests WHERE name = %s", (trimmed,))
            conn.commit()

        return ManageInterestResponse(ok=True)
    except Exception as exc:
        return ManageInterestResponse(ok=False, error=str(exc))
