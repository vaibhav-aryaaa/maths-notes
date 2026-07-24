import sys
import os
import time

# Add backend directory to sys.path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from apps.copilot.utils import _sessions, _get_or_create_session, _sweep_idle_sessions

def test_lru_cap():
    print("Testing session count cap (1000)...")
    _sessions.clear()
    
    # Create 2000 unique sessions
    for i in range(2000):
        session_id = f"f47ac10b-58cc-4372-a567-{i:012x}"
        _get_or_create_session(session_id)
        
    print(f"Total sessions in memory: {len(_sessions)}")
    assert len(_sessions) == 1000, f"Expected exactly 1000 sessions, got {len(_sessions)}"
    print("LRU cap test passed!")

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

if __name__ == "__main__":
    test_lru_cap()
    test_ttl_eviction()
    print("All session validation tests completed successfully!")
