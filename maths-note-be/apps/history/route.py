from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import List, Dict, Any

from auth import get_current_user
from db import (
    get_user_history,
    save_history_entry,
    sync_history_entries,
    delete_history_entry,
    purge_user_history
)

router = APIRouter()

class HistoryEntryPayload(BaseModel):
    id: str
    timestamp: int
    canvasThumbnail: str
    canvasImage: str
    results: List[Dict[str, Any]]
    dictOfVars: Dict[str, Any]

class SingleEntrySaveRequest(BaseModel):
    entry: HistoryEntryPayload

class SyncHistoryRequest(BaseModel):
    entries: List[HistoryEntryPayload]

@router.get("", response_model=Dict[str, Any])
async def get_history_endpoint(user_id: str = Depends(get_current_user)):
    try:
        entries = get_user_history(user_id)
        return {"status": "success", "entries": entries}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch user history: {str(e)}"
        )

@router.post("", response_model=Dict[str, Any])
async def save_entry_endpoint(payload: SingleEntrySaveRequest, user_id: str = Depends(get_current_user)):
    try:
        save_history_entry(user_id, payload.entry.dict())
        return {"status": "success", "message": "History entry saved successfully"}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save history entry: {str(e)}"
        )

@router.post("/sync", response_model=Dict[str, Any])
async def sync_history_endpoint(payload: SyncHistoryRequest, user_id: str = Depends(get_current_user)):
    try:
        raw_entries = [entry.dict() for entry in payload.entries]
        synced_entries = sync_history_entries(user_id, raw_entries)
        return {"status": "success", "entries": synced_entries}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to sync history entries: {str(e)}"
        )

@router.delete("/purge", response_model=Dict[str, Any])
async def purge_history_endpoint(user_id: str = Depends(get_current_user)):
    try:
        purge_user_history(user_id)
        return {"status": "success", "message": "All user history data purged successfully"}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to purge user history: {str(e)}"
        )

@router.delete("/{entry_id}", response_model=Dict[str, Any])
async def delete_entry_endpoint(entry_id: str, user_id: str = Depends(get_current_user)):
    try:
        delete_history_entry(user_id, entry_id)
        return {"status": "success", "message": "History entry deleted successfully"}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete history entry: {str(e)}"
        )
