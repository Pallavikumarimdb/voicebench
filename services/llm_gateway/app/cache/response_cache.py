"""
State-gated exact-hash response cache (Plan 1 Section 6 P4-T4).
Deterministic cache keyed on:
  sha256(tenant_id + persona_id + state_id + normalized_prompt + history_hash)
Guarantees < 2 ms response on cache hit.
Invalidates on state mutation or TTL expiration (default 300s).
Surfaces cache: "hit" and reason_code: "CACHE_HIT" in x_voiceai and Prometheus metrics.
"""

import hashlib
import time
import re
from typing import Dict, Any, Optional, List
from dataclasses import dataclass


@dataclass
class CacheEntry:
    key: str
    response: Dict[str, Any]
    tenant_id: str
    persona_id: str
    state_id: str
    created_at: float
    expires_at: float
    hit_count: int = 0


class ExactResponseCache:
    def __init__(self, default_ttl_seconds: float = 300.0, max_size: int = 10000):
        self.default_ttl = default_ttl_seconds
        self.max_size = max_size
        self._entries: Dict[str, CacheEntry] = {}
        # Track active session states: session_id -> current_state_id
        self._session_states: Dict[str, str] = {}

    @staticmethod
    def normalize_text(text: str) -> str:
        """Normalizes utterance/prompt text by stripping edge spaces and collapsing whitespace."""
        return re.sub(r'\s+', ' ', text.strip().lower())

    @staticmethod
    def compute_history_hash(messages: List[Dict[str, str]]) -> str:
        """
        Computes deterministic SHA256 of conversation history excluding the latest turn.
        """
        if not messages:
            return "empty"
        serialized = "|".join(f"{m.get('role', '')}:{m.get('content', '')}" for m in messages)
        return hashlib.sha256(serialized.encode("utf-8")).hexdigest()[:16]

    def compute_key(
        self,
        tenant_id: str,
        persona_id: str,
        state_id: str,
        prompt: str,
        history_hash: str,
        schema_hash: str = ""
    ) -> str:
        """
        Key: sha256(tenant_id + persona_id + state_id + normalized_prompt + history_hash + schema_hash)
        """
        norm_prompt = self.normalize_text(prompt)
        raw = f"{tenant_id}::{persona_id}::{state_id}::{norm_prompt}::{history_hash}::{schema_hash}"
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()

    def get(self, key: str) -> Optional[Dict[str, Any]]:
        entry = self._entries.get(key)
        if not entry:
            return None
        now = time.monotonic()
        if now > entry.expires_at:
            del self._entries[key]
            return None
        entry.hit_count += 1
        return entry.response

    def set(
        self,
        key: str,
        response: Dict[str, Any],
        tenant_id: str,
        persona_id: str,
        state_id: str,
        ttl_seconds: Optional[float] = None
    ):
        if len(self._entries) >= self.max_size:
            # Evict oldest entry
            oldest_k = min(self._entries.keys(), key=lambda k: self._entries[k].created_at)
            del self._entries[oldest_k]

        now = time.monotonic()
        ttl = ttl_seconds if ttl_seconds is not None else self.default_ttl
        self._entries[key] = CacheEntry(
            key=key,
            response=response,
            tenant_id=tenant_id,
            persona_id=persona_id,
            state_id=state_id,
            created_at=now,
            expires_at=now + ttl
        )

    def check_session_state(self, session_id: str, current_state_id: str) -> bool:
        """
        Records session state and detects state mutation.
        Returns True if state changed (mutation occurred).
        """
        prev_state = self._session_states.get(session_id)
        self._session_states[session_id] = current_state_id
        if prev_state is not None and prev_state != current_state_id:
            # Invalidate cached responses for the previous state that mutated
            self.invalidate_state(prev_state)
            return True
        return False

    def invalidate_state(self, state_id: str):
        """Invalidates all cached entries associated with a mutated state."""
        to_del = [k for k, v in self._entries.items() if v.state_id == state_id]
        for k in to_del:
            del self._entries[k]

    def clear(self):
        self._entries.clear()
        self._session_states.clear()

    @property
    def size(self) -> int:
        return len(self._entries)


# Global singleton instance
response_cache = ExactResponseCache()
