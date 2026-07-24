import asyncio
import os
import sys
import time
from unittest.mock import patch

# Add backend directory to sys.path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import base64
from io import BytesIO

from PIL import Image

from apps.calculator.route import _result_cache, run
from schema import ImageData


def test_cache_hit_and_miss():
    print("Testing cache hit, miss, and call counting...")
    _result_cache.clear()

    # Create a valid tiny image (20x20 pixels PNG)
    img = Image.new('RGB', (20, 20), color='white')
    buf = BytesIO()
    img.save(buf, format='PNG')
    b64_img = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode('utf-8')

    data = ImageData(image=b64_img, dict_of_vars={"x": 5})

    mock_response = [{"expr": "1+1", "result": 2, "type": "math", "thought_process": "easy", "confidence_score": 100}]

    # Mock analyze_image to count calls and simulate latency
    call_count = 0
    def mock_analyze(image, dict_of_vars):
        nonlocal call_count
        call_count += 1
        time.sleep(0.005) # ensure non-zero latency
        return mock_response

    with patch('apps.calculator.route.analyze_image', side_effect=mock_analyze):
        # We call the FastAPI endpoint handler directly with a valid Starlette Request scope
        from starlette.requests import Request
        scope = {
            "type": "http",
            "method": "POST",
            "path": "/calculate",
            "headers": [],
            "client": ("127.0.0.1", 12345)
        }
        req = Request(scope=scope)
        resp1 = None

        resp1 = asyncio.run(run(req, data))

        print(f"Response 1: {resp1}")
        assert resp1["cached"] is False
        assert call_count == 1
        assert resp1["data"][0]["latency"] > 0

        # 2. Second request (identical) - Cache Hit
        resp2 = asyncio.run(run(req, data))

        print(f"Response 2: {resp2}")
        assert resp2["cached"] is True
        assert call_count == 1  # Should NOT increment call_count!
        assert resp2["data"][0]["latency"] == 0  # Should be 0 on cache hit

    print("Cache hit and miss tests passed!")

def test_cache_ttl_and_lru():
    print("Testing cache TTL and LRU capacity bounds...")
    _result_cache.clear()

    img = Image.new('RGB', (20, 20), color='white')
    buf = BytesIO()
    img.save(buf, format='PNG')
    b64_img = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode('utf-8')

    # 1. Test TTL expiration
    import hashlib
    import json

    raw_img_bytes = buf.getvalue()
    vars_encoded = json.dumps({"x": 5}, sort_keys=True).encode('utf-8')
    key_hash = hashlib.sha256(raw_img_bytes + vars_encoded).hexdigest()

    _result_cache[key_hash] = {
        "result": [{"expr": "1+1", "result": 2}],
        "timestamp": time.time() - 601  # 10 minutes and 1 second ago
    }

    from starlette.requests import Request
    scope = {
        "type": "http",
        "method": "POST",
        "path": "/calculate",
        "headers": [],
        "client": ("127.0.0.1", 12345)
    }
    req = Request(scope=scope)
    data = ImageData(image=b64_img, dict_of_vars={"x": 5})

    call_count = 0
    def mock_analyze(image, dict_of_vars):
        nonlocal call_count
        call_count += 1
        time.sleep(0.005) # ensure non-zero latency
        return [{"expr": "1+1", "result": 2}]

    with patch('apps.calculator.route.analyze_image', side_effect=mock_analyze):
        resp = asyncio.run(run(req, data))
        assert resp["cached"] is False
        assert call_count == 1
        assert key_hash in _result_cache
        assert time.time() - _result_cache[key_hash]["timestamp"] < 5  # refreshed

    # 2. Test LRU capacity limit (1000 items)
    _result_cache.clear()
    for i in range(1005):
        _result_cache[f"hash_{i}"] = {
            "result": [],
            "timestamp": time.time()
        }

    assert len(_result_cache) == 1005
    # Requesting run will insert another item, dropping the oldest to maintain <= 1000 limit
    with patch('apps.calculator.route.analyze_image', return_value=[]):
        asyncio.run(run(req, data))

    print(f"Cache size after 1006th insert: {len(_result_cache)}")
    assert len(_result_cache) == 1000
    print("Cache TTL and LRU tests passed!")

if __name__ == "__main__":
    test_cache_hit_and_miss()
    test_cache_ttl_and_lru()
    print("All deduplication cache tests completed successfully!")
