from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        serialize_by_alias=True,
    )


Priority = Literal["hot", "warm", "cold"]
CaptureSource = Literal["qr", "card", "manual"]
AppointmentType = Literal["Online call", "Physical", "Product Demo", "Site Visit"]
AppointmentStatus = Literal["Confirmed", "Pending", "Rescheduled"]
TeamRole = Literal["Rep", "Admin"]


class CaptureMeta(CamelModel):
    raw_qr: str | None = None
    ocr_text: str | None = None
    ocr_confidence: float | None = None
    transcript: str | None = None
    verified_at: str | None = None


class Lead(CamelModel):
    id: str = Field(min_length=1)
    name: str = Field(min_length=1)
    company: str = Field(min_length=1)
    designation: str = Field(min_length=1)
    mobile: str = Field(min_length=10)
    email: EmailStr
    city: str = Field(min_length=1)
    priority: Priority
    interests: list[str] = Field(default_factory=list)
    summary: str = ""
    synced: bool = False
    captured_at: str
    consent_at: str | None = None
    capture_source: CaptureSource | None = None
    capture_meta: CaptureMeta | None = None
    field_confidence: dict[str, float] | None = None


class Appointment(CamelModel):
    id: str = ""
    lead: str = Field(min_length=1)
    type: AppointmentType
    when: str = Field(min_length=1)
    status: AppointmentStatus


class TeamMember(CamelModel):
    name: str
    role: TeamRole
    email: str


class SeedData(CamelModel):
    leads: list[Lead]
    appointments: list[Appointment]
    interests: list[str]
    team: list[TeamMember]


class UpsertLeadResponse(CamelModel):
    ok: bool
    lead: Lead | None = None
    error: str | None = None


class UpsertAppointmentResponse(CamelModel):
    ok: bool
    appointment: Appointment | None = None
    error: str | None = None


class ManageInterestResponse(CamelModel):
    ok: bool
    error: str | None = None


class InterestNameRequest(CamelModel):
    name: str


class SyncResult(CamelModel):
    synced: list[str]
    failed: list[dict[str, str]]
