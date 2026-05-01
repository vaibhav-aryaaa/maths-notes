import json
import base64
from PIL import Image
from io import BytesIO
from groq import Groq
from constants import GROQ_API_KEY

client = Groq(api_key=GROQ_API_KEY)
MODEL = "llama-3.3-70b-versatile"

# In-memory session store: session_id -> list of messages
_sessions: dict[str, list] = {}


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

    # Get or init conversation history (excludes system message — we inject it fresh)
    history = _sessions.get(session_id, [])

    # Append the new user message
    history.append({"role": "user", "content": user_message})

    messages = [{"role": "system", "content": system_prompt}] + history

    response = client.chat.completions.create(
        model=MODEL,
        messages=messages,
        max_tokens=1024,
        temperature=0.7,
    )

    reply = response.choices[0].message.content
    history.append({"role": "assistant", "content": reply})

    # Save back
    _sessions[session_id] = history

    return reply
