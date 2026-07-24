import base64
from typing import Any

from pydantic import BaseModel, field_validator


class ImageData(BaseModel):
    image: str
    dict_of_vars: dict

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

class CalculationResult(BaseModel):
    expr: str
    result: Any
    type: str
    assign: bool | None = False
    thought_process: str | None = None
    confidence_score: float | None = None
    latency: float | None = None

class CalculationResponse(BaseModel):
    message: str
    type: str
    data: list[CalculationResult]
