"""
OpenAI-Compatible Backend Adapter (Plan 1 Section 6 P1-T2).
Supports vLLM, llama.cpp server, SGLang, MLX, and hosted OpenAI-compatible APIs.
"""

import json
import time
import httpx
from typing import Dict, Any, List, Optional, AsyncGenerator
from .base import (
    BaseAdapter,
    AdapterCapabilities,
    AdapterRequest,
    AdapterResponse,
    AdapterChunk
)


class OpenAICompatibleAdapter(BaseAdapter):
    def __init__(
        self,
        base_url: str = "http://localhost:8000/v1",
        api_key: Optional[str] = None,
        name: str = "openai_compatible",
        timeout: float = 30.0
    ):
        capabilities = AdapterCapabilities(
            supports_json_schema=True,
            supports_grammar=True,
            reports_cached_tokens=True
        )
        super().__init__(name=name, capabilities=capabilities)
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.timeout = timeout

    def _headers(self) -> Dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        return headers

    async def health(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=2.0) as client:
                res = await client.get(f"{self.base_url}/models", headers=self._headers())
                return res.status_code == 200
        except Exception:
            return False

    def _build_payload(self, request: AdapterRequest, stream: bool) -> Dict[str, Any]:
        payload: Dict[str, Any] = {
            "model": request.model,
            "messages": request.messages,
            "stream": stream,
            "temperature": request.temperature,
            "max_tokens": request.max_tokens
        }
        if request.stop:
            payload["stop"] = request.stop
        if request.json_schema:
            payload["response_format"] = {
                "type": "json_schema",
                "json_schema": {"schema": request.json_schema, "strict": True}
            }
        return payload

    async def complete(self, request: AdapterRequest) -> AdapterResponse:
        t0 = time.monotonic()
        payload = self._build_payload(request, stream=False)

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            res = await client.post(
                f"{self.base_url}/chat/completions",
                json=payload,
                headers=self._headers()
            )
            if res.status_code != 200:
                raise RuntimeError(f"OpenAI-compatible error {res.status_code}: {res.text}")

            data = res.json()
            t_end = time.monotonic()
            choice = data["choices"][0]
            content = choice.get("message", {}).get("content", "")
            usage = data.get("usage", {})
            tokens_in = usage.get("prompt_tokens", len(str(request.messages)))
            tokens_out = usage.get("completion_tokens", len(content))
            cached_tokens = usage.get("prompt_tokens_details", {}).get("cached_tokens", 0)

            return AdapterResponse(
                content=content,
                model=request.model,
                tokens_in=tokens_in,
                tokens_out=tokens_out,
                cached_tokens=cached_tokens,
                ttft_ms=(t_end - t0) * 1000.0,
                total_ms=(t_end - t0) * 1000.0,
                finish_reason=choice.get("finish_reason", "stop")
            )

    async def stream(self, request: AdapterRequest) -> AsyncGenerator[AdapterChunk, None]:
        payload = self._build_payload(request, stream=True)

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            async with client.stream(
                "POST",
                f"{self.base_url}/chat/completions",
                json=payload,
                headers=self._headers()
            ) as response:
                if response.status_code != 200:
                    err_body = await response.aread()
                    raise RuntimeError(f"OpenAI-compatible stream error {response.status_code}: {err_body.decode()}")

                async for line in response.aiter_lines():
                    line = line.strip()
                    if not line:
                        continue
                    if line.startswith("data: "):
                        data_part = line[6:]
                        if data_part == "[DONE]":
                            break
                        try:
                            chunk_data = json.loads(data_part)
                        except json.JSONDecodeError:
                            continue

                        choice = chunk_data.get("choices", [{}])[0]
                        delta_text = choice.get("delta", {}).get("content", "")
                        finish_reason = choice.get("finish_reason")

                        usage = chunk_data.get("usage")
                        tokens_in = usage.get("prompt_tokens") if usage else None
                        tokens_out = usage.get("completion_tokens") if usage else None
                        cached_tokens = (
                            usage.get("prompt_tokens_details", {}).get("cached_tokens")
                            if usage
                            else None
                        )

                        if delta_text or finish_reason:
                            yield AdapterChunk(
                                delta_content=delta_text,
                                finish_reason=finish_reason,
                                tokens_in=tokens_in,
                                tokens_out=tokens_out,
                                cached_tokens=cached_tokens
                            )
