import base64
import datetime
import io
import json
import logging
import time
from typing import Any

from google import genai
from google.genai import types
from google.genai.errors import APIError, ServerError
from groq import (
    APIConnectionError,
    APIStatusError,
    Groq,
    InternalServerError,
    RateLimitError,
)
import httpx
from PIL import Image
from tenacity import retry, retry_if_exception, stop_after_attempt, wait_exponential

from constants import (
    GEMINI_API_KEY,
    GEMINI_MODEL_EXPLAIN,
    GEMINI_MODEL_FAST,
    GROQ_API_KEY,
    GROQ_VISION_MODEL,
    SOLVER_PROVIDER,
)

logger = logging.getLogger(__name__)

# Initialize clients lazily / safely
gemini_client = genai.Client(api_key=GEMINI_API_KEY) if GEMINI_API_KEY else None
groq_client = Groq(api_key=GROQ_API_KEY) if GROQ_API_KEY else None


class AIParsingError(Exception):
    def __init__(self, message, raw_response):
        super().__init__(message)
        self.raw_response = raw_response


# =====================================================================
# Retry Predicates
# =====================================================================

def is_transient_gemini_error(exception):
    if isinstance(exception, ServerError):
        return True
    if isinstance(exception, APIError) and getattr(exception, "code", None) == 429:
        return True
    return bool(isinstance(exception, (httpx.HTTPError, ConnectionError, TimeoutError)))


def is_transient_groq_error(exception):
    if isinstance(exception, (RateLimitError, InternalServerError, APIConnectionError)):
        return True
    if isinstance(exception, APIStatusError) and getattr(exception, "status_code", 0) in (429, 500, 502, 503, 504):
        return True
    return bool(isinstance(exception, (httpx.HTTPError, ConnectionError, TimeoutError)))


# =====================================================================
# Low-level API Callers with Retry
# =====================================================================

@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=1, max=8),
    retry=retry_if_exception(is_transient_gemini_error),
    reraise=True,
)
def _generate_gemini_content(prompt: str, img: Image.Image, model: str):
    if not gemini_client:
        raise ValueError("GEMINI_API_KEY is not configured.")
    start_time = time.time()
    try:
        res = gemini_client.models.generate_content(
            model=model,
            contents=[prompt, img],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
            ),
        )
        return res
    except Exception as e:
        latency = round((time.time() - start_time) * 1000)
        logger.warning(
            "[Gemini API Retry] Call failed. Latency: %dms. Error class: %s. Error detail: %s",
            latency,
            e.__class__.__name__,
            e,
        )
        raise


def _pil_to_base64_url(img: Image.Image) -> str:
    """Converts a PIL Image to a base64 data URL with minimum dimension guarantee for vision models."""
    width, height = img.size
    min_dim = 64
    if width < min_dim or height < min_dim:
        scale = max(min_dim / max(width, 1), min_dim / max(height, 1))
        new_width = max(int(width * scale), min_dim)
        new_height = max(int(height * scale), min_dim)
        img = img.resize((new_width, new_height), Image.Resampling.LANCZOS)

    buf = io.BytesIO()
    img_format = img.format if img.format in ("PNG", "JPEG", "WEBP") else "PNG"
    img.save(buf, format=img_format)
    mime_type = f"image/{img_format.lower()}"
    b64_str = base64.b64encode(buf.getvalue()).decode("utf-8")
    return f"data:{mime_type};base64,{b64_str}"


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=1, max=8),
    retry=retry_if_exception(is_transient_groq_error),
    reraise=True,
)
def _generate_groq_vision_content(prompt: str, img: Image.Image, model: str = GROQ_VISION_MODEL, as_json_object: bool = False):
    if not groq_client:
        raise ValueError("GROQ_API_KEY is not configured.")
    start_time = time.time()
    try:
        image_url = _pil_to_base64_url(img)
        kwargs = {
            "model": model,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {"type": "image_url", "image_url": {"url": image_url}},
                    ],
                }
            ],
            "temperature": 0.1,
        }
        if as_json_object:
            kwargs["response_format"] = {"type": "json_object"}

        res = groq_client.chat.completions.create(**kwargs)
        return res.choices[0].message.content or ""
    except Exception as e:
        latency = round((time.time() - start_time) * 1000)
        logger.warning(
            "[Groq Vision Retry] Call failed. Latency: %dms. Error class: %s. Error detail: %s",
            latency,
            e.__class__.__name__,
            e,
        )
        raise


