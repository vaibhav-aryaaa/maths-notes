import requests
import base64
from PIL import Image
from io import BytesIO

url = "http://localhost:8905/calculate"
headers = {
    "Content-Type": "application/json",
    "X-App-Key": "super-secret-default-key-12345"
}

def test_pydantic_validator():
    print("Testing Pydantic validator on empty/invalid base64...")
    
    # 1. Empty image string
    r1 = requests.post(url, json={"image": "", "dict_of_vars": {}}, headers=headers)
    print(f"Empty image status: {r1.status_code}, response: {r1.text}")
    assert r1.status_code == 422
    
    # 2. Invalid base64 prefix
    r2 = requests.post(url, json={"image": "data:text/plain;base64,abc", "dict_of_vars": {}}, headers=headers)
    print(f"Invalid prefix status: {r2.status_code}, response: {r2.text}")
    assert r2.status_code == 422

def test_tiny_image():
    print("Testing tiny 1x1 image rejection...")
    img = Image.new('RGB', (1, 1))
    buf = BytesIO()
    img.save(buf, format='PNG')
    b64_tiny = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode('utf-8')
    
    r = requests.post(url, json={"image": b64_tiny, "dict_of_vars": {}}, headers=headers)
    print(f"Tiny image status: {r.status_code}, response: {r.text}")
    assert r.status_code == 400
    assert "too small" in r.text

def test_oversized_dimensions():
    print("Testing oversized dimensions rejection (4001x4001)...")
    img = Image.new('RGB', (4001, 4001))
    buf = BytesIO()
    img.save(buf, format='PNG')
    b64_large = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode('utf-8')
    
    r = requests.post(url, json={"image": b64_large, "dict_of_vars": {}}, headers=headers)
    print(f"Oversized status: {r.status_code}, response: {r.text}")
    assert r.status_code == 400
    assert "dimensions exceed" in r.text

def test_unsupported_format():
    print("Testing unsupported format rejection (BMP)...")
    img = Image.new('RGB', (20, 20))
    buf = BytesIO()
    img.save(buf, format='BMP')
    # Save as BMP but send
    b64_bmp = "data:image/bmp;base64," + base64.b64encode(buf.getvalue()).decode('utf-8')
    
    r = requests.post(url, json={"image": b64_bmp, "dict_of_vars": {}}, headers=headers)
    print(f"BMP format status: {r.status_code}, response: {r.text}")
    assert r.status_code == 400
    assert "Unsupported image format" in r.text

def test_large_upload_size_limit():
    print("Testing 8MB ASGI upload limit (sending >8MB payload)...")
    # 8.5 MB string
    large_payload = "a" * (9 * 1024 * 1024)
    r = requests.post(url, data=large_payload, headers={"Content-Type": "application/json"})
    print(f"Large payload status: {r.status_code}, response: {r.text}")
    assert r.status_code == 413

if __name__ == "__main__":
    test_pydantic_validator()
    test_tiny_image()
    test_oversized_dimensions()
    test_unsupported_format()
    test_large_upload_size_limit()
    print("All image validation tests completed successfully!")
