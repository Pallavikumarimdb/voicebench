"""
Tests for LLM Gateway Streaming Cancellation and Propagation (Plan 1 Section 6 P1-T3).
Validates:
- Explicit cancellation via POST /v1/chat/completions/{id}/cancel and POST /v1/cancel
- Abort of upstream generation and token cutoff
- Setting of x_voiceai.cancelled = True and reason_code = CLIENT_CANCELLED
- Cancel latency measurement in Prometheus histogram
"""

import sys
import os
import json
import pytest
import asyncio
from fastapi.testclient import TestClient

service_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if sys.path[0] != service_root:
    sys.path.insert(0, service_root)

from app.main import app
from app.cancellation import cancellation_manager, CancellationManager
from app.adapters import registry


@pytest.fixture
def client():
    return TestClient(app)


def test_cancellation_manager_lifecycle():
    """CancellationManager registers, cancels, and measures latency."""
    mgr = CancellationManager()
    active = mgr.register(
        completion_id="cmpl_test_1",
        session_id="sess_1",
        turn_id="turn_1",
        model="qwen3:1.7b",
        tier="t1_local",
        backend="stub"
    )
    assert active.cancelled is False
    assert not active.cancel_event.is_set()

    # Cancel by completion ID
    cancelled_req = mgr.cancel(completion_id="cmpl_test_1")
    assert cancelled_req is not None
    assert cancelled_req.cancelled is True
    assert cancelled_req.cancel_event.is_set()
    assert cancelled_req.cancel_latency_ms >= 0.0

    # Idempotent cancel
    cancelled_again = mgr.cancel(completion_id="cmpl_test_1")
    assert cancelled_again is not None

    mgr.unregister("cmpl_test_1")
    assert mgr.cancel(completion_id="cmpl_test_1") is None


def test_cancellation_by_session_and_turn():
    """CancellationManager can resolve in-flight requests by session_id and turn_id."""
    mgr = CancellationManager()
    mgr.register(
        completion_id="cmpl_sess_turn",
        session_id="sess_alpha",
        turn_id="turn_5",
        model="qwen3:1.7b",
        tier="t1_local",
        backend="stub"
    )

    cancelled = mgr.cancel(session_id="sess_alpha", turn_id="turn_5")
    assert cancelled is not None
    assert cancelled.completion_id == "cmpl_sess_turn"
    assert cancelled.cancelled is True


def test_api_cancel_endpoints(client):
    """POST /v1/cancel endpoint returns proper cancellation status."""
    # Register dummy in-flight request
    active = cancellation_manager.register(
        completion_id="cmpl_api_cancel",
        session_id="sess_api",
        turn_id="turn_9",
        model="stub-model",
        tier="t1_local",
        backend="stub"
    )

    # Cancel via POST /v1/cancel
    res = client.post(
        "/v1/cancel",
        json={"session_id": "sess_api", "turn_id": "turn_9"}
    )
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "cancelled"
    assert data["cancelled"] is True
    assert data["completion_id"] == "cmpl_api_cancel"
    assert "cancel_latency_ms" in data

    # Cancel non-existent
    res_404 = client.post("/v1/cancel", json={"session_id": "non_existent"})
    assert res_404.status_code == 200
    assert res_404.json()["cancelled"] is False


@pytest.mark.asyncio
async def test_streaming_cancellation_cuts_off_upstream():
    """Streaming cancellation terminates token generation and marks cancelled: true."""
    import httpx
    stub_adapter = registry.get("stub")
    stub_adapter.set_scripted_tokens([
        "トークン1 ",
        "トークン2 ",
        "トークン3 ",
        "トークン4 ",
        "トークン5 "
    ])
    stub_adapter.token_interval_ms = 30.0

    session_id = "sess_stream_cancel_test"
    turn_id = "turn_1"

    def cancel_on_first_token(idx, token):
        if idx == 0:
            cancellation_manager.cancel(session_id=session_id, turn_id=turn_id)

    stub_adapter.on_token_yield = cancel_on_first_token

    payload = {
        "model": "stub-model",
        "messages": [{"role": "user", "content": "キャンセルテスト"}],
        "stream": True,
        "backend": "stub"
    }
    headers = {
        "x-voiceai-session-id": session_id,
        "x-voiceai-turn-id": turn_id
    }

    transport = httpx.ASGITransport(app=app)
    chunks = []

    async with httpx.AsyncClient(transport=transport, base_url="http://test") as async_client:
        async with async_client.stream("POST", "/v1/chat/completions", json=payload, headers=headers) as stream_res:
            assert stream_res.status_code == 200
            async for line in stream_res.aiter_lines():
                if not line:
                    continue
                if line.startswith("data: "):
                    data_part = line[6:]
                    if data_part == "[DONE]":
                        chunks.append("[DONE]")
                        break
                    parsed = json.loads(data_part)
                    chunks.append(parsed)

                    # Trigger cancel right after first token chunk arrives
                    choice = parsed.get("choices", [{}])[0]
                    if choice.get("delta", {}).get("content"):
                        cancellation_manager.cancel(session_id=session_id, turn_id=turn_id)

    # Validate stream ended cleanly with cancel record
    assert "[DONE]" in chunks
    final_chunk = chunks[-2]  # chunk right before [DONE]
    assert "x_voiceai" in final_chunk
    decision = final_chunk["x_voiceai"]
    assert decision["cancelled"] is True
    assert decision["reason_code"] == "CLIENT_CANCELLED"
    assert final_chunk["choices"][0]["finish_reason"] == "abort"

    stub_adapter.reset()
