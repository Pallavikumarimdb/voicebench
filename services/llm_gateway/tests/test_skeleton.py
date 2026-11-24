"""
Tests for LLM Gateway Skeleton (Plan 1 P1-T1).
Validates healthz, readyz, metrics, models, and streaming/non-streaming chat completions.
"""

import sys
import os
import json
import pytest
from fastapi.testclient import TestClient

# Add service directory to path
service_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if sys.path[0] != service_root:
    sys.path.insert(0, service_root)

from app.main import app


@pytest.fixture
def client():
    return TestClient(app)


def test_healthz(client):
    res = client.get("/healthz")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ok"
    assert data["service"] == "voice-llm-gateway"


def test_readyz(client):
    res = client.get("/readyz")
    assert res.status_code == 200
    data = res.json()
    assert data["ready"] is True
    assert "default" in data["loaded_policies"]


def test_metrics(client):
    res = client.get("/metrics")
    assert res.status_code == 200
    content = res.text
    assert "voiceai_llm_requests_total" in content
    assert "voiceai_llm_ttft_seconds" in content


def test_list_models(client):
    res = client.get("/v1/models")
    assert res.status_code == 200
    data = res.json()
    assert data["object"] == "list"
    model_ids = [m["id"] for m in data["data"]]
    assert "stub-model" in model_ids
    assert "qwen3:1.7b" in model_ids


def test_chat_completion_non_stream(client):
    payload = {
        "model": "qwen3:1.7b",
        "messages": [
            {"role": "user", "content": "もしもし、山田です。"}
        ],
        "stream": False
    }
    headers = {
        "x-voiceai-session-id": "sess_test_123",
        "x-voiceai-turn-id": "turn_1",
        "x-voiceai-profile": "default",
        "x-voiceai-risk-tier": "low"
    }
    res = client.post("/v1/chat/completions", json=payload, headers=headers)
    assert res.status_code == 200
    data = res.json()

    # OpenAI format assertions
    assert data["object"] == "chat.completion"
    assert len(data["choices"]) == 1
    assert data["choices"][0]["message"]["role"] == "assistant"
    assert len(data["choices"][0]["message"]["content"]) > 0
    assert data["usage"]["total_tokens"] > 0

    # Section 5.2 x_voiceai decision record assertions
    assert "x_voiceai" in data
    decision = data["x_voiceai"]
    assert decision["tier"] == "t1_local"
    assert decision["model"] == "qwen3:1.7b"
    assert decision["reason_code"] in ("RULE_MATCH", "BACKEND_ERROR")
    assert "sha256:" in decision["policy_version"]
    assert decision["cancelled"] is False
    assert decision["ttft_ms"] >= 0

    # Trace header assertions
    assert "x-voiceai-trace-id" in res.headers
    assert "x-voiceai-latency-ms" in res.headers


def test_chat_completion_with_stub_backend(client):
    payload = {
        "model": "stub-model",
        "messages": [
            {"role": "user", "content": "こんにちは"}
        ],
        "stream": False,
        "backend": "stub"
    }
    res = client.post("/v1/chat/completions", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["x_voiceai"]["reason_code"] in ("RULE_MATCH", "DEFAULT")
    assert data["x_voiceai"]["backend"] == "stub"
    assert len(data["x_voiceai"]["fallback_chain"]) == 0


def test_chat_completion_streaming(client):
    payload = {
        "model": "qwen3:1.7b",
        "messages": [
            {"role": "user", "content": "こんにちは"}
        ],
        "stream": True
    }
    headers = {
        "x-voiceai-session-id": "sess_test_stream",
        "x-voiceai-turn-id": "turn_2",
        "x-voiceai-risk-tier": "high"
    }
    res = client.post("/v1/chat/completions", json=payload, headers=headers)
    assert res.status_code == 200
    assert "text/event-stream" in res.headers["content-type"]

    lines = res.text.strip().split("\n\n")
    assert len(lines) >= 3  # at least delta tokens + final chunk + [DONE]

    found_done = False
    found_decision = False
    tokens_received = []

    for chunk_str in lines:
        if not chunk_str.startswith("data: "):
            continue
        data_part = chunk_str[len("data: "):]
        if data_part == "[DONE]":
            found_done = True
            continue

        chunk_json = json.loads(data_part)
        assert chunk_json["object"] == "chat.completion.chunk"
        choice = chunk_json["choices"][0]
        if "content" in choice["delta"]:
            tokens_received.append(choice["delta"]["content"])
        if "x_voiceai" in chunk_json:
            found_decision = True
            decision = chunk_json["x_voiceai"]
            assert decision["tier"] == "t1_local"
            assert decision["constraint_mode"] in ("strict", "schema+mask")  # from risk_tier=high

    assert found_done is True
    assert found_decision is True
    assert len(tokens_received) > 0
