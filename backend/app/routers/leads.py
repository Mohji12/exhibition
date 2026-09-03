from typing import Annotated

from fastapi import APIRouter, Depends

from app.database import get_connection
from app.schemas import Lead, SyncResult, UpsertLeadResponse
from app.security import CurrentUser, require_user
from app.services.lead_db import upsert_lead_in_db

router = APIRouter(prefix="/api/leads", tags=["leads"], dependencies=[Depends(require_user)])


@router.post("", response_model=UpsertLeadResponse)
def upsert_lead(
    lead: Lead,
    user: Annotated[CurrentUser, Depends(require_user)],
) -> UpsertLeadResponse:
    with get_connection() as conn:
        return upsert_lead_in_db(conn, lead, mark_synced=True, capturer_id=user.id)


@router.post("/sync", response_model=SyncResult)
def sync_pending_leads(
    leads: list[Lead],
    user: Annotated[CurrentUser, Depends(require_user)],
) -> SyncResult:
    synced: list[str] = []
    failed: list[dict[str, str]] = []

    for lead in leads:
        with get_connection() as conn:
            result = upsert_lead_in_db(conn, lead, mark_synced=True, capturer_id=user.id)
            if result.ok and result.lead:
                synced.append(result.lead.id)
            else:
                failed.append({"id": lead.id, "error": result.error or "Unknown error"})

    return SyncResult(synced=synced, failed=failed)
