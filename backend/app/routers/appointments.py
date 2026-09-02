import time

from fastapi import APIRouter

from app.database import get_connection
from app.mappers import map_appointment_row
from app.schemas import Appointment, UpsertAppointmentResponse

router = APIRouter(prefix="/api/appointments", tags=["appointments"])


@router.post("", response_model=UpsertAppointmentResponse)
def upsert_appointment(appointment: Appointment) -> UpsertAppointmentResponse:
    appointment_id = appointment.id or f"a{int(time.time() * 1000)}"

    try:
        with get_connection() as conn, conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO appointments (id, lead_name, type, when_label, status)
                VALUES (%s, %s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE
                  lead_name = VALUES(lead_name),
                  type = VALUES(type),
                  when_label = VALUES(when_label),
                  status = VALUES(status)
                """,
                (
                    appointment_id,
                    appointment.lead,
                    appointment.type,
                    appointment.when,
                    appointment.status,
                ),
            )
            conn.commit()

            cur.execute(
                "SELECT id, lead_name, type, when_label, status FROM appointments WHERE id = %s",
                (appointment_id,),
            )
            row = cur.fetchone()

        if not row:
            return UpsertAppointmentResponse(
                ok=False,
                error="Appointment saved but could not be reloaded",
            )

        return UpsertAppointmentResponse(
            ok=True,
            appointment=map_appointment_row(row),
        )
    except Exception as exc:
        return UpsertAppointmentResponse(ok=False, error=str(exc))