# =====================================================================
# Main Analysis & Explanation Functions (Dual Provider: Groq + Gemini)
# =====================================================================

def analyze_image(img: Image.Image, dict_of_vars: dict, is_retry: bool = False):
    provider = SOLVER_PROVIDER
    # If primary is groq or fallback is required, handle transparently
    if provider == "groq":
        try:
            return _analyze_image_groq(img, dict_of_vars, is_retry=is_retry)
        except Exception as e:
            logger.warning("Groq Vision failed, checking if Gemini is available for fallback: %s", e)
            if GEMINI_API_KEY:
                return _analyze_image_gemini(img, dict_of_vars, is_retry=is_retry)
            raise
    else:
        # Default or explicitly set to 'gemini'
        try:
            return _analyze_image_gemini(img, dict_of_vars, is_retry=is_retry)
        except Exception as e:
            # If Gemini fails with billing/credits (402) or quota, fall back to Groq Vision
            error_msg = str(e).lower()
            if ("402" in error_msg or "resource_exhausted" in error_msg or "quota" in error_msg) and GROQ_API_KEY:
                logger.warning("Gemini credit/quota error detected (%s). Falling back automatically to Groq Vision.", e)
                return _analyze_image_groq(img, dict_of_vars, is_retry=is_retry)
            raise


def explain_result(
    img: Image.Image, dict_of_vars: dict, expr: str, result: Any, type: str | None = None, is_retry: bool = False
):
    provider = SOLVER_PROVIDER
    if provider == "groq":
        try:
            return _explain_result_groq(img, dict_of_vars, expr, result, type=type, is_retry=is_retry)
        except Exception as e:
            logger.warning("Groq explanation failed, checking Gemini fallback: %s", e)
            if GEMINI_API_KEY:
                return _explain_result_gemini(img, dict_of_vars, expr, result, type=type, is_retry=is_retry)
            raise
    else:
        try:
            return _explain_result_gemini(img, dict_of_vars, expr, result, type=type, is_retry=is_retry)
        except Exception as e:
            error_msg = str(e).lower()
            if ("402" in error_msg or "resource_exhausted" in error_msg or "quota" in error_msg) and GROQ_API_KEY:
                logger.warning("Gemini credit/quota error in explanation. Falling back to Groq Vision.")
                return _explain_result_groq(img, dict_of_vars, expr, result, type=type, is_retry=is_retry)
            raise


# =====================================================================
# Groq Implementation
# =====================================================================

def _analyze_image_groq(img: Image.Image, dict_of_vars: dict, is_retry: bool = False):
    dict_of_vars_str = json.dumps(dict_of_vars, ensure_ascii=False)
    prompt = (
        f"You are a fast, high-accuracy mathematical OCR and solving engine. "
        f"Analyze the mathematical expression, equation, or drawing in the provided image.\n\n"
        f"User-assigned variables: {dict_of_vars_str}.\n"
        f"Rules:\n"
        f"1. Follow standard PEMDAS order of operations.\n"
        f"2. For equations (e.g. 4x = 16), solve for the variable.\n"
        f"3. Return a JSON list of objects. Each object MUST contain:\n"
        f"   - 'expr': the variable or expression solved (e.g. 'x' or '2+3')\n"
        f"   - 'result': the computed numeric or algebraic answer (e.g. 4 or 5)\n"
        f"   - 'type': 'math' (or 'text' for abstract drawings)\n"
        f"   - 'assign': true if a variable was solved or assigned, false otherwise\n"
        f"   - 'confidence_score': integer between 0 and 100\n\n"
        f"CRITICAL: Return ONLY the raw JSON array or an object with an 'answers' list. DO NOT use markdown or code fences."
    )
    if is_retry:
        prompt += "\n\nIMPORTANT: Your previous response was not valid JSON. Output strictly valid JSON."

    raw_response = _generate_groq_vision_content(prompt, img, model=GROQ_VISION_MODEL)
    logger.debug("Groq response text: %s", raw_response)

    # Clean markdown fences if any
    cleaned_text = raw_response.strip()
    if cleaned_text.startswith("```"):
        lines = cleaned_text.splitlines()
        if lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].startswith("```"):
            lines = lines[:-1]
        cleaned_text = "\n".join(lines).strip()

    answers = []
    try:
        parsed = json.loads(cleaned_text)
        if isinstance(parsed, list):
            answers = parsed
        elif isinstance(parsed, dict):
            # If wrapped in a dict like {"answers": [...] or "results": [...]}
            for key in ("answers", "results", "solutions", "data"):
                if key in parsed and isinstance(parsed[key], list):
                    answers = parsed[key]
                    break
            if not answers:
                # Single item returned as dict
                answers = [parsed]
    except Exception as e:
        logger.warning("Error parsing Groq vision response on attempt %s: %s", "2" if is_retry else "1", e)
        if not is_retry:
            return _analyze_image_groq(img, dict_of_vars, is_retry=True)
        raise AIParsingError("The AI provider returned a response that could not be parsed as JSON.", raw_response)

    for answer in answers:
        answer["assign"] = bool(answer.get("assign", False))
        answer["thought_process"] = None
        answer["steps"] = None
        if "confidence_score" not in answer:
            answer["confidence_score"] = 95
        if "type" not in answer:
            answer["type"] = "math"

    return answers


def _explain_result_groq(
    img: Image.Image, dict_of_vars: dict, expr: str, result: Any, type: str | None = None, is_retry: bool = False
):
    dict_of_vars_str = json.dumps(dict_of_vars, ensure_ascii=False)
    prompt = (
        f"You are given an image with mathematical expressions, equations, graphical problems, or abstract concepts, "
        f"along with user-defined variables: {dict_of_vars_str}.\n"
        f"The expression/content in the image has already been calculated/identified:\n"
        f"Expression: {expr}\n"
        f"Result: {result}\n\n"
        f"Your task is to generate the detailed explanation and step-by-step breakdown for this result.\n"
        f"You MUST return a JSON object with exactly two keys:\n"
        f"1. 'thought_process': A detailed explanation of the solution, reasoning, or visual elements (string).\n"
        f"2. 'steps': A list of dicts: {{'order': int, 'description': str, 'expression': Optional[str]}} where 'expression' holds any LaTeX/math for that specific step (or null if no equation applies).\n\n"
        f"CRITICAL: Output valid JSON object only. No markdown fences."
    )
    if type == "text":
        prompt += "\n\nThe problem classification is 'text'. Return 'steps' as null and rely on 'thought_process' alone."

    if is_retry:
        prompt += "\n\nIMPORTANT: Your last response was not valid JSON. Return ONLY valid JSON."

    raw_response = _generate_groq_vision_content(prompt, img, model=GROQ_VISION_MODEL, as_json_object=True)
    logger.debug("Groq explanation response text: %s", raw_response)

    cleaned_text = raw_response.strip()
    if cleaned_text.startswith("```"):
        lines = cleaned_text.splitlines()
        if lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].startswith("```"):
            lines = lines[:-1]
        cleaned_text = "\n".join(lines).strip()

    try:
        explanation = json.loads(cleaned_text)
    except Exception as e:
        logger.warning("Error parsing Groq explanation: %s", e)
        if not is_retry:
            return _explain_result_groq(img, dict_of_vars, expr, result, type=type, is_retry=True)
        raise AIParsingError("The AI provider returned a response that could not be parsed as JSON.", raw_response)

    if "thought_process" not in explanation:
        explanation["thought_process"] = f"The expression {expr} was calculated to be {result}."
    if "steps" not in explanation:
        explanation["steps"] = None

    return explanation


# =====================================================================
# Gemini Implementation (Existing Unchanged Logic)
# =====================================================================

def _analyze_image_gemini(img: Image.Image, dict_of_vars: dict, is_retry: bool = False):
    dict_of_vars_str = json.dumps(dict_of_vars, ensure_ascii=False)
    prompt = (
        f"You have been given an image with some mathematical expressions, equations, or graphical problems, and you need to solve them quickly. "
        f"Note: Use the PEMDAS rule for solving mathematical expressions. PEMDAS stands for the Priority Order: Parentheses, Exponents, Multiplication and Division (from left to right), Addition and Subtraction (from left to right). Parentheses have the highest priority, followed by Exponents, then Multiplication and Division, and lastly Addition and Subtraction. "
        f"For example: "
        f"Q. 2 + 3 * 4 "
        f"(3 * 4) => 12, 2 + 12 = 14. "
        f"Q. 2 + 3 + 5 * 4 - 8 / 2 "
        f"5 * 4 => 20, 8 / 2 => 4, 2 + 3 => 5, 5 + 20 => 25, 25 - 4 => 21. "
        f"YOU CAN HAVE FIVE TYPES OF EQUATIONS/EXPRESSIONS IN THIS IMAGE, AND ONLY ONE CASE SHALL APPLY EVERY TIME: "
        f"CRITICAL: For EVERY dict you return, you MUST also include: "
        f"1. 'confidence_score': Your estimated confidence in the answer from 0 to 100 (number). "
        f"DO NOT include 'thought_process' or 'steps' in this response. We only want a fast answer. "
        f"Following are the cases: "
        f"1. Simple mathematical expressions like 2 + 2, 3 * 4, 5 / 6, 7 - 8, etc.: In this case, solve and return the answer in the format of a LIST OF ONE DICT [{{'expr': given expression, 'result': calculated answer, 'type': 'math', 'confidence_score': 99}}]. "
        f"2. Set of Equations like x^2 + 2x + 1 = 0, 3y + 4x = 0, 5x^2 + 6y + 7 = 12, etc.: In this case, solve for the given variable, and the format should be a COMMA SEPARATED LIST OF DICTS, with dict 1 as {{'expr': 'x', 'result': 2, 'assign': True, 'type': 'math', 'confidence_score': 95}} and dict 2 as {{'expr': 'y', 'result': 5, 'assign': True, 'type': 'math', 'confidence_score': 95}}. Include as many dicts as there are variables. "
        f"3. Assigning values to variables like x = 4, y = 5, z = 6, etc.: In this case, assign values to variables and return another key in the dict called {{'assign': True}}, keeping the variable as 'expr' and the value as 'result' and include {{'type': 'math', 'confidence_score': 100}}. RETURN AS A LIST OF DICTS. "
        f"4. Analyzing Graphical Math problems, which are word problems represented in drawing form, such as cars colliding, trigonometric problems, problems on the Pythagorean theorem, adding runs from a cricket wagon wheel, etc. These will have a drawing representing some scenario and accompanying information with the image. PAY CLOSE ATTENTION TO DIFFERENT COLORS FOR THESE PROBLEMS. You need to return the answer in the format of a LIST OF ONE DICT [{{'expr': given expression, 'result': calculated answer, 'type': 'math', 'confidence_score': 90}}]. "
        f"5. Detecting Abstract Concepts that a drawing might show, such as love, hate, jealousy, patriotism, or a historic reference to war, invention, discovery, quote, etc. USE THE SAME FORMAT AS OTHERS TO RETURN THE ANSWER, where 'expr' will be the explanation of the drawing, and 'result' will be the abstract concept. IMPORTANT: Add {{'type': 'text'}} to your dictionary so the frontend knows to render it as normal wrapping text instead of a strict math equation! Also include 'confidence_score'. "
        f"Analyze the equation or expression in this image and return the answer according to the given rules: "
        f"Make sure to use extra backslashes for escape characters like \\f -> \\\\f, \\n -> \\\\n, etc. "
        f"Here is a dictionary of user-assigned variables. If the given expression has any of these variables, use its actual value from this dictionary accordingly: {dict_of_vars_str}. "
        f"DO NOT USE BACKTICKS OR MARKDOWN FORMATTING. "
        f"PROPERLY QUOTE THE KEYS AND VALUES IN THE JSON DOCUMENT FOR EASIER PARSING WITH Python's json.loads."
    )

    if is_retry:
        prompt += "\n\nIMPORTANT: Your last response was not valid JSON. Return ONLY valid JSON, no other text."

    response = _generate_gemini_content(prompt, img, model=GEMINI_MODEL_FAST)
    logger.debug("Gemini response text: %s", response.text)
    answers = []
    try:
        answers = json.loads(response.text)
    except Exception as e:
        logger.warning("Error in parsing response on attempt %s: %s", "2" if is_retry else "1", e)
        if not is_retry:
            logger.info("[AIParsingError] First attempt failed. Retrying with explicit JSON guidelines...")
            return _analyze_image_gemini(img, dict_of_vars, is_retry=True)
        else:
            timestamp = datetime.datetime.now(datetime.timezone.utc).isoformat()
            logger.error(
                "AIParsingError Debug Context - Timestamp: %s, Prompt: v1.0 (PEMDAS-JSON-Rules), Raw Response: %s",
                timestamp,
                response.text,
            )
            raise AIParsingError("The AI provider returned a response that could not be parsed as JSON.", response.text)

    logger.debug("returned answer: %s", answers)
    for answer in answers:
        if "assign" in answer:
            answer["assign"] = True
        else:
            answer["assign"] = False
        answer["thought_process"] = None
        answer["steps"] = None
    return answers


