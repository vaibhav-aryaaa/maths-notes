import os
import sys
from unittest.mock import MagicMock, patch

# Add backend directory to sys.path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from google.genai.errors import ClientError, ServerError
from PIL import Image

from apps.calculator.utils import analyze_image


def test_transient_retry_success():
    print("Testing transient retry success (fail twice, succeed on third)...")

    mock_img = Image.new('RGB', (10, 10))

    # We want to mock generate_content to:
    # 1. Raise ServerError on 1st call
    # 2. Raise ServerError on 2nd call
    # 3. Return a valid JSON response on 3rd call
    mock_success_response = MagicMock()
    mock_success_response.text = '[{"expr": "1+1", "result": 2, "type": "math", "thought_process": "easy", "confidence_score": 100}]'

    mock_server_error = ServerError(code=503, response_json={"message": "Service Unavailable"})

    call_count = 0
    def mock_generate(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        if call_count < 3:
            raise mock_server_error
        return mock_success_response

    with patch('apps.calculator.utils.client.models.generate_content', side_effect=mock_generate):
        res = analyze_image(mock_img, {})
        print(f"Result: {res}")
        assert call_count == 3, f"Expected 3 attempts total, got {call_count}"
        assert res[0]["result"] == 2
        print("Transient retry success test passed!")

def test_permanent_fail_fast():
    print("Testing permanent fail fast (ClientError 401 should not retry)...")

    mock_img = Image.new('RGB', (10, 10))

    mock_auth_error = ClientError(code=401, response_json={"message": "API key not valid"})

    call_count = 0
    def mock_generate(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        raise mock_auth_error

    with patch('apps.calculator.utils.client.models.generate_content', side_effect=mock_generate):
        try:
            analyze_image(mock_img, {})
            assert False, "Expected ClientError to propagate"
        except ClientError:
            print("Successfully caught ClientError!")
            assert call_count == 1, f"Expected 1 attempt total, got {call_count}"
            print("Permanent fail fast test passed!")

if __name__ == "__main__":
    test_transient_retry_success()
    test_permanent_fail_fast()
    print("All transient retry tests completed successfully!")
