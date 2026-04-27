from fastapi import APIRouter
import base64
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
        responses=analyze_image(image, dict_of_vars=data.dict_of_vars)
        data= []
        for response in responses:
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
    