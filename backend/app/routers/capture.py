from fastapi import APIRouter, Depends, HTTPException, status

from app.config import settings
from app.database import get_connection
from app.schemas import (
    AnalyzeCardRequest,
    AnalyzeCardResponse,
    UploadCardImageRequest,
    UploadCardImageResponse,
)
from app.security import CurrentUser, require_user
from app.services.card_images import store_card_image
from app.services.gemini_capture import analyze_visiting_card

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
            detail="Gemini API key is not configured",
        )

    return analyze_visiting_card(
        image_base64=body.image_base64,
        mime_type=body.mime_type or "image/jpeg",
        ocr_text=body.ocr_text,
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
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc) or "Could not store card image",
        ) from exc
