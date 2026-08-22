import os
import sys

# Configure environment variables before imports
os.environ["APP_SECRET"] = "test-secret"
os.environ["ENV"] = "dev"
os.environ["DATABASE_URL"] = "sqlite:///:memory:"

# Ensure backend root is in python path
sys.path.insert(0, os.path.abspath(os.path.dirname(os.path.dirname(__file__))))

from unittest.mock import patch

from fastapi.testclient import TestClient

from main import app

client = TestClient(app)

def test_root_endpoint():
    response = client.get("/")
    assert response.status_code == 200
    assert response.json() == {"message": "Server is running"}

@patch("apps.calculator.route.analyze_image")
def test_calculate_endpoint(mock_analyze):
    # Mock return value of analyze_image
    mock_analyze.return_value = [
        {
            "expr": "2 + 2",
            "result": "4",
            "type": "math",
            "thought_process": "Basic addition",
            "confidence_score": 100,
            "steps": None
        }
    ]

    import base64
    from io import BytesIO

    from PIL import Image
    img = Image.new("RGBA", (10, 10), (0, 0, 0, 0))
    buffered = BytesIO()
    img.save(buffered, format="PNG")
    fake_image_b64 = "data:image/png;base64," + base64.b64encode(buffered.getvalue()).decode()

    headers = {"X-App-Key": "test-secret"}
    response = client.post(
        "/calculate",
        json={"image": fake_image_b64, "dict_of_vars": {}},
        headers=headers
    )

    assert response.status_code == 200
    res_data = response.json()
    assert res_data["type"] == "success"
    assert res_data["data"][0]["result"] == "4"
    mock_analyze.assert_called_once()

@patch("apps.copilot.route.chat_with_copilot_stream")
def test_copilot_chat_endpoint(mock_chat_stream):
    # Mock generator returning streaming tokens
    def fake_generator():
        yield 'data: {"token": "Hello"}\n\n'
        yield 'data: {"token": " world!"}\n\n'

    mock_chat_stream.return_value = fake_generator()

    headers = {"X-App-Key": "test-secret"}
    response = client.post(
        "/copilot",
        json={
            "session_id": "00000000-0000-4000-a000-000000000000",
            "message": "Hello copilot",
            "canvas_image": "fake-b64-str",
            "dict_of_vars": {},
            "results": []
        },
        headers=headers
    )

    assert response.status_code == 200
    assert "text/event-stream" in response.headers["content-type"]


@patch("apps.calculator.utils.explain_result")
def test_explain_endpoint(mock_explain):
    mock_explain.return_value = {
        "thought_process": "Meme explanation text.",
        "steps": None
    }

    import base64
    from io import BytesIO

    from PIL import Image
    img = Image.new("RGBA", (10, 10), (0, 0, 0, 0))
    buffered = BytesIO()
    img.save(buffered, format="PNG")
    fake_image_b64 = "data:image/png;base64," + base64.b64encode(buffered.getvalue()).decode()

    headers = {"X-App-Key": "test-secret"}
    response = client.post(
        "/calculate/explain",
        json={
            "image": fake_image_b64,
            "dict_of_vars": {},
            "expr": "some expression",
            "result": "some result",
            "type": "text"
        },
        headers=headers
    )

    assert response.status_code == 200
    res_data = response.json()
    assert res_data["thought_process"] == "Meme explanation text."
    assert res_data["steps"] is None
    mock_explain.assert_called_once_with(
        mock_explain.call_args[0][0], # PIL Image object
        dict_of_vars={},
        expr="some expression",
        result="some result",
        type="text"
    )
