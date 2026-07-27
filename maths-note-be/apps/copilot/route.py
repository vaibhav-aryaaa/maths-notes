import logging
import re

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from apps.copilot.utils import chat_with_copilot_stream
from auth import verify_app_key
from rate_limiter import limiter

router = APIRouter()
logger = logging.getLogger(__name__)

class ChatRequest(BaseModel):
    session_id: str
    message: str
    canvas_image: str
    dict_of_vars: dict
    results: list = []   # AI-solved results from the canvas

@router.post("", dependencies=[Depends(verify_app_key)])
@limiter.limit("10/minute")
async def copilot_chat(request: Request, data: ChatRequest):
    if not re.fullmatch(r'[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}', data.session_id):
        raise HTTPException(status_code=400, detail="Invalid session_id format. Must be UUIDv4.")

    logger.info("Processing Copilot streaming chat request. Session ID: %s, Message length: %d", data.session_id, len(data.message))
    try:
        generator = chat_with_copilot_stream(
            session_id=data.session_id,
            user_message=data.message,
            canvas_b64=data.canvas_image,
            dict_of_vars=data.dict_of_vars,
            results=data.results,
        )
    except Exception:
        logger.exception("Failed calling Copilot chat stream API")
        raise HTTPException(
            status_code=502,
            detail="The AI provider failed to process this request. Please try again."
        )
    return StreamingResponse(generator, media_type="text/event-stream")
