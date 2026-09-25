import base64
from typing import Any

from pydantic import BaseModel, field_validator


class ImageData(BaseModel):
    image: str
    dict_of_vars: dict

    @field_validator("image")
    @classmethod
    def validate_image_string(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Image string cannot be empty")

        raw = v.strip()
        if "," in raw:
            parts = raw.split(",", 1)
            if not parts[0].startswith("data:image/"):
                raise ValueError("Image prefix must start with data:image/")
            raw = parts[1]

        try:
            base64.b64decode(raw)
        except Exception:
            raise ValueError("Invalid base64 encoding")

        return v


class SolutionStep(BaseModel):
    order: int
    description: str
    expression: str | None = None


class CalculationResult(BaseModel):
    expr: str
    result: Any
    type: str
    assign: bool | None = False
    thought_process: str | None = None
    confidence_score: float | None = None
    latency: float | None = None
    steps: list[SolutionStep] | None = None


class CalculationResponse(BaseModel):
    message: str
    type: str
    data: list[CalculationResult]


class ExplainRequest(BaseModel):
    image: str
    dict_of_vars: dict
    expr: str
    result: Any
    type: str | None = None

    @field_validator("image")
    @classmethod
    def validate_image_string(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Image string cannot be empty")

        raw = v.strip()
        if "," in raw:
            parts = raw.split(",", 1)
            if not parts[0].startswith("data:image/"):
                raise ValueError("Image prefix must start with data:image/")
            raw = parts[1]

        try:
            base64.b64decode(raw)
        except Exception:
            raise ValueError("Invalid base64 encoding")

        return v


class ExplainResponse(BaseModel):
    thought_process: str | None = None
    steps: list[SolutionStep] | None = None


# --- Folders & Canvases Schemas ---


class FolderCreate(BaseModel):
    name: str

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Folder name cannot be empty")
        return v.strip()


class FolderUpdate(BaseModel):
    name: str

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Folder name cannot be empty")
        return v.strip()


class FolderResponse(BaseModel):
    id: str
    user_id: str
    name: str
    created_at: str
    updated_at: str
    deleted_at: str | None = None


class CanvasCreate(BaseModel):
    name: str
    folder_id: str | None = None
    thumbnail: str | None = None
    elements: Any = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Canvas name cannot be empty")
        return v.strip()


class CanvasUpdate(BaseModel):
    name: str | None = None
    folder_id: str | None = None
    thumbnail: str | None = None
    elements: Any = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str | None) -> str | None:
        if v is not None and not v.strip():
            raise ValueError("Canvas name cannot be empty")
        return v.strip() if v is not None else None


class CanvasMetadataResponse(BaseModel):
    id: str
    user_id: str
    folder_id: str | None = None
    name: str
    thumbnail: str | None = None
    created_at: str
    updated_at: str


class CanvasDetailResponse(BaseModel):
    id: str
    user_id: str
    folder_id: str | None = None
    name: str
    thumbnail: str | None = None
    elements: Any = None
    created_at: str
    updated_at: str
    deleted_at: str | None = None
