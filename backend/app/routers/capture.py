from fastapi import APIRouter, Depends, HTTPException, status

from app.config import settings
from app.database import get_connection
from app.schemas import (
    AnalyzeCardRequest,
    AnalyzeCardResponse,
    TranscribeRequest,
    TranscribeResponse,
    UploadCardImageRequest,
    UploadCardImageResponse,
)
from app.security import CurrentUser, require_user
from app.services.card_images import store_card_image
from app.services.gemini_capture import analyze_visiting_card
from app.services.voice_notes import transcribe_conversation

router = APIRouter(
    prefix="/api/capture",
    tags=["capture"],
    dependencies=[Depends(require_user)],
)


@router.post("/analyze-card", response_model=AnalyzeCardResponse)
def analyze_card(body: AnalyzeCardRequest) -> AnalyzeCardResponse:
    if not settings.gemini_api_key.strip():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Card scan is temporarily unavailable",
        )

    return analyze_visiting_card(
        image_base64=body.image_base64,
        mime_type=body.mime_type or "image/jpeg",
        ocr_text=body.ocr_text,
    )


@router.post("/transcribe", response_model=TranscribeResponse)
def transcribe_audio(body: TranscribeRequest) -> TranscribeResponse:
    return transcribe_conversation(
        audio_base64=body.audio_base64,
        mime_type=body.mime_type or "audio/webm",
        transcript_hint=body.transcript_hint,
    )


@router.post("/card-image", response_model=UploadCardImageResponse)
def upload_card_image(
    body: UploadCardImageRequest,
    user: CurrentUser = Depends(require_user),
) -> UploadCardImageResponse:
    try:
        with get_connection() as conn:
            return store_card_image(
                conn,
                image_base64=body.image_base64,
                mime_type=body.mime_type or "image/jpeg",
                lead_id=body.lead_id,
                capturer_id=user.id,
            )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not save card image",
        ) from None
