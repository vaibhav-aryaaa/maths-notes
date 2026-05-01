from fastapi import APIRouter
from pydantic import BaseModel
from apps.copilot.utils import chat_with_copilot

router = APIRouter()

class ChatRequest(BaseModel):
    session_id: str
    message: str
    canvas_image: str
    dict_of_vars: dict
    results: list = []   # AI-solved results from the canvas

@router.post("")
async def copilot_chat(data: ChatRequest):
    try:
        reply = chat_with_copilot(
            session_id=data.session_id,
            user_message=data.message,
            canvas_b64=data.canvas_image,
            dict_of_vars=data.dict_of_vars,
            results=data.results,
        )
        return {"reply": reply, "status": "success"}
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"reply": f"Error: {str(e)}", "status": "error"}
