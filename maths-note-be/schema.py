from pydantic import BaseModel, field_validator
from typing import List, Optional, Any
import base64

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
    assign: Optional[bool] = False
    thought_process: Optional[str] = None
    confidence_score: Optional[float] = None
    latency: Optional[float] = None

class CalculationResponse(BaseModel):
    message: str
    type: str
    data: List[CalculationResult]