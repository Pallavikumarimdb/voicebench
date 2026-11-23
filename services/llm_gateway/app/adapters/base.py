"""
Base Adapter Interface and Capabilities Specification (Plan 1 Section 6 P1-T2).
All backend adapters implement this interface.
"""

import re
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Dict, Any, List, Optional, AsyncGenerator


def strip_thinking_tokens(text: str) -> str:
    """
    Plan 1 Section 6 P1-T6:
    Strips internal reasoning ('thinking') tokens (<think>...</think>) from output.
    Reasoning monologues inflate voice TTFT and must never leak into spoken audio.
    """
    cleaned = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL)
    if "<think>" in cleaned:
        cleaned = re.sub(r"<think>.*$", "", cleaned, flags=re.DOTALL)
    return cleaned.strip()


@dataclass
class AdapterCapabilities:
    supports_json_schema: bool = False
    supports_grammar: bool = False
    reports_cached_tokens: bool = False


@dataclass
class AdapterRequest:
    model: str
    messages: List[Dict[str, str]]
    temperature: float = 0.7
    max_tokens: int = 256
    stream: bool = False
    json_schema: Optional[Dict[str, Any]] = None
    stop: Optional[List[str]] = None
    extra_params: Dict[str, Any] = field(default_factory=dict)


@dataclass
class AdapterResponse:
    content: str
    model: str
    tokens_in: int
    tokens_out: int
    cached_tokens: int = 0
    ttft_ms: float = 0.0
    total_ms: float = 0.0
    finish_reason: str = "stop"


@dataclass
class AdapterChunk:
    delta_content: str
    finish_reason: Optional[str] = None
    tokens_in: Optional[int] = None
    tokens_out: Optional[int] = None
    cached_tokens: Optional[int] = None


class BaseAdapter(ABC):
    def __init__(self, name: str, capabilities: AdapterCapabilities):
        self.name = name
        self.capabilities = capabilities

    @abstractmethod
    async def complete(self, request: AdapterRequest) -> AdapterResponse:
        """Executes a non-streaming completion."""
        pass

    @abstractmethod
    async def stream(self, request: AdapterRequest) -> AsyncGenerator[AdapterChunk, None]:
        """Yields streaming chunks as tokens arrive."""
        pass

    @abstractmethod
    async def health(self) -> bool:
        """Probes the backend health."""
        pass
