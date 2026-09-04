from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field
from pydantic.alias_generators import to_camel

Pin4 = Annotated[str, Field(pattern=r"^\d{4}$")]


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
    live_transcript: str | None = None
    verified_at: str | None = None
    ai_verified_at: str | None = None
    ai_issues: list[str] | None = None
    ocr_quality: Literal["good", "fair", "poor"] | None = None
    card_image_id: str | None = None
    audio_id: str | None = None
    audio_key: str | None = None
    voice_status: Literal["recording", "saved", "processing", "ready", "failed"] | None = None
    voice_error: str | None = None
    processing_note: bool | None = None
    field_confidence: dict[str, float] | None = None


class AnalyzeCardRequest(CamelModel):
    image_base64: str = Field(min_length=32)
    mime_type: str = "image/jpeg"
    ocr_text: str | None = None


class UploadCardImageRequest(CamelModel):
    image_base64: str = Field(min_length=32)
    mime_type: str = "image/jpeg"
    lead_id: str | None = None


class UploadCardImageResponse(CamelModel):
    ok: bool
    id: str
    error: str | None = None


class UploadAudioRequest(CamelModel):
    audio_base64: str = Field(min_length=8)
    mime_type: str = "audio/webm"
    lead_id: str | None = None


class UploadAudioResponse(CamelModel):
    ok: bool
    id: str
    error: str | None = None


class AnalyzeCardFields(CamelModel):
    name: str = ""
    company: str = ""
    designation: str = ""
    mobile: str = ""
    email: str = ""
    city: str = ""


class AnalyzeCardResponse(CamelModel):
    ok: bool
    fields: AnalyzeCardFields
    field_confidence: dict[str, float] = Field(default_factory=dict)
    issues: list[str] = Field(default_factory=list)
    ocr_quality: Literal["good", "fair", "poor"] = "fair"
    error: str | None = None


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
    captured_by: str | None = None
    capturer_name: str | None = None
    capturer_email: EmailStr | None = None


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


AccountStatus = Literal["active", "disabled"]


class AuthUserOut(CamelModel):
    id: str
    name: str
    email: EmailStr
    role: TeamRole
    status: AccountStatus
    company: str | None = None
    designation: str | None = None
    mobile: str | None = None
    event_name: str | None = None
    share_token: str | None = None
    login_pin_plain: str | None = None
    last_login_at: datetime | None = None
    created_at: datetime | None = None
    activated_at: datetime | None = None
    leads_captured: int = 0


class ForgotPinRequest(CamelModel):
    email: EmailStr


class ForgotPinResponse(CamelModel):
    ok: bool
    message: str


class ResetPinResponse(CamelModel):
    ok: bool
    pin: str
    emailed: bool = False
    message: str | None = None
    user: AuthUserOut | None = None


class TranscribeRequest(CamelModel):
    audio_base64: str = Field(min_length=8)
    mime_type: str = "audio/webm"
    transcript_hint: str | None = None


class TranscribeResponse(CamelModel):
    ok: bool
    transcript: str = ""
    summary: str = ""
    error: str | None = None


class AuthResponse(CamelModel):
    token: str
    user: AuthUserOut


class LoginRequest(CamelModel):
    email: EmailStr
    pin: Pin4


class ActivateRequest(CamelModel):
    token: str = Field(min_length=8)
    pin: Pin4
    name: str = Field(min_length=1, max_length=100)
    email: EmailStr
    login_pin: Pin4


class PatchMeRequest(CamelModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    email: EmailStr | None = None
    company: str | None = Field(default=None, max_length=200)
    designation: str | None = Field(default=None, max_length=120)
    mobile: str | None = Field(default=None, max_length=32)
    event_name: str | None = Field(default=None, max_length=200)
    login_pin: Pin4 | None = None


class PublicExhibitorOut(CamelModel):
    name: str
    email: EmailStr
    company: str | None = None
    designation: str | None = None
    mobile: str | None = None
    event_name: str | None = None
    interests: list[str] = Field(default_factory=list)


class PublicVisitorLeadRequest(CamelModel):
    name: str = Field(min_length=1, max_length=120)
    company: str | None = Field(default=None, max_length=200)
    designation: str | None = Field(default=None, max_length=120)
    mobile: str | None = Field(default=None, max_length=32)
    email: str | None = Field(default=None, max_length=200)
    city: str | None = Field(default=None, max_length=120)
    interests: list[str] = Field(default_factory=list)
    capture_source: CaptureSource = "qr"
    ocr_text: str | None = None


class InviteStatus(CamelModel):
    ok: bool
    error: str | None = None


class InviteCreateRequest(CamelModel):
    fresh: bool = False


class InvitePinResponse(CamelModel):
    token: str
    pin: str
    expires_at: datetime


class InterestCount(CamelModel):
    name: str
    count: int


class CaptureSourceBreakdown(CamelModel):
    qr: int = 0
    card: int = 0
    manual: int = 0
    unknown: int = 0


class AppointmentStatusBreakdown(CamelModel):
    confirmed: int = 0
    pending: int = 0
    rescheduled: int = 0


class AdminOverview(CamelModel):
    staff_active: int
    staff_disabled: int
    admins: int
    leads: int
    hot_leads: int
    warm_leads: int
    cold_leads: int
    synced_leads: int
    unsynced_leads: int
    pending_follow_ups: int
    by_source: CaptureSourceBreakdown
    top_interests: list[InterestCount]
    appointments_by_status: AppointmentStatusBreakdown


class BoothReportResponse(CamelModel):
    markdown: str
    generated_at: str
    stats: dict
    used_ai: bool = False


class PatchUserRequest(CamelModel):
    status: AccountStatus | None = None
    role: TeamRole | None = None
    name: str | None = Field(default=None, min_length=1, max_length=100)
    email: EmailStr | None = None
    company: str | None = Field(default=None, max_length=200)
    designation: str | None = Field(default=None, max_length=120)
    mobile: str | None = Field(default=None, max_length=32)
    event_name: str | None = Field(default=None, max_length=200)
    login_pin: Pin4 | None = None


class PatchAppointmentRequest(CamelModel):
    status: AppointmentStatus | None = None
    when: str | None = None
    type: AppointmentType | None = None
