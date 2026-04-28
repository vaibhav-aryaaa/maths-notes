from fastapi import APIRouter
import base64
import time
from io import BytesIO
from apps.calculator.utils import analyze_image
from schema import ImageData
from PIL import Image

router = APIRouter()

@router.post('')
async def run(data: ImageData):
    try:
        image_data= base64.b64decode(data.image.split(',')[1])
        image_bytes=BytesIO(image_data)
        image = Image.open(image_bytes)
        start_time = time.time()
        responses=analyze_image(image, dict_of_vars=data.dict_of_vars)
        end_time = time.time()
        latency = round((end_time - start_time) * 1000)
        data= []
        for response in responses:
            response['latency'] = latency
            data.append(response)
        print('response in route: ', responses)
        return{
            "message": "Image processed successfully",
            "type": "success",
            "data": data,
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"error": str(e), "data": []}
    