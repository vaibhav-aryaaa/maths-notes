import os
import sys
from unittest.mock import MagicMock, patch

# Add backend directory to sys.path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from PIL import Image

from apps.calculator.utils import AIParsingError, analyze_image


def test_json_retry_flow():
    print("Testing analyze_image JSON retry flow...")

    mock_img = Image.new('RGB', (10, 10))

    # We want to mock client.models.generate_content to return a bad JSON on both attempts
    mock_response = MagicMock()
    mock_response.text = "This is NOT valid JSON!"

    with patch('apps.calculator.utils.client.models.generate_content', return_value=mock_response) as mock_generate:
        try:
            analyze_image(mock_img, {})
            assert False, "Expected AIParsingError to be raised"
        except AIParsingError as e:
            print("Successfully caught AIParsingError!")
            assert e.raw_response == "This is NOT valid JSON!"
            # Assert generate_content was called exactly twice (1 original + 1 retry)
            assert mock_generate.call_count == 2, f"Expected 2 calls to generate_content, got {mock_generate.call_count}"
            print("Exactly 1 retry triggered successfully!")

    print("JSON retry flow test passed!")

if __name__ == "__main__":
    test_json_retry_flow()
    print("All retry tests completed successfully!")
