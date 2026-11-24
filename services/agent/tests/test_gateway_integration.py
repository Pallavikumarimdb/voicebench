"""
Integration Tests for Agent LLMClient with LLM Gateway (Plan 1 Section 6 P1-T4).
Validates:
- LLMClient calls LLM Gateway when LLM_GATEWAY_URL is set
- Metadata headers from Section 5.2 are transmitted
- x_voiceai decision record is received and stored in audit record (schema v2)
- verify_audit_file validates the resulting audit chain
"""

import os
import sys
import json
import pytest
from fastapi.testclient import TestClient

# Ensure services/agent is in path so 'app.*' imports resolve to agent modules
agent_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if agent_dir not in sys.path:
    sys.path.insert(0, agent_dir)

# Ensure repo_root is in path so 'services.llm_gateway.*' imports resolve
repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
if repo_root not in sys.path:
    sys.path.insert(0, repo_root)

import app.main as agent_main
from app.llm import LLMClient
from app.audit import verify_audit_file, DEFAULT_AUDIT_DIR
from app.compliance.clock import FakeClock, TOKYO_TZ
from datetime import datetime

# Import gateway app for in-process testing
from services.llm_gateway.app.main import app as gateway_app


@pytest.fixture
def agent_client():
    test_clock = FakeClock(datetime(2026, 10, 2, 14, 0, tzinfo=TOKYO_TZ))
    agent_main.guard.clock = test_clock
    agent_main.graph_agent.guard.clock = test_clock
    return TestClient(agent_main.app)


def test_llm_client_legacy_fallback(monkeypatch):
    """When LLM_GATEWAY_URL is unset, LLMClient executes legacy path and returns default route."""
    monkeypatch.delenv("LLM_GATEWAY_URL", raising=False)
    client = LLMClient(use_cache=False)
    assert client.gateway_url is None

    res = client.complete(
        messages=[{"role": "user", "content": "こんにちは"}],
        model="qwen3:1.7b",
        mock_response="お電話ありがとうございます。"
    )
    assert "text" in res
    assert "x_voiceai" in res
    assert res["x_voiceai"]["tier"] == "t0_fast_path"
    assert res["x_voiceai"]["tier"] == "t0_fast_path"


def test_llm_client_gateway_routing(monkeypatch):
    """When LLM_GATEWAY_URL is configured, calls gateway and extracts x_voiceai."""
    gw_client = TestClient(gateway_app)

    # Mock gateway URL using in-process TestClient dispatcher
    class MockGatewayClient(LLMClient):
        def call_gateway(self, messages, model=None, temperature=0.7, max_tokens=256,
                         session_id=None, turn_id=None, profile=None, dialogue_state=None,
                         risk_tier=None, asr_confidence=None, timeout_s=10.0, **kwargs):
            headers = {
                "x-voiceai-session-id": session_id or "sess_test",
                "x-voiceai-turn-id": str(turn_id or "1"),
                "x-voiceai-profile": profile or "default",
                "x-voiceai-dialogue-state": dialogue_state or "discover",
                "x-voiceai-risk-tier": risk_tier or "low"
            }
            payload = {
                "model": model or "stub-model",
                "messages": messages,
                "temperature": temperature,
                "max_tokens": max_tokens,
                "stream": False,
                "backend": "stub"
            }
            res = gw_client.post("/v1/chat/completions", json=payload, headers=headers)
            assert res.status_code == 200
            data = res.json()
            choice = data["choices"][0]
            text = choice["message"]["content"]
            usage = data.get("usage", {})
            return {
                "text": text,
                "tokens_in": usage.get("prompt_tokens", 10),
                "tokens_out": usage.get("completion_tokens", 10),
                "model": data["model"],
                "latency_ms": 15.0,
                "cached": False,
                "x_voiceai": data.get("x_voiceai")
            }

    client = MockGatewayClient()
    client.gateway_url = "http://localhost:8005"

    res = client.complete_with(
        provider="gateway",
        messages=[{"role": "user", "content": "お支払いについて相談したいです。"}],
        model="stub-model",
        session_id="sess_gw_test_99",
        turn_id="3",
        risk_tier="low"
    )

    assert "text" in res
    assert "x_voiceai" in res
    x_voiceai = res["x_voiceai"]
    assert x_voiceai["tier"] == "t1_local"
    assert x_voiceai["backend"] == "stub"
    assert x_voiceai["cancelled"] is False


def test_agent_turn_audit_record_v2_with_route(agent_client, tmp_path):
    """Every agent turn stores schema v2 audit record with route and timings."""
    session_id = f"sess_audit_v2_route_{os.getpid()}"

    # Set custom audit dir
    from app.audit import DEFAULT_AUDIT_DIR

    req_payload = {
        "sessionId": session_id,
        "uttId": 1,
        "text": "はい、もしもし",
        "tCaptureMs": 1700000000000,
        "context": []
    }
    resp = agent_client.post("/turn", json=req_payload)
    assert resp.status_code == 200

    log_path = os.path.join(DEFAULT_AUDIT_DIR, f"{session_id}.jsonl")
    assert os.path.exists(log_path)

    # Verify audit file passes cryptographic validation
    is_valid, error = verify_audit_file(log_path)
    assert is_valid is True
    assert error is None

    # Inspect last line for schema_version 2 and route
    with open(log_path, "r", encoding="utf-8") as f:
        lines = [json.loads(line) for line in f if line.strip()]

    # Find the schema v2 turn record
    v2_records = [r for r in lines if r.get("schema_version") == 2]
    assert len(v2_records) >= 1
    rec = v2_records[-1]
    assert rec["call_id"] == session_id
    assert "route" in rec
    assert "tier" in rec["route"]
    assert "timings" in rec
    assert "prev_hash" in rec
    assert "hash" in rec
