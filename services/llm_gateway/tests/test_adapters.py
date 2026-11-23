"""
Tests for LLM Gateway Backend Adapters (Plan 1 Section 6 P1-T2).
Validates capabilities, normal completions, streaming, and scriptable failure injection modes:
- timeout
- 5xx
- slow_ttft
- mid_stream_drop
"""

import sys
import os
import pytest
import asyncio
from fastapi.testclient import TestClient

service_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if sys.path[0] != service_root:
    sys.path.insert(0, service_root)

from app.main import app
from app.adapters import (
    registry,
    BaseAdapter,
    AdapterCapabilities,
    AdapterRequest,
    StubAdapter,
    OllamaAdapter,
    OpenAICompatibleAdapter,
    BackendError5xx,
    BackendTimeoutError,
    BackendStreamDropError
)


@pytest.fixture
def stub():
    adapter = StubAdapter(name="test_stub", ttft_ms=5.0, token_interval_ms=5.0)
    yield adapter
    adapter.reset()


@pytest.fixture
def client():
    return TestClient(app)


def test_adapter_capabilities():
    """Each adapter declares its capabilities per Section 6 P1-T2."""
    stub_adapter = StubAdapter()
    assert stub_adapter.capabilities.supports_json_schema is True
    assert stub_adapter.capabilities.supports_grammar is True
    assert stub_adapter.capabilities.reports_cached_tokens is True

    ollama_adapter = OllamaAdapter()
    assert ollama_adapter.capabilities.supports_json_schema is True
    assert ollama_adapter.capabilities.supports_grammar is False
    assert ollama_adapter.capabilities.reports_cached_tokens is False

    openai_adapter = OpenAICompatibleAdapter()
    assert openai_adapter.capabilities.supports_json_schema is True
    assert openai_adapter.capabilities.supports_grammar is True
    assert openai_adapter.capabilities.reports_cached_tokens is True


@pytest.mark.asyncio
async def test_stub_normal_complete(stub):
    """Normal non-streaming completion returns content and token metrics."""
    req = AdapterRequest(
        model="qwen3:1.7b",
        messages=[{"role": "user", "content": "こんにちは"}]
    )
    res = await stub.complete(req)
    assert len(res.content) > 0
    assert res.tokens_in == len("こんにちは")
    assert res.tokens_out == len(res.content)
    assert res.cached_tokens == 64
    assert res.finish_reason == "stop"


@pytest.mark.asyncio
async def test_stub_normal_stream(stub):
    """Normal streaming yields incremental chunks and finish chunk."""
    req = AdapterRequest(
        model="qwen3:1.7b",
        messages=[{"role": "user", "content": "こんにちは"}],
        stream=True
    )
    chunks = []
    async for chunk in stub.stream(req):
        chunks.append(chunk)

    assert len(chunks) >= 2
    delta_texts = [c.delta_content for c in chunks if c.delta_content]
    assert len(delta_texts) > 0
    assert chunks[-1].finish_reason == "stop"


@pytest.mark.asyncio
async def test_stub_scripted_response(stub):
    """Stub adapter can emit custom scripted response tokens."""
    custom_tokens = ["お客様、", "ご本人様確認が", "完了いたしました。"]
    stub.set_scripted_tokens(custom_tokens)

    req = AdapterRequest(
        model="qwen3:1.7b",
        messages=[{"role": "user", "content": "テスト"}]
    )
    res = await stub.complete(req)
    assert res.content == "".join(custom_tokens)


@pytest.mark.asyncio
async def test_stub_failure_mode_5xx(stub):
    """Failure mode 5xx raises BackendError5xx."""
    stub.set_error_mode("5xx")
    assert await stub.health() is False

    req = AdapterRequest(model="qwen3:1.7b", messages=[])
    with pytest.raises(BackendError5xx):
        await stub.complete(req)

    with pytest.raises(BackendError5xx):
        async for _ in stub.stream(req):
            pass


@pytest.mark.asyncio
async def test_stub_failure_mode_timeout(stub):
    """Failure mode timeout raises BackendTimeoutError."""
    stub.set_error_mode("timeout")

    req = AdapterRequest(model="qwen3:1.7b", messages=[])
    with pytest.raises(BackendTimeoutError):
        await stub.complete(req)

    with pytest.raises(BackendTimeoutError):
        async for _ in stub.stream(req):
            pass


