import re

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from apps.copilot.utils import chat_with_copilot
from auth import verify_app_key
from rate_limiter import limiter

router = APIRouter()

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
    try:
        reply = chat_with_copilot(
            session_id=data.session_id,
            user_message=data.message,
            canvas_b64=data.canvas_image,
            dict_of_vars=data.dict_of_vars,
            results=data.results,
        )
    except Exception:
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=502,
            detail="The AI provider failed to process this request. Please try again."
        )
    return {"reply": reply, "status": "success"}
