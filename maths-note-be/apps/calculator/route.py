from fastapi import APIRouter, Request, Depends, HTTPException
import base64
import time
from io import BytesIO
from apps.calculator.utils import analyze_image, AIParsingError
from schema import ImageData
from PIL import Image
from rate_limiter import limiter
from auth import verify_app_key

router = APIRouter()

@router.post('', dependencies=[Depends(verify_app_key)])
@limiter.limit("10/minute")
async def run(request: Request, data: ImageData):
    # 1. Decode the incoming image
    try:
        raw = data.image
        if ',' in raw:
            raw = raw.split(',', 1)[1]
        image_data = base64.b64decode(raw)
        image_bytes = BytesIO(image_data)
        image = Image.open(image_bytes)
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=400,
            detail="Invalid or malformed base64 image data"
        )

    # Validate image dimensions
    if image.width < 10 or image.height < 10:
        raise HTTPException(
            status_code=400,
            detail="Image is too small. Please provide a clearer drawing."
        )
    if image.width > 4000 or image.height > 4000:
        raise HTTPException(
            status_code=400,
            detail="Image dimensions exceed maximum limit of 4000x4000px."
        )

    # Validate image format
    if image.format not in ("PNG", "JPEG", "WEBP"):
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported image format: {image.format}. Allowed formats are PNG, JPEG, and WEBP."
        )

    # 2. Call the AI provider
    try:
        start_time = time.time()
        responses = analyze_image(image, dict_of_vars=data.dict_of_vars)
        end_time = time.time()
    except AIParsingError as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=502,
            detail="The AI provider returned a response that could not be parsed. Please try drawing more clearly or check for stray marks."
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=502,
            detail="The AI provider failed to process this request. Please try again."
        )

    latency = round((end_time - start_time) * 1000)
    formatted_responses = []
    for response in responses:
        response['latency'] = latency
        formatted_responses.append(response)
        
    print('response in route: ', formatted_responses)
    return {
        "message": "Image processed successfully",
        "type": "success",
        "data": formatted_responses,
    }
    