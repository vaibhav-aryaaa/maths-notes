import json
import logging
import time
from collections import OrderedDict

import httpx
from groq import (
    APIConnectionError,
    APIStatusError,
    Groq,
    InternalServerError,
    RateLimitError,
)
from tenacity import retry, retry_if_exception, stop_after_attempt, wait_exponential

from constants import GROQ_API_KEY

logger = logging.getLogger(__name__)

client = Groq(api_key=GROQ_API_KEY)
MODEL = "llama-3.3-70b-versatile"

def is_transient_groq_error(exception):
    if isinstance(exception, RateLimitError):
        return True
    if isinstance(exception, InternalServerError):
        return True
    if isinstance(exception, (APIConnectionError, httpx.HTTPError, ConnectionError, TimeoutError)):
        return True
    if isinstance(exception, APIStatusError):
        status_code = getattr(exception, "status_code", None)
        if status_code == 429 or (status_code and status_code >= 500):
            return True
    return False

@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=1, max=8),
    retry=retry_if_exception(is_transient_groq_error),
    reraise=True
)
def _chat_completions_create_with_retry(messages):
    start_time = time.time()
    try:
        response = client.chat.completions.create(
            model=MODEL,
            messages=messages,
            max_tokens=1024,
            temperature=0.7,
        )
        return response
    except Exception as e:
        latency = round((time.time() - start_time) * 1000)
        logger.warning("[Groq API Retry] Call failed. Latency: %dms. Error class: %s. Error detail: %s", latency, e.__class__.__name__, e)
        raise



# In-memory session store with LRU eviction and TTL sweep
_sessions: OrderedDict[str, dict] = OrderedDict()

def _sweep_idle_sessions():
    now = time.time()
    ttl = 30 * 60  # 30 minutes in seconds
    to_delete = [
        sid for sid, session in _sessions.items()
        if now - session["last_active"] > ttl
    ]
    for sid in to_delete:
        _sessions.pop(sid, None)

def _get_or_create_session(session_id: str) -> list:
    _sweep_idle_sessions()

    now = time.time()
    if session_id in _sessions:
        _sessions.move_to_end(session_id)
        session = _sessions[session_id]
        session["last_active"] = now
        # Enforce maximum 20 messages
        if len(session["messages"]) > 20:
            session["messages"] = session["messages"][-20:]
        return session["messages"]

    if len(_sessions) >= 1000:
        evicted_key, _ = _sessions.popitem(last=False)
        logger.warning(f"Evicted oldest session due to capacity limit: {evicted_key}")

    messages = []
    _sessions[session_id] = {"messages": messages, "last_active": now}
    return messages

def _save_session(session_id: str, messages: list):
    if session_id in _sessions:
        # Enforce maximum 20 messages
        if len(messages) > 20:
            messages = messages[-20:]
        _sessions[session_id]["messages"] = messages
        _sessions[session_id]["last_active"] = time.time()
        _sessions.move_to_end(session_id)


def _build_system_prompt(dict_of_vars: dict, results: list) -> str:
    vars_str = json.dumps(dict_of_vars, ensure_ascii=False) if dict_of_vars else "{}"

    results_str = ""
    if results:
        lines = []
        for i, r in enumerate(results, 1):
            lines.append(
                f"{i}. Expression: {r.get('expression', r.get('expr', '?'))} = {r.get('answer', r.get('result', '?'))}\n"
                f"   Thought process: {r.get('thought_process', 'N/A')}"
            )
        results_str = "\n".join(lines)

    return (
        "You are the SolveIQ Math Co-Pilot — a friendly, expert math tutor embedded in a digital drawing canvas. "
        "The user draws math problems by hand and an AI solver reads and solves them. "
        "Your job is to answer follow-up questions about the math on the canvas.\n\n"
        f"Current Agent Memory (user-declared variables): {vars_str}\n\n"
        f"Problems solved on canvas so far:\n{results_str if results_str else 'None yet — ask the user to run the canvas first.'}\n\n"
        "Be concise, clear, and step-by-step. Use plain English with occasional math notation (e.g. x^2) for clarity. "
        "Do NOT use markdown code blocks. Keep answers short unless the user asks to elaborate."
    )


def chat_with_copilot(session_id: str, user_message: str, canvas_b64: str, dict_of_vars: dict, results: list) -> str:
    """
    Send a user message and get a Groq/Llama response.
    Sessions are maintained per session_id. Context (vars + results) is refreshed each turn via system prompt.
    """
    system_prompt = _build_system_prompt(dict_of_vars, results)

    # Get or init conversation messages history
    session_messages = _get_or_create_session(session_id)

    # Append the new user message
    session_messages.append({"role": "user", "content": user_message})

    # Enforce cap of 20 messages before sending to Groq
    if len(session_messages) > 20:
        session_messages = session_messages[-20:]

    messages = [{"role": "system", "content": system_prompt}] + session_messages

    response = _chat_completions_create_with_retry(messages)

    reply = response.choices[0].message.content
    session_messages.append({"role": "assistant", "content": reply})

    # Enforce cap of 20 messages before saving back
    if len(session_messages) > 20:
        session_messages = session_messages[-20:]

    # Save back
    _save_session(session_id, session_messages)

    return reply