def _explain_result_gemini(
    img: Image.Image, dict_of_vars: dict, expr: str, result: Any, type: str | None = None, is_retry: bool = False
):
    dict_of_vars_str = json.dumps(dict_of_vars, ensure_ascii=False)
    prompt = (
        f"You are given an image with mathematical expressions, equations, graphical problems, or abstract concepts, "
        f"along with user-defined variables: {dict_of_vars_str}.\n"
        f"The expression/content in the image has already been calculated/identified:\n"
        f"Expression: {expr}\n"
        f"Result: {result}\n\n"
        f"Your task is to generate the detailed explanation and step-by-step breakdown for this result.\n"
        f"You MUST return a JSON object (not a list!) with exactly two keys:\n"
        f"1. 'thought_process': A detailed explanation of the solution, reasoning, or visual elements (string).\n"
        f"2. 'steps': ONLY populate this for problems that are mathematical, procedural, or have a genuine "
        f"multi-stage solution process (equations, word problems, geometry, calculations). For anything else — "
        f"general image description, abstract concept detection, single-fact answers — return 'steps' as null "
        f"and rely on 'thought_process' alone. Do not invent artificial steps for content that doesn't have a "
        f"real step-by-step solving process. If populated, it must be a list of dicts: {{'order': int, 'description': str, 'expression': Optional[str]}} where 'expression' holds any LaTeX/math for that specific step (or null if no equation applies).\n\n"
        f"DO NOT USE BACKTICKS OR MARKDOWN FORMATTING.\n"
        f"RETURN ONLY THE JSON OBJECT."
    )
    if type == "text":
        prompt += (
            "\n\nCRITICAL: The problem classification is 'text' (non-mathematical/abstract). "
            "Therefore, you MUST return 'steps' as null and rely on 'thought_process' alone."
        )

    if is_retry:
        prompt += "\n\nIMPORTANT: Your last response was not valid JSON. Return ONLY valid JSON, no other text."

    response = _generate_gemini_content(prompt, img, model=GEMINI_MODEL_EXPLAIN)
    logger.debug("Gemini explanation response text: %s", response.text)
    try:
        explanation = json.loads(response.text)
    except Exception as e:
        logger.warning("Error in parsing explanation response: %s", e)
        if not is_retry:
            return _explain_result_gemini(img, dict_of_vars, expr, result, type=type, is_retry=True)
        else:
            raise AIParsingError("The AI provider returned a response that could not be parsed as JSON.", response.text)

    # Ensure keys exist
    if "thought_process" not in explanation:
        explanation["thought_process"] = f"The expression {expr} was calculated to be {result}."
    if "steps" not in explanation:
        explanation["steps"] = None

    return explanation
