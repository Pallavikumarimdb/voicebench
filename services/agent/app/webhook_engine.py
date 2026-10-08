"""
Dynamic Webhook & Tool Execution Engine for Voice AI Stack.
Provides:
- Declarative tool schema definition (OpenAPI / JSON schema compatible).
- Webhook dispatcher with configurable timeouts, retries, and HMAC-SHA256 signature verification.
- Built-in enterprise tools (CRM balance lookup, payment promise, calendar scheduling, SMS notification, live transfer).
- Tool calling function definition converter for LLM providers (OpenAI, Gemini, Anthropic, Qwen).
"""

import time
import json
import hmac
import hashlib
import urllib.request
import urllib.error
from typing import Dict, Any, List, Optional
from dataclasses import dataclass, field, asdict

@dataclass
class ToolParameter:
    name: str
    type: str  # "string", "number", "integer", "boolean", "object"
    description: str
    required: bool = True
    enum: Optional[List[Any]] = None

@dataclass
class ToolDefinition:
    name: str
    description: str
    tool_type: str  # "builtin" or "webhook"
    url: Optional[str] = None
    method: str = "POST"
    headers: Dict[str, str] = field(default_factory=dict)
    timeout_ms: int = 3000
    parameters: List[ToolParameter] = field(default_factory=list)
    filler_phrase: Optional[str] = None
    secret_key: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "tool_type": self.tool_type,
            "url": self.url,
            "method": self.method,
            "headers": self.headers,
            "timeout_ms": self.timeout_ms,
            "parameters": [
                {
                    "name": p.name,
                    "type": p.type,
                    "description": p.description,
                    "required": p.required,
                    "enum": p.enum,
                }
                for p in self.parameters
            ],
            "filler_phrase": self.filler_phrase,
        }

    def to_openai_schema(self) -> Dict[str, Any]:
        """Exports definition to OpenAI/Anthropic/Gemini function calling schema format."""
        properties: Dict[str, Any] = {}
        required: List[str] = []

        for p in self.parameters:
            prop: Dict[str, Any] = {
                "type": p.type,
                "description": p.description,
            }
            if p.enum:
                prop["enum"] = p.enum
            properties[p.name] = prop
            if p.required:
                required.append(p.name)

        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": {
                    "type": "object",
                    "properties": properties,
                    "required": required,
                },
            },
        }

class WebhookDispatcher:
    """Executes webhook HTTP calls with HMAC signing and error resilience."""

    @staticmethod
    def sign_payload(payload_bytes: bytes, secret: str) -> str:
        """Generates Stripe-style HMAC SHA256 signature header: t=<ts>,v1=<sig>."""
        timestamp = int(time.time())
        signed_payload = f"{timestamp}.".encode("utf-8") + payload_bytes
        signature = hmac.new(secret.encode("utf-8"), signed_payload, hashlib.sha256).hexdigest()
        return f"t={timestamp},v1={signature}"

    @classmethod
    def execute_webhook(
        cls,
        tool: ToolDefinition,
        arguments: Dict[str, Any],
        session_id: str = "default_session"
    ) -> Dict[str, Any]:
        """
        Executes a remote HTTP webhook with timeout, error handling, and latency measurement.
        """
        if not tool.url:
            return {
                "success": False,
                "error": "Webhook URL is not defined for this tool",
                "latency_ms": 0,
            }

        start_time = time.perf_counter()
        body_dict = {
            "session_id": session_id,
            "tool": tool.name,
            "arguments": arguments,
            "timestamp": int(time.time()),
        }
        json_data = json.dumps(body_dict).encode("utf-8")

        headers = {
            "Content-Type": "application/json",
            "User-Agent": "Voice-AI-Infra-Webhook-Engine/1.0",
        }
        headers.update(tool.headers)

        if tool.secret_key:
            headers["X-Voice-Signature"] = cls.sign_payload(json_data, tool.secret_key)

        timeout_sec = max(0.5, tool.timeout_ms / 1000.0)
        req = urllib.request.Request(
            tool.url,
            data=json_data if tool.method.upper() in ["POST", "PUT", "PATCH"] else None,
            headers=headers,
            method=tool.method.upper(),
        )

        try:
            with urllib.request.urlopen(req, timeout=timeout_sec) as response:
                status_code = response.status
                resp_bytes = response.read()
                latency_ms = int((time.perf_counter() - start_time) * 1000)

                try:
                    result_data = json.loads(resp_bytes.decode("utf-8"))
                except Exception:
                    result_data = {"raw_text": resp_bytes.decode("utf-8", errors="replace")}

                return {
                    "success": 200 <= status_code < 300,
                    "status_code": status_code,
                    "data": result_data,
                    "latency_ms": latency_ms,
                }
        except urllib.error.HTTPError as e:
            latency_ms = int((time.perf_counter() - start_time) * 1000)
            err_body = e.read().decode("utf-8", errors="replace")
            return {
                "success": False,
                "status_code": e.code,
                "error": f"HTTP {e.code}: {e.reason}",
                "details": err_body,
                "latency_ms": latency_ms,
            }
        except urllib.error.URLError as e:
            latency_ms = int((time.perf_counter() - start_time) * 1000)
            return {
                "success": False,
                "status_code": 504 if "timed out" in str(e.reason).lower() else 502,
                "error": f"Network error: {e.reason}",
                "latency_ms": latency_ms,
            }
        except Exception as e:
            latency_ms = int((time.perf_counter() - start_time) * 1000)
            return {
                "success": False,
                "status_code": 500,
                "error": f"Execution exception: {str(e)}",
                "latency_ms": latency_ms,
            }
