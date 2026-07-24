import logging
import os
import sys
import time

# Add backend directory to sys.path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from apps.copilot.utils import (
    _get_or_create_session,
    _save_session,
    _sessions,
    _sweep_idle_sessions,
)

# Setup logging to verify eviction logs
logging.basicConfig(level=logging.INFO)

def test_lru_cap_and_eviction_logging():
    print("Testing session count cap (1000) and eviction logging...")
    _sessions.clear()

    # Create 1005 unique sessions
    for i in range(1005):
        session_id = f"f47ac10b-58cc-4372-a567-{i:012x}"
        _get_or_create_session(session_id)

    print(f"Total sessions in memory: {len(_sessions)}")
    assert len(_sessions) == 1000, f"Expected exactly 1000 sessions, got {len(_sessions)}"
    print("LRU cap and eviction logging test passed!")

def test_ttl_eviction():
    print("Testing idle TTL eviction (30 minutes)...")
    _sessions.clear()

    # Create two sessions
    sid1 = "f47ac10b-58cc-4372-a567-000000000001"
    sid2 = "f47ac10b-58cc-4372-a567-000000000002"

    _get_or_create_session(sid1)
    _get_or_create_session(sid2)

    # Manipulate sid1 to be last active 31 minutes ago
    _sessions[sid1]["last_active"] = time.time() - (31 * 60)

    # Run a sweep (triggered automatically on _get_or_create_session or manually)
    _sweep_idle_sessions()

    assert sid1 not in _sessions, f"Session {sid1} should have been evicted"
    assert sid2 in _sessions, f"Session {sid2} should still be active"
    print("Idle TTL eviction test passed!")

def test_message_cap_trimming():
    print("Testing message capping to 20 turns...")
    _sessions.clear()

    sid = "f47ac10b-58cc-4372-a567-000000000001"
    messages = _get_or_create_session(sid)

    # Add 50 messages to the session
    for i in range(50):
        messages.append({"role": "user", "content": f"msg {i}"})

    # Save session
    _save_session(sid, messages)

    saved_messages = _sessions[sid]["messages"]
    print(f"Saved messages count: {len(saved_messages)}")
    assert len(saved_messages) == 20, f"Expected exactly 20 messages, got {len(saved_messages)}"
    assert saved_messages[0]["content"] == "msg 30", f"Expected oldest messages to fall off, first message is {saved_messages[0]['content']}"
    assert saved_messages[-1]["content"] == "msg 49", f"Expected newest messages to be kept, last message is {saved_messages[-1]['content']}"
    print("Message capping and oldest turn trimming test passed!")

if __name__ == "__main__":
    test_lru_cap_and_eviction_logging()
    test_ttl_eviction()
    test_message_cap_trimming()
    print("All session validation and capacity tests completed successfully!")
