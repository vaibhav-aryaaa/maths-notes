import base64
import copy
import hashlib
import json
import time
from collections import OrderedDict
from io import BytesIO

from fastapi import APIRouter, Depends, HTTPException, Request
from PIL import Image

from apps.calculator.utils import AIParsingError, analyze_image
from auth import verify_app_key
from rate_limiter import limiter
from schema import ImageData

router = APIRouter()

# In-memory query cache with LRU eviction and 10-minute TTL
_result_cache: OrderedDict[str, dict] = OrderedDict()

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
    except Exception:
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

    # 2. Check cache first
    vars_encoded = json.dumps(data.dict_of_vars, sort_keys=True).encode('utf-8')
    key_hash = hashlib.sha256(image_data + vars_encoded).hexdigest()

    now = time.time()
    if key_hash in _result_cache:
        cached_item = _result_cache[key_hash]
        if now - cached_item["timestamp"] < 600:
            # Cache hit! Move to end for LRU recency
            _result_cache.move_to_end(key_hash)
            cached_responses = cached_item["result"]

            # Deep copy to prevent mutating the cache values
            formatted_responses = []
            for resp in cached_responses:
                item = copy.deepcopy(resp)
                item['latency'] = 0
                formatted_responses.append(item)

            print("response in route (cached hit): ", formatted_responses)
            return {
                "message": "Image processed successfully",
                "type": "success",
                "data": formatted_responses,
                "cached": True
            }
        else:
            # Stale entry, evict it
            _result_cache.pop(key_hash, None)

    # 3. Call the AI provider (Cache Miss)
    try:
        start_time = time.time()
        responses = analyze_image(image, dict_of_vars=data.dict_of_vars)
        end_time = time.time()
    except AIParsingError:
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=502,
            detail="The AI provider returned a response that could not be parsed. Please try drawing more clearly or check for stray marks."
        )
    except Exception:
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=502,
            detail="The AI provider failed to process this request. Please try again."
        )

    latency = round((end_time - start_time) * 1000)

    # Save a deep copy in the cache
    while len(_result_cache) >= 1000:
        _result_cache.popitem(last=False)
    _result_cache[key_hash] = {
        "result": copy.deepcopy(responses),
        "timestamp": now
    }

    formatted_responses = []
    for response in responses:
        response['latency'] = latency
        formatted_responses.append(response)

    print('response in route: ', formatted_responses)
    return {
        "message": "Image processed successfully",
        "type": "success",
        "data": formatted_responses,
        "cached": False
    }
