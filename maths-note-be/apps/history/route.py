import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel

from auth import get_current_user
from db import delete_history_entry, get_user_history, purge_user_history, save_history_entry, sync_history_entries
from rate_limiter import limiter

router = APIRouter()
logger = logging.getLogger(__name__)

class HistoryEntryPayload(BaseModel):
    id: str
    timestamp: int
    canvasThumbnail: str
    canvasImage: str
    results: list[dict[str, Any]]
    dictOfVars: dict[str, Any]

class SingleEntrySaveRequest(BaseModel):
    entry: HistoryEntryPayload

class SyncHistoryRequest(BaseModel):
    entries: list[HistoryEntryPayload]

@router.get("", response_model=dict[str, Any])
@limiter.limit("10/minute")
async def get_history_endpoint(request: Request, user_id: str = Depends(get_current_user)):
    try:
        entries = get_user_history(user_id)
        return {"status": "success", "entries": entries}
    except Exception:
        logger.exception("Failed to fetch user history")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch user history."
        )

@router.post("", response_model=dict[str, Any])
@limiter.limit("10/minute")
async def save_entry_endpoint(request: Request, payload: SingleEntrySaveRequest, user_id: str = Depends(get_current_user)):
    try:
        save_history_entry(user_id, payload.entry.dict())
        return {"status": "success", "message": "History entry saved successfully"}
    except Exception:
        logger.exception("Failed to save history entry")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save history entry."
        )

@router.post("/sync", response_model=dict[str, Any])
@limiter.limit("10/minute")
async def sync_history_endpoint(request: Request, payload: SyncHistoryRequest, user_id: str = Depends(get_current_user)):
    try:
        raw_entries = [entry.dict() for entry in payload.entries]
        synced_entries = sync_history_entries(user_id, raw_entries)
        return {"status": "success", "entries": synced_entries}
    except Exception:
        logger.exception("Failed to sync history entries")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to sync history entries."
        )

@router.delete("/purge", response_model=dict[str, Any])
@limiter.limit("10/minute")
async def purge_history_endpoint(request: Request, user_id: str = Depends(get_current_user)):
    try:
        purge_user_history(user_id)
        return {"status": "success", "message": "All user history data purged successfully"}
    except Exception:
        logger.exception("Failed to purge user history")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to purge user history."
        )

@router.delete("/{entry_id}", response_model=dict[str, Any])
@limiter.limit("10/minute")
async def delete_entry_endpoint(request: Request, entry_id: str, user_id: str = Depends(get_current_user)):
    try:
        delete_history_entry(user_id, entry_id)
        return {"status": "success", "message": "History entry deleted successfully"}
    except Exception:
        logger.exception("Failed to delete history entry")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete history entry."
        )
