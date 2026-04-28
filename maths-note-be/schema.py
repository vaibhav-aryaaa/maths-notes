from pydantic import BaseModel
from typing import List, Optional, Any

class ImageData(BaseModel):
    image: str
    dict_of_vars: dict

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