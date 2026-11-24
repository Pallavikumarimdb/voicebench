"""
Scriptable Stub Adapter with Configurable Latency and Failure Injection Modes.
Supports: timeout, 5xx, slow_ttft, mid_stream_drop (Plan 1 Section 6 P1-T2).
"""

import time
import asyncio
from typing import List, Dict, Any, Optional, AsyncGenerator
from .base import (
    BaseAdapter,
    AdapterCapabilities,
    AdapterRequest,
    AdapterResponse,
    AdapterChunk
)


class BackendError5xx(RuntimeError):
    """Simulated 5xx internal server error from backend."""
    pass


class BackendTimeoutError(asyncio.TimeoutError):
    """Simulated backend timeout."""
    pass


class BackendStreamDropError(ConnectionResetError):
    """Simulated mid-stream socket drop."""
    pass


class StubAdapter(BaseAdapter):
    def __init__(
        self,
        name: str = "stub",
        default_tokens: Optional[List[str]] = None,
        ttft_ms: float = 15.0,
        token_interval_ms: float = 15.0
    ):
        capabilities = AdapterCapabilities(
            supports_json_schema=True,
            supports_grammar=True,
            reports_cached_tokens=True
        )
        super().__init__(name=name, capabilities=capabilities)
        self.default_tokens = default_tokens or ["お電話", "ありがとうございます。", "ご用件を", "承ります。"]
        self.scripted_tokens: Optional[List[str]] = None
        self.ttft_ms = ttft_ms
        self.token_interval_ms = token_interval_ms
        self.error_mode: str = "none"  # "none", "timeout", "5xx", "slow_ttft", "mid_stream_drop"
        self.slow_ttft_delay_ms: float = 1200.0
        self.cached_tokens: int = 64
        self.on_token_yield = None

    def set_error_mode(self, mode: str):
        valid_modes = {"none", "timeout", "5xx", "slow_ttft", "mid_stream_drop"}
        if mode not in valid_modes:
            raise ValueError(f"Unknown error mode '{mode}': must be one of {valid_modes}")
        self.error_mode = mode

    def set_scripted_tokens(self, tokens: List[str]):
        self.scripted_tokens = tokens

    def reset(self):
        self.error_mode = "none"
        self.scripted_tokens = None
        self.on_token_yield = None

    async def health(self) -> bool:
        return self.error_mode != "5xx"

    async def complete(self, request: AdapterRequest) -> AdapterResponse:
        t0 = time.monotonic()

        # Failure mode checks
        if self.error_mode == "5xx":
            raise BackendError5xx("Simulated 500 Internal Server Error from upstream backend")

        if self.error_mode == "timeout":
            await asyncio.sleep(0.05)
            raise BackendTimeoutError("Simulated backend read timeout")

        delay_ms = self.slow_ttft_delay_ms if self.error_mode == "slow_ttft" else self.ttft_ms
        await asyncio.sleep(delay_ms / 1000.0)

        if request.json_schema and not self.scripted_tokens:
            import json as _json
            tokens = [_json.dumps({
                "intent": "greet",
                "next_state": "verify_identity",
                "utterance": "お電話ありがとうございます。田中様でいらっしゃいますでしょうか。",
                "tool_calls": []
            }, ensure_ascii=False)]
        else:
            tokens = self.scripted_tokens or self.default_tokens
        full_text = "".join(tokens)
        t_end = time.monotonic()

        tokens_in = sum(len(m.get("content", "")) for m in request.messages)
        tokens_out = len(full_text)

        return AdapterResponse(
            content=full_text,
            model=request.model,
            tokens_in=tokens_in,
            tokens_out=tokens_out,
            cached_tokens=self.cached_tokens,
            ttft_ms=(t_end - t0) * 1000.0,
            total_ms=(t_end - t0) * 1000.0,
            finish_reason="stop"
        )

    async def stream(self, request: AdapterRequest) -> AsyncGenerator[AdapterChunk, None]:
        t0 = time.monotonic()

        if self.error_mode == "5xx":
            raise BackendError5xx("Simulated 500 Internal Server Error from upstream backend")

        if self.error_mode == "timeout":
            await asyncio.sleep(0.05)
            raise BackendTimeoutError("Simulated backend read timeout")

        initial_delay = self.slow_ttft_delay_ms if self.error_mode == "slow_ttft" else self.ttft_ms
        await asyncio.sleep(initial_delay / 1000.0)

        if request.json_schema and not self.scripted_tokens:
            import json as _json
            tokens = [_json.dumps({
                "intent": "greet",
                "next_state": "verify_identity",
                "utterance": "お電話ありがとうございます。田中様でいらっしゃいますでしょうか。",
                "tool_calls": []
            }, ensure_ascii=False)]
        else:
            tokens = self.scripted_tokens or self.default_tokens
        tokens_in = sum(len(m.get("content", "")) for m in request.messages)
        total_out = 0

        for idx, token in enumerate(tokens):
            if self.error_mode == "mid_stream_drop" and idx >= 1:
                raise BackendStreamDropError("Simulated socket disconnect mid-stream")

            total_out += len(token)
            yield AdapterChunk(
                delta_content=token,
                finish_reason=None,
                tokens_in=tokens_in if idx == 0 else None,
                tokens_out=total_out,
                cached_tokens=self.cached_tokens if idx == 0 else None
            )
            if self.on_token_yield:
                cb_res = self.on_token_yield(idx, token)
                if asyncio.iscoroutine(cb_res):
                    await cb_res
            await asyncio.sleep(self.token_interval_ms / 1000.0)

        # Final finish chunk
        yield AdapterChunk(
            delta_content="",
            finish_reason="stop",
            tokens_in=tokens_in,
            tokens_out=total_out,
            cached_tokens=self.cached_tokens
        )
