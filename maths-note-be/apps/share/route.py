import logging
import secrets
import base64
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, field_validator

from auth import verify_app_key
from rate_limiter import limiter
from db import create_share, get_share
from schema import CalculationResult

router = APIRouter()
logger = logging.getLogger(__name__)

class ShareCreateRequest(BaseModel):
    image: str
    data: list[CalculationResult]

    @field_validator('image')
    @classmethod
    def validate_image_string(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError('Image string cannot be empty')

        raw = v.strip()
        if ',' in raw:
            parts = raw.split(',', 1)
            if not parts[0].startswith('data:image/'):
                raise ValueError('Image prefix must start with data:image/')
            raw = parts[1]

        try:
            base64.b64decode(raw)
        except Exception:
            raise ValueError('Invalid base64 encoding')

        return v

@router.post("", dependencies=[Depends(verify_app_key)])
@limiter.limit("10/minute")
async def create_share_endpoint(request: Request, body: ShareCreateRequest):
    # Generate unique 8-character url-safe token ID
    share_id = secrets.token_urlsafe(8)
    
    # Rare collision check
    while get_share(share_id) is not None:
        share_id = secrets.token_urlsafe(8)
        
    try:
        results_list = [item.model_dump() for item in body.data]
        create_share(share_id, body.image, results_list)
        logger.info(f"Created share link. ID: {share_id}")
    except Exception:
        logger.exception("Failed to write share entry to SQLite")
        raise HTTPException(
            status_code=500,
            detail="Failed to generate share link. Please try again."
        )
        
    return {"share_id": share_id, "status": "success"}

@router.get("/{share_id}")
async def get_share_endpoint(share_id: str):
    try:
        share = get_share(share_id)
    except Exception:
        logger.exception("Failed to read share entry from SQLite")
        raise HTTPException(
            status_code=500,
            detail="Failed to retrieve share data."
        )
        
    if not share:
        raise HTTPException(
            status_code=404,
            detail="Share link has expired or does not exist."
        )
        
    return {
        "status": "success",
        "image": share["image"],
        "data": share["data"]
    }
