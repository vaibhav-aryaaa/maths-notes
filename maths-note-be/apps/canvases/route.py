import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status

from auth import get_current_user, verify_app_key
from db import (
    create_canvas,
    create_folder,
    delete_canvas,
    delete_folder,
    get_canvas_detail,
    get_user_canvases_metadata,
    get_user_folders,
    update_canvas,
    update_folder,
)
from rate_limiter import limiter
from schema import (
    CanvasCreate,
    CanvasDetailResponse,
    CanvasMetadataResponse,
    CanvasUpdate,
    FolderCreate,
    FolderResponse,
    FolderUpdate,
)

logger = logging.getLogger(__name__)

folders_router = APIRouter(dependencies=[Depends(verify_app_key)])
canvases_router = APIRouter(dependencies=[Depends(verify_app_key)])


# ============================================================================
# FOLDERS ENDPOINTS (/folders)
# ============================================================================


@folders_router.post("", response_model=FolderResponse)
@limiter.limit("30/minute")
async def create_folder_endpoint(request: Request, payload: FolderCreate, user_id: str = Depends(get_current_user)):
    try:
        folder = create_folder(user_id=user_id, name=payload.name)
        return folder
    except Exception:
        logger.exception("Failed to create folder")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to create folder.")


@folders_router.get("", response_model=list[FolderResponse])
@limiter.limit("60/minute")
async def list_folders_endpoint(request: Request, user_id: str = Depends(get_current_user)):
    try:
        folders = get_user_folders(user_id=user_id)
        return folders
    except Exception:
        logger.exception("Failed to list folders")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to list folders.")


@folders_router.patch("/{folder_id}", response_model=FolderResponse)
@limiter.limit("30/minute")
async def update_folder_endpoint(
    request: Request, folder_id: str, payload: FolderUpdate, user_id: str = Depends(get_current_user)
):
    try:
        updated = update_folder(user_id=user_id, folder_id=folder_id, name=payload.name)
        if not updated:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Folder not found or not owned by user.")
        return updated
    except HTTPException:
        raise
    except Exception:
        logger.exception(f"Failed to update folder {folder_id}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to update folder.")


@folders_router.delete("/{folder_id}", response_model=dict[str, Any])
@limiter.limit("30/minute")
async def delete_folder_endpoint(request: Request, folder_id: str, user_id: str = Depends(get_current_user)):
    try:
        deleted = delete_folder(user_id=user_id, folder_id=folder_id)
        if not deleted:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Folder not found or not owned by user.")
        return {"status": "success", "message": "Folder deleted successfully and notebooks moved to root."}
    except HTTPException:
        raise
    except Exception:
        logger.exception(f"Failed to delete folder {folder_id}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to delete folder.")


# ============================================================================
# CANVASES ENDPOINTS (/canvases)
# ============================================================================


@canvases_router.post("", response_model=CanvasDetailResponse)
@limiter.limit("30/minute")
async def create_canvas_endpoint(request: Request, payload: CanvasCreate, user_id: str = Depends(get_current_user)):
    try:
        canvas = create_canvas(
            user_id=user_id,
            name=payload.name,
            folder_id=payload.folder_id,
            thumbnail=payload.thumbnail,
            elements=payload.elements,
        )
        return canvas
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except Exception:
        logger.exception("Failed to create canvas")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to create canvas.")


@canvases_router.get("", response_model=list[CanvasMetadataResponse])
@limiter.limit("60/minute")
async def list_canvases_metadata_endpoint(
    request: Request, folder_id: str | None = Query(None), user_id: str = Depends(get_current_user)
):
    try:
        canvases = get_user_canvases_metadata(user_id=user_id, folder_id=folder_id)
        return canvases
    except Exception:
        logger.exception("Failed to list canvases metadata")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to list canvases.")


@canvases_router.get("/{canvas_id}", response_model=CanvasDetailResponse)
@limiter.limit("60/minute")
async def get_canvas_detail_endpoint(request: Request, canvas_id: str, user_id: str = Depends(get_current_user)):
    try:
        canvas = get_canvas_detail(user_id=user_id, canvas_id=canvas_id)
        if not canvas:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Canvas not found or not owned by user.")
        return canvas
    except HTTPException:
        raise
    except Exception:
        logger.exception(f"Failed to get canvas {canvas_id}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to get canvas.")


@canvases_router.patch("/{canvas_id}", response_model=CanvasDetailResponse)
@limiter.limit("30/minute")
async def update_canvas_endpoint(
    request: Request, canvas_id: str, payload: CanvasUpdate, user_id: str = Depends(get_current_user)
):
    try:
        update_dict = payload.model_dump(exclude_unset=True)
        update_folder_flag = "folder_id" in update_dict
        updated = update_canvas(
            user_id=user_id,
            canvas_id=canvas_id,
            name=payload.name,
            folder_id=payload.folder_id,
            thumbnail=payload.thumbnail,
            elements=payload.elements,
            update_folder=update_folder_flag,
        )
        if not updated:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Canvas not found or not owned by user.")
        return updated
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except HTTPException:
        raise
    except Exception:
        logger.exception(f"Failed to update canvas {canvas_id}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to update canvas.")


@canvases_router.delete("/{canvas_id}", response_model=dict[str, Any])
@limiter.limit("30/minute")
async def delete_canvas_endpoint(request: Request, canvas_id: str, user_id: str = Depends(get_current_user)):
    try:
        deleted = delete_canvas(user_id=user_id, canvas_id=canvas_id)
        if not deleted:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Canvas not found or not owned by user.")
        return {"status": "success", "message": "Canvas deleted successfully."}
    except HTTPException:
        raise
    except Exception:
        logger.exception(f"Failed to delete canvas {canvas_id}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to delete canvas.")
