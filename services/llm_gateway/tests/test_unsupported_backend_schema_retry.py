"""
Tests for Plan 1 Section 6 P3-T4:
Unsupported-backend path with schema validation, one corrective retry,
fallback per policy, and SCHEMA_RETRY counter accounting.
"""

import json
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.adapters import registry, BaseAdapter, AdapterCapabilities, AdapterRequest, AdapterResponse, AdapterChunk
from app.metrics import voiceai_schema_retry_total


@pytest.fixture
def client():
    return TestClient(app)


class FlakySchemaAdapter(BaseAdapter):
    """Simulates an unsupported or struggling backend that emits free-form text on attempt 1."""
    def __init__(self, succeed_on_retry: bool = True):
        capabilities = AdapterCapabilities(supports_json_schema=False, supports_grammar=False)
        super().__init__(name="flaky_backend", capabilities=capabilities)
        self.succeed_on_retry = succeed_on_retry
        self.call_count = 0
        self.received_prompts = []

    async def health(self) -> bool:
        return True

    async def stream(self, request: AdapterRequest):
        res = await self.complete(request)
        yield AdapterChunk(delta_content=res.content, finish_reason="stop")

    async def complete(self, request: AdapterRequest) -> AdapterResponse:
        self.call_count += 1
        self.received_prompts.append(request.messages)
        if self.call_count == 1:
            # Emit invalid free text on first attempt
            return AdapterResponse(
                content="申し訳ありません、確認いたしますので少々お待ちください。",
                model=request.model,
                tokens_in=50,
                tokens_out=20,
                ttft_ms=15.0,
                total_ms=25.0
            )
        # Attempt 2 (corrective retry)
        if self.succeed_on_retry:
            return AdapterResponse(
                content=json.dumps({
                    "intent": "greet",
                    "next_state": "verify_identity",
                    "utterance": "お電話ありがとうございます。本人確認をお願いします。"
                }, ensure_ascii=False),
                model=request.model,
                tokens_in=80,
                tokens_out=30,
                ttft_ms=18.0,
                total_ms=30.0
            )
        # Still invalid
        return AdapterResponse(
            content="まだJSONではありません。",
            model=request.model,
            tokens_in=80,
            tokens_out=15,
            ttft_ms=18.0,
            total_ms=30.0
        )


def test_unsupported_backend_corrective_retry_succeeds(client):
    """Tests that invalid JSON on attempt 1 triggers corrective retry which succeeds."""
    flaky = FlakySchemaAdapter(succeed_on_retry=True)
    registry.register("flaky_test_1", flaky)

    target_schema = {
        "type": "object",
        "properties": {
            "intent": {"type": "string"},
            "next_state": {"type": "string"},
            "utterance": {"type": "string"}
        },
        "required": ["intent", "next_state", "utterance"]
    }

    res = client.post(
        "/v1/chat/completions",
        json={
            "model": "qwen3:1.7b",
            "backend": "flaky_test_1",
            "messages": [{"role": "user", "content": "もしもし"}],
            "json_schema": target_schema,
            "stream": False
        }
    )
    assert res.status_code == 200
    data = res.json()
    assert flaky.call_count == 2
    # Check corrective prompt was delivered
    retry_msgs = flaky.received_prompts[1]
    assert any("not valid JSON conforming to the schema" in m.get("content", "") for m in retry_msgs)

    # Validate output is valid JSON
    content = data["choices"][0]["message"]["content"]
    parsed = json.loads(content)
    assert parsed["intent"] == "greet"
    assert parsed["next_state"] == "verify_identity"

    # Validate decision record
    x_voiceai = data["x_voiceai"]
    assert x_voiceai["reason_code"] == "SCHEMA_RETRY"


def test_unsupported_backend_retry_failure_falls_back_to_stub(client):
    """Tests that if corrective retry still fails, gateway falls back to stub per policy."""
    flaky = FlakySchemaAdapter(succeed_on_retry=False)
    registry.register("flaky_test_2", flaky)

    target_schema = {
        "type": "object",
        "properties": {
            "intent": {"type": "string"},
            "next_state": {"type": "string"},
            "utterance": {"type": "string"}
        },
        "required": ["intent", "next_state", "utterance"]
    }

    res = client.post(
        "/v1/chat/completions",
        json={
            "model": "qwen3:1.7b",
            "backend": "flaky_test_2",
            "messages": [{"role": "user", "content": "もしもし"}],
            "json_schema": target_schema,
            "stream": False
        }
    )
    assert res.status_code == 200
    data = res.json()
    assert flaky.call_count == 2

    # Result came from stub fallback
    x_voiceai = data["x_voiceai"]
    assert x_voiceai["backend"] == "stub"
    assert x_voiceai["reason_code"] == "SCHEMA_RETRY"
    assert any(fb["reason"] == "SCHEMA_RETRY" for fb in x_voiceai["fallback_chain"])

    content = data["choices"][0]["message"]["content"]
    parsed = json.loads(content)
    assert "intent" in parsed
    assert "utterance" in parsed
