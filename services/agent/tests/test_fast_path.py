import os
import sys
import time
import pytest
from datetime import datetime
from fastapi.testclient import TestClient

agent_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if agent_dir not in sys.path:
    sys.path.insert(0, agent_dir)

import app.main as agent_main
from app.compliance.clock import FakeClock, TOKYO_TZ
from app.fast_path import match_fast_path, FastPathMatch

# Inject daytime clock (14:00 Tokyo) for deterministic test execution
test_clock = FakeClock(datetime(2026, 10, 2, 14, 0, tzinfo=TOKYO_TZ))
agent_main.guard.clock = test_clock
agent_main.graph_agent.guard.clock = test_clock
agent_main.baseline_agent.guard.clock = test_clock

client = TestClient(agent_main.app)


def test_fast_path_ja_patterns():
    state_greet = {"phase": "greet", "identity_verified": False, "messages": []}
    state_verified = {"phase": "negotiate", "identity_verified": True, "messages": []}

    # Greetings in greet phase
    m1 = match_fast_path("もしもし", state_greet, language="ja")
    assert m1 is not None
    assert m1.intent == "greet"
    assert m1.next_state == "verify_identity"
    assert "生年月日" in m1.text

    m2 = match_fast_path("こんにちは！", state_greet, language="ja")
    assert m2 is not None
    assert m2.intent == "greet"

    # Repeat / clarification
    m3 = match_fast_path("え？", state_greet, language="ja")
    assert m3 is not None
    assert m3.intent == "clarification"
    assert "生年月日" in m3.text

    m4 = match_fast_path("もう一度お願いします", state_verified, language="ja")
    assert m4 is not None
    assert m4.intent == "clarification"
    assert "もう一度ご案内いたします" in m4.text

    # Acknowledgment
    m5 = match_fast_path("わかりました", state_verified, language="ja")
    assert m5 is not None
    assert m5.intent == "confirm"
    assert "承知いたしました" in m5.text

    # Hangup
    m6 = match_fast_path("失礼します。", state_verified, language="ja")
    assert m6 is not None
    assert m6.intent == "close_call"
    assert m6.next_state == "close"
    assert any(e["type"] == "end_call" for e in m6.events)


def test_fast_path_en_patterns():
    state_greet = {"phase": "greet", "identity_verified": False, "messages": []}
    state_verified = {"phase": "negotiate", "identity_verified": True, "messages": []}

    # Greetings
    m1 = match_fast_path("Hello", state_greet, language="en")
    assert m1 is not None
    assert m1.intent == "greet"
    assert "date of birth" in m1.text

    # Repeat
    m2 = match_fast_path("Could you repeat that?", state_verified, language="en")
    assert m2 is not None
    assert m2.intent == "clarification"
    assert "repeat that" in m2.text

    # Ack
    m3 = match_fast_path("Understood", state_verified, language="en")
    assert m3 is not None
    assert m3.intent == "confirm"

    # Hangup
    m4 = match_fast_path("Goodbye!", state_verified, language="en")
    assert m4 is not None
    assert m4.intent == "close_call"
    assert m4.next_state == "close"


def test_fast_path_non_matches():
    state = {"phase": "negotiate", "identity_verified": True, "messages": []}
    # Substantive debt settlement / dispute / complex utterances should NOT match
    assert match_fast_path("来週月曜日に1万円振り込みます", state, language="ja") is None
    assert match_fast_path("今はお金がありません", state, language="ja") is None
    assert match_fast_path("契約内容を確認したいのですが", state, language="ja") is None
    assert match_fast_path("I can pay next week on Friday", state, language="en") is None


def test_fast_path_latency_budget():
    """Verify decision latency is well under the 5 ms SLA budget (guaranteed < 2 ms)."""
    state = {"phase": "greet", "identity_verified": False, "messages": []}
    latencies = []
    test_utterances = ["もしもし", "え？", "わかりました", "失礼します", "hello", "could you repeat that", "understood"]

    for _ in range(1000):
        for utt in test_utterances:
            t0 = time.perf_counter()
            match_fast_path(utt, state, language="ja" if "も" in utt or "わ" in utt or "失" in utt or "え" in utt else "en")
            latencies.append((time.perf_counter() - t0) * 1000.0)

    latencies.sort()
    p50 = latencies[int(len(latencies) * 0.50)]
    p95 = latencies[int(len(latencies) * 0.95)]
    p99 = latencies[int(len(latencies) * 0.99)]

    assert p95 < 2.0, f"p95 latency {p95:.3f} ms exceeds 2.0 ms threshold"
    assert p99 < 5.0, f"p99 latency {p99:.3f} ms exceeds 5.0 ms threshold"


def test_fast_path_api_turn_integration():
    """Verify /turn endpoint returns t0_fast_path tier with 0 tokens and post-guard executed."""
    session_id = "s_fast_path_test_01"
    start_resp = client.post("/session/start", json={"sessionId": session_id, "debtorId": "deb_fast_01"})
    assert start_resp.status_code == 200

    # Turn 1: Greeting triggers fast path
    req_payload = {
        "sessionId": session_id,
        "uttId": 1,
        "text": "もしもし",
        "tCaptureMs": 1700000000000,
        "context": []
    }
    resp = client.post("/turn", json=req_payload)
    assert resp.status_code == 200
    data = resp.json()

    assert data["x_voiceai"]["tier"] == "t0_fast_path"
    assert data["x_voiceai"]["reason_code"] == "RULE_MATCH"
    assert data["metrics"]["tokensIn"] == 0
    assert data["metrics"]["llmMs"] == 0.0
    assert "生年月日" in data["text"]
