"""
LLM Gateway Adapters Package.
"""

from .base import (
    BaseAdapter,
    AdapterCapabilities,
    AdapterRequest,
    AdapterResponse,
    AdapterChunk
)
from .stub import (
    StubAdapter,
    BackendError5xx,
    BackendTimeoutError,
    BackendStreamDropError
)
from .ollama import OllamaAdapter
from .openai_compatible import OpenAICompatibleAdapter
from .registry import registry, AdapterRegistry

__all__ = [
    "BaseAdapter",
    "AdapterCapabilities",
    "AdapterRequest",
    "AdapterResponse",
    "AdapterChunk",
    "StubAdapter",
    "BackendError5xx",
    "BackendTimeoutError",
    "BackendStreamDropError",
    "OllamaAdapter",
    "OpenAICompatibleAdapter",
    "registry",
    "AdapterRegistry"
]