@pytest.mark.asyncio
async def test_stub_failure_mode_slow_ttft(stub):
    """Failure mode slow_ttft enforces elevated initial latency."""
    stub.set_error_mode("slow_ttft")
    stub.slow_ttft_delay_ms = 50.0  # scale down for unit test speed

    req = AdapterRequest(model="qwen3:1.7b", messages=[])
    t0 = asyncio.get_event_loop().time()
    res = await stub.complete(req)
    t1 = asyncio.get_event_loop().time()

    assert (t1 - t0) >= 0.045
    assert res.ttft_ms >= 45.0


@pytest.mark.asyncio
async def test_stub_failure_mode_mid_stream_drop(stub):
    """Failure mode mid_stream_drop emits initial token then raises ConnectionResetError."""
    stub.set_error_mode("mid_stream_drop")

    req = AdapterRequest(model="qwen3:1.7b", messages=[], stream=True)
    chunks_received = []

    with pytest.raises(BackendStreamDropError):
        async for chunk in stub.stream(req):
            chunks_received.append(chunk)

    # Must have yielded at least the first token before dropping
    assert len(chunks_received) >= 1
    assert len(chunks_received[0].delta_content) > 0


def test_api_integration_stub_5xx_returns_502(client):
    """API endpoint translates backend 5xx to HTTP 502."""
    stub_adapter = registry.get("stub")
    stub_adapter.set_error_mode("5xx")
    try:
        res = client.post(
            "/v1/chat/completions",
            json={
                "model": "stub-model",
                "messages": [{"role": "user", "content": "hello"}],
                "stream": False
            }
        )
        assert res.status_code == 502
    finally:
        stub_adapter.reset()


def test_api_integration_stub_timeout_returns_504(client):
    """API endpoint translates backend timeout to HTTP 504."""
    stub_adapter = registry.get("stub")
    stub_adapter.set_error_mode("timeout")
    try:
        res = client.post(
            "/v1/chat/completions",
            json={
                "model": "stub-model",
                "messages": [{"role": "user", "content": "hello"}],
                "stream": False
            }
        )
        assert res.status_code == 504
    finally:
        stub_adapter.reset()


def test_ollama_payload_construction():
    """Ollama adapter constructs correct payload with format=json for schema."""
    adapter = OllamaAdapter(base_url="http://test-ollama:11434")
    req = AdapterRequest(
        model="qwen3:1.7b",
        messages=[{"role": "user", "content": "test"}],
        json_schema={"type": "object", "properties": {"confirmed": {"type": "boolean"}}}
    )
    payload = adapter._build_payload(req, stream=True)
    assert payload["model"] == "qwen3:1.7b"
    assert payload["format"] == "json"
    assert payload["stream"] is True


def test_openai_compatible_payload_and_headers():
    """OpenAI-compatible adapter constructs correct headers and response_format."""
    adapter = OpenAICompatibleAdapter(
        base_url="http://test-vllm:8000/v1",
        api_key="sk-test-secret-key"
    )
    headers = adapter._headers()
    assert headers["Authorization"] == "Bearer sk-test-secret-key"

    req = AdapterRequest(
        model="qwen2.5-7b",
        messages=[{"role": "user", "content": "test"}],
        json_schema={"type": "object"}
    )
    payload = adapter._build_payload(req, stream=False)
    assert "response_format" in payload
    assert payload["response_format"]["type"] == "json_schema"


def test_strip_thinking_tokens():
    """Plan 1 P1-T6: Reasoning tokens (<think>...</think>) are stripped for voice path."""
    from app.adapters.base import strip_thinking_tokens

    raw = "<think>Let me formulate a compliant payment plan.</think>承知いたしました。来週のご入金で承ります。"
    assert strip_thinking_tokens(raw) == "承知いたしました。来週のご入金で承ります。"

    multiline = "<think>\nThinking about customer request...\nEvaluating FDCPA.\n</think>\nHello, thank you for calling."
    assert strip_thinking_tokens(multiline) == "Hello, thank you for calling."

    unclosed = "<think>Stream was aborted while thinking... Thank you"
    assert strip_thinking_tokens(unclosed) == ""

    clean = "Good morning, how can I help you today?"
    assert strip_thinking_tokens(clean) == clean
