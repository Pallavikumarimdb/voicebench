"""
Adapter Registry and Factory.
Instantiates and manages adapters based on environment configuration.
"""

from typing import Dict, Optional
from .base import BaseAdapter
from .stub import StubAdapter
from .ollama import OllamaAdapter
from .openai_compatible import OpenAICompatibleAdapter
from ..config import config


class AdapterRegistry:
    def __init__(self):
        self._adapters: Dict[str, BaseAdapter] = {}
        self._init_defaults()

    def _init_defaults(self):
        # Default stub adapter (always available for testing, failure injection, CI)
        self.register("stub", StubAdapter(name="stub"))

        # Ollama local adapter
        self.register("ollama_local", OllamaAdapter(base_url=config.ollama_base_url))

        # OpenAI compatible adapter
        self.register(
            "openai_compatible",
            OpenAICompatibleAdapter(
                base_url=config.openai_base_url,
                api_key=config.openai_api_key
            )
        )

    def register(self, name: str, adapter: BaseAdapter):
        self._adapters[name] = adapter

    def get(self, name: str) -> BaseAdapter:
        if name in self._adapters:
            return self._adapters[name]
        # Fallback to stub if requested backend is not registered
        return self._adapters["stub"]

    def list_adapters(self) -> Dict[str, BaseAdapter]:
        return dict(self._adapters)


registry = AdapterRegistry()
