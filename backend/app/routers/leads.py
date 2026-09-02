from fastapi import APIRouter

from app.database import get_connection
from app.schemas import Lead, SyncResult, UpsertLeadResponse
from app.services.lead_db import upsert_lead_in_db

router = APIRouter(prefix="/api/leads", tags=["leads"])


@router.post("", response_model=UpsertLeadResponse)
def upsert_lead(lead: Lead) -> UpsertLeadResponse:
    with get_connection() as conn:
        return upsert_lead_in_db(conn, lead, mark_synced=True)


@router.post("/sync", response_model=SyncResult)
def sync_pending_leads(leads: list[Lead]) -> SyncResult:
    synced: list[str] = []
    failed: list[dict[str, str]] = []

    for lead in leads:
        with get_connection() as conn:
            result = upsert_lead_in_db(conn, lead, mark_synced=True)
            if result.ok and result.lead:
                synced.append(result.lead.id)
            else:
                failed.append({"id": lead.id, "error": result.error or "Unknown error"})

    return SyncResult(synced=synced, failed=failed)
