import os
import sys

# Ensure backend root is in python path
sys.path.insert(0, os.path.abspath(os.path.dirname(os.path.dirname(__file__))))

from unittest.mock import patch

import pytest
from PIL import Image

from apps.calculator.utils import (
    _validate_and_sanitize_verification,
    explain_result,
)


@pytest.fixture
def dummy_img():
    return Image.new("RGBA", (20, 20), (255, 255, 255, 255))


def test_agrees_true_returns_explanation_unchanged_and_no_correction():
    raw_explanation = {
        "thought_process": "Calculated 2 + 2 = 4 correctly.",
        "steps": [{"order": 1, "description": "Add 2 and 2", "expression": "2 + 2 = 4"}],
        "verification": {
            "agrees": True,
            "corrected_answers": None,
            "confidence": 99,
            "note": None,
        },
    }
    validated = _validate_and_sanitize_verification(
        raw_explanation, num_solutions=1, problem_type="math", provider="gemini"
    )

    assert validated["verification"]["agrees"] is True
    assert validated["verification"]["corrected_answers"] is None
    assert validated["verification"]["confidence"] == 99
    assert validated["verification"]["note"] is None
    assert validated["provider"] == "gemini"
    assert len(validated["steps"]) == 1


def test_agrees_false_with_matching_length_returns_correction_and_confidence():
    raw_explanation = {
        "thought_process": "Excludes x = 3 due to division by zero.",
        "steps": [
            {"order": 1, "description": "Factor numerator", "expression": "(x-3)(x+3)"},
            {"order": 2, "description": "Cancel factor and note x != 3", "expression": "x + 3 = 0"},
            {"order": 3, "description": "Conclude x = -3", "expression": "x = -3"},
        ],
        "verification": {
            "agrees": False,
            "corrected_answers": ["-3"],
            "confidence": 98,
            "note": "x = 3 makes the denominator zero and is excluded.",
        },
    }
    validated = _validate_and_sanitize_verification(
        raw_explanation, num_solutions=1, problem_type="math", provider="gemini"
    )

    assert validated["verification"]["agrees"] is False
    assert validated["verification"]["corrected_answers"] == ["-3"]
    assert validated["verification"]["confidence"] == 98
    assert validated["verification"]["note"] == "x = 3 makes the denominator zero and is excluded."
    assert len(validated["steps"]) == 3


def test_missing_or_malformed_verification_returns_explanation_with_no_correction():
    # Missing verification key
    raw_missing = {
        "thought_process": "Some math derivation.",
        "steps": [{"order": 1, "description": "step 1", "expression": "x = 1"}],
    }
    val_missing = _validate_and_sanitize_verification(
        raw_missing, num_solutions=1, problem_type="math", provider="gemini"
    )
    assert val_missing["verification"] is None

    # Malformed verification (not a dict or invalid agrees)
    raw_malformed = {
        "thought_process": "Some math derivation.",
        "steps": [{"order": 1, "description": "step 1", "expression": "x = 1"}],
        "verification": "invalid string instead of dict",
    }
    val_malformed = _validate_and_sanitize_verification(
        raw_malformed, num_solutions=1, problem_type="math", provider="gemini"
    )
    assert val_malformed["verification"] is None


def test_length_mismatch_in_corrected_answers_returns_no_correction():
    raw_mismatch = {
        "thought_process": "Found two solutions.",
        "steps": [{"order": 1, "description": "step", "expression": "x = 1"}],
        "verification": {
            "agrees": False,
            "corrected_answers": ["1", "2"],  # Expected 1 solution, but returned 2
            "confidence": 90,
            "note": "Two solutions.",
        },
    }
    validated = _validate_and_sanitize_verification(
        raw_mismatch, num_solutions=1, problem_type="math", provider="gemini"
    )
    assert validated["verification"] is None


def test_type_text_returns_steps_null_and_no_verification():
    raw_text = {
        "thought_process": "This drawing represents peace.",
        "steps": [{"order": 1, "description": "irrelevant step", "expression": None}],
        "verification": {
            "agrees": False,
            "corrected_answers": ["peace"],
            "confidence": 90,
            "note": "Corrected text",
        },
    }
    validated = _validate_and_sanitize_verification(
        raw_text, num_solutions=1, problem_type="text", provider="gemini"
    )
    assert validated["steps"] is None
    assert validated["verification"] is None


def test_explain_provider_selects_right_implementation_and_fallback(dummy_img):
    # Case 1: EXPLAIN_PROVIDER is gemini -> calls _explain_result_gemini
    with patch("apps.calculator.utils.EXPLAIN_PROVIDER", "gemini"), \
         patch("apps.calculator.utils._explain_result_gemini") as mock_gemini, \
         patch("apps.calculator.utils._explain_result_groq") as mock_groq:
        mock_gemini.return_value = {"thought_process": "gemini", "steps": None, "verification": None}
        res = explain_result(dummy_img, {}, "x = 1", "1")
        assert res["thought_process"] == "gemini"
        mock_gemini.assert_called_once()
        mock_groq.assert_not_called()

    # Case 2: EXPLAIN_PROVIDER is groq -> calls _explain_result_groq
    with patch("apps.calculator.utils.EXPLAIN_PROVIDER", "groq"), \
         patch("apps.calculator.utils._explain_result_gemini") as mock_gemini, \
         patch("apps.calculator.utils._explain_result_groq") as mock_groq:
        mock_groq.return_value = {"thought_process": "groq", "steps": None, "verification": None}
        res = explain_result(dummy_img, {}, "x = 1", "1")
        assert res["thought_process"] == "groq"
        mock_groq.assert_called_once()
        mock_gemini.assert_not_called()

    # Case 3: Gemini hits quota error (402 or resource_exhausted) -> falls back to Groq Vision
    with patch("apps.calculator.utils.EXPLAIN_PROVIDER", "gemini"), \
         patch("apps.calculator.utils.GROQ_API_KEY", "mock-groq-key"), \
         patch("apps.calculator.utils._explain_result_gemini", side_effect=Exception("402 Resource Exhausted quota limit reached")), \
         patch("apps.calculator.utils._explain_result_groq") as mock_groq:
        mock_groq.return_value = {"thought_process": "groq fallback", "steps": None, "verification": None}
        res = explain_result(dummy_img, {}, "x = 1", "1")
        assert res["thought_process"] == "groq fallback"
        mock_groq.assert_called_once()
