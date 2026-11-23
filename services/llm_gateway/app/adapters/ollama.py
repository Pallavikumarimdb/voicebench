"""
Ollama Local Backend Adapter (Plan 1 Section 6 P1-T2).
Connects to local Ollama server over HTTP/REST (default http://localhost:11434).
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


class OllamaAdapter(BaseAdapter):
    def __init__(self, base_url: str = "http://localhost:11434", timeout: float = 30.0):
        capabilities = AdapterCapabilities(
            supports_json_schema=True,
            supports_grammar=False,
            reports_cached_tokens=False
        )
        super().__init__(name="ollama_local", capabilities=capabilities)
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    async def health(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=2.0) as client:
                res = await client.get(f"{self.base_url}/api/tags")
                return res.status_code == 200
        except Exception:
            return False

    def _build_payload(self, request: AdapterRequest, stream: bool) -> Dict[str, Any]:
        payload: Dict[str, Any] = {
            "model": request.model,
            "messages": request.messages,
            "stream": stream,
            "options": {
                "temperature": request.temperature,
                "num_predict": request.max_tokens
            }
        }
        if request.json_schema:
            payload["format"] = "json"
        if request.stop:
            payload["options"]["stop"] = request.stop
        return payload

    async def complete(self, request: AdapterRequest) -> AdapterResponse:
        t0 = time.monotonic()
        payload = self._build_payload(request, stream=False)

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            res = await client.post(f"{self.base_url}/api/chat", json=payload)
            if res.status_code != 200:
                raise RuntimeError(f"Ollama error {res.status_code}: {res.text}")

            data = res.json()
            t_end = time.monotonic()
            content = data.get("message", {}).get("content", "")
            tokens_in = data.get("prompt_eval_count", sum(len(m.get("content", "")) for m in request.messages))
            tokens_out = data.get("eval_count", len(content))

            return AdapterResponse(
                content=content,
                model=request.model,
                tokens_in=tokens_in,
                tokens_out=tokens_out,
                cached_tokens=0,
                ttft_ms=(t_end - t0) * 1000.0,
                total_ms=(t_end - t0) * 1000.0,
                finish_reason="stop"
            )

    async def stream(self, request: AdapterRequest) -> AsyncGenerator[AdapterChunk, None]:
        payload = self._build_payload(request, stream=True)

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            async with client.stream("POST", f"{self.base_url}/api/chat", json=payload) as response:
                if response.status_code != 200:
                    err_body = await response.aread()
                    raise RuntimeError(f"Ollama stream error {response.status_code}: {err_body.decode()}")

                async for line in response.aiter_lines():
                    if not line.strip():
                        continue
                    try:
                        chunk_data = json.loads(line)
                    except json.JSONDecodeError:
                        continue

                    done = chunk_data.get("done", False)
                    delta_text = chunk_data.get("message", {}).get("content", "")

                    if not done:
                        if delta_text:
                            yield AdapterChunk(delta_content=delta_text, finish_reason=None)
                    else:
                        tokens_in = chunk_data.get("prompt_eval_count")
                        tokens_out = chunk_data.get("eval_count")
                        yield AdapterChunk(
                            delta_content="",
                            finish_reason="stop",
                            tokens_in=tokens_in,
                            tokens_out=tokens_out,
                            cached_tokens=0
                        )
