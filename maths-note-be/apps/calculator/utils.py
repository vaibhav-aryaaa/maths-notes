import datetime
from google import genai
from google.genai import types
import ast
import json
from PIL import Image
from constants import GEMINI_API_KEY

import time
import httpx
from google.genai.errors import APIError, ServerError
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception

client = genai.Client(api_key=GEMINI_API_KEY)

def is_transient_gemini_error(exception):
    if isinstance(exception, ServerError):
        return True
    if isinstance(exception, APIError):
        if getattr(exception, "code", None) == 429:
            return True
    if isinstance(exception, (httpx.HTTPError, ConnectionError, TimeoutError)):
        return True
    return False

@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=1, max=8),
    retry=retry_if_exception(is_transient_gemini_error),
    reraise=True
)
def _generate_content_with_retry(prompt, img):
    start_time = time.time()
    try:
        res = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=[prompt, img],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
            ),
        )
        return res
    except Exception as e:
        latency = round((time.time() - start_time) * 1000)
        print(f"[Gemini API Retry] Call failed. Latency: {latency}ms. Error class: {e.__class__.__name__}. Error detail: {e}")
        raise e

class AIParsingError(Exception):
    def __init__(self, message, raw_response):
        super().__init__(message)
        self.raw_response = raw_response

def analyze_image(img: Image, dict_of_vars: dict, is_retry: bool = False):
    dict_of_vars_str = json.dumps(dict_of_vars, ensure_ascii=False)
    prompt = (
        f"You have been given an image with some mathematical expressions, equations, or graphical problems, and you need to solve them. "
        f"Note: Use the PEMDAS rule for solving mathematical expressions. PEMDAS stands for the Priority Order: Parentheses, Exponents, Multiplication and Division (from left to right), Addition and Subtraction (from left to right). Parentheses have the highest priority, followed by Exponents, then Multiplication and Division, and lastly Addition and Subtraction. "
        f"For example: "
        f"Q. 2 + 3 * 4 "
        f"(3 * 4) => 12, 2 + 12 = 14. "
        f"Q. 2 + 3 + 5 * 4 - 8 / 2 "
        f"5 * 4 => 20, 8 / 2 => 4, 2 + 3 => 5, 5 + 20 => 25, 25 - 4 => 21. "
        f"YOU CAN HAVE FIVE TYPES OF EQUATIONS/EXPRESSIONS IN THIS IMAGE, AND ONLY ONE CASE SHALL APPLY EVERY TIME: "
        f"CRITICAL: For EVERY dict you return, you MUST also include: "
        f"1. 'thought_process': A detailed, step-by-step explanation of how you solved the problem (string). "
        f"2. 'confidence_score': Your estimated confidence in the answer from 0 to 100 (number). "
        f"Following are the cases: "
        f"1. Simple mathematical expressions like 2 + 2, 3 * 4, 5 / 6, 7 - 8, etc.: In this case, solve and return the answer in the format of a LIST OF ONE DICT [{{'expr': given expression, 'result': calculated answer, 'type': 'math', 'thought_process': '...', 'confidence_score': 99}}]. "
        f"2. Set of Equations like x^2 + 2x + 1 = 0, 3y + 4x = 0, 5x^2 + 6y + 7 = 12, etc.: In this case, solve for the given variable, and the format should be a COMMA SEPARATED LIST OF DICTS, with dict 1 as {{'expr': 'x', 'result': 2, 'assign': True, 'type': 'math', 'thought_process': '...', 'confidence_score': 95}} and dict 2 as {{'expr': 'y', 'result': 5, 'assign': True, 'type': 'math', 'thought_process': '...', 'confidence_score': 95}}. Include as many dicts as there are variables. "
        f"3. Assigning values to variables like x = 4, y = 5, z = 6, etc.: In this case, assign values to variables and return another key in the dict called {{'assign': True}}, keeping the variable as 'expr' and the value as 'result' and include {{'type': 'math', 'thought_process': '...', 'confidence_score': 100}}. RETURN AS A LIST OF DICTS. "
        f"4. Analyzing Graphical Math problems, which are word problems represented in drawing form, such as cars colliding, trigonometric problems, problems on the Pythagorean theorem, adding runs from a cricket wagon wheel, etc. These will have a drawing representing some scenario and accompanying information with the image. PAY CLOSE ATTENTION TO DIFFERENT COLORS FOR THESE PROBLEMS. You need to return the answer in the format of a LIST OF ONE DICT [{{'expr': given expression, 'result': calculated answer, 'type': 'math', 'thought_process': '...', 'confidence_score': 90}}]. "
        f"5. Detecting Abstract Concepts that a drawing might show, such as love, hate, jealousy, patriotism, or a historic reference to war, invention, discovery, quote, etc. USE THE SAME FORMAT AS OTHERS TO RETURN THE ANSWER, where 'expr' will be the explanation of the drawing, and 'result' will be the abstract concept. IMPORTANT: Add {{'type': 'text'}} to your dictionary so the frontend knows to render it as normal wrapping text instead of a strict math equation! Also include 'thought_process' and 'confidence_score'. "
        f"Analyze the equation or expression in this image and return the answer according to the given rules: "
        f"Make sure to use extra backslashes for escape characters like \\f -> \\\\f, \\n -> \\\\n, etc. "
        f"Here is a dictionary of user-assigned variables. If the given expression has any of these variables, use its actual value from this dictionary accordingly: {dict_of_vars_str}. "
        f"DO NOT USE BACKTICKS OR MARKDOWN FORMATTING. "
        f"PROPERLY QUOTE THE KEYS AND VALUES IN THE JSON DOCUMENT FOR EASIER PARSING WITH Python's json.loads."
    )

    if is_retry:
        prompt += "\n\nIMPORTANT: Your last response was not valid JSON. Return ONLY valid JSON, no other text."

    response = _generate_content_with_retry(prompt, img)
    print(response.text)
    answers = []
    try:
        answers = json.loads(response.text)
    except Exception as e:
        print(f"Error in parsing response on attempt {'2' if is_retry else '1'}: {e}")
        if not is_retry:
            print("[AIParsingError] First attempt failed. Retrying with explicit JSON guidelines...")
            return analyze_image(img, dict_of_vars, is_retry=True)
        else:
            # Structurally log the failure context
            timestamp = datetime.datetime.utcnow().isoformat()
            print(f"\n=== AIParsingError Debug Context ===")
            print(f"Timestamp: {timestamp}")
            print(f"Prompt Version: v1.0 (PEMDAS-JSON-Rules)")
            print(f"Raw Response Text: {response.text}")
            print(f"====================================\n")
            raise AIParsingError("The AI provider returned a response that could not be parsed as JSON.", response.text)

    print('returned answer ', answers)
    for answer in answers:
        if 'assign' in answer:
            answer['assign'] = True
        else:
            answer['assign'] = False
    return answers