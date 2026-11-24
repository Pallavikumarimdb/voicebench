"""
Tests for Plan 1 Section 6 P4-T4: State-Gated Exact-Hash Response Cache.
Verifies:
  - Cache hit on identical repeat request (< 2 ms)
  - Cache miss on different dialogue state
  - Cache eviction after TTL
  - Cache bypass / invalidation on session state mutation
  - Audit trail surfacing: x_voiceai.cache == "hit" and reason_code == "CACHE_HIT"
"""

import os
import sys
import time
import pytest
from fastapi.testclient import TestClient

# Add service directory to path
service_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if sys.path[0] != service_root:
    sys.path.insert(0, service_root)

from app.main import app
from app.cache.response_cache import ExactResponseCache, response_cache


@pytest.fixture(autouse=True)
def clean_cache():
    response_cache.clear()
    yield
    response_cache.clear()


@pytest.fixture
def client():
    return TestClient(app)


def test_exact_cache_key_generation():
    cache = ExactResponseCache()
    key1 = cache.compute_key("tenant1", "persona1", "state_greet", "Hello, how are you?  ", "hist123")
    key2 = cache.compute_key("tenant1", "persona1", "state_greet", "hello,  how are you?", "hist123")
    assert key1 == key2, "Whitespace normalization and ASCII case folding should produce identical keys"

    key3 = cache.compute_key("tenant2", "persona1", "state_greet", "hello, how are you?", "hist123")
    assert key1 != key3, "Different tenant should produce different key"

    key4 = cache.compute_key("tenant1", "persona1", "state_negotiate", "hello, how are you?", "hist123")
    assert key1 != key4, "Different state should produce different key"


def test_exact_cache_ttl_eviction():
    cache = ExactResponseCache(default_ttl_seconds=0.05)
    key = "test_key_ttl"
    cache.set(key, {"text": "cached_val"}, "tenant1", "persona1", "state1", ttl_seconds=0.05)

    assert cache.get(key) is not None
    time.sleep(0.06)
    assert cache.get(key) is None, "Expired entry should be evicted"


def test_state_mutation_invalidation():
    cache = ExactResponseCache()
    key1 = cache.compute_key("tenant1", "persona1", "state_greet", "hello", "hist1")
    cache.set(key1, {"text": "reply1"}, "tenant1", "persona1", "state_greet")

    assert cache.get(key1) is not None

    # Session transitions from state_greet to state_verify
    cache.check_session_state("sess_100", "state_greet")
    mutated = cache.check_session_state("sess_100", "state_verify")
    assert mutated is True, "State change should be detected"
    assert cache.get(key1) is None, "Old state entries should be invalidated on mutation"


def test_api_cache_hit_on_identical_repeat(client):
    payload = {
        "model": "stub-model",
        "messages": [
            {"role": "system", "content": "You are a customer service assistant."},
            {"role": "user", "content": "What are your business hours?"}
        ],
        "stream": False
    }
    headers = {
        "x-voiceai-session-id": "s_cache_001",
        "x-voiceai-turn-id": "1",
        "x-voiceai-dialogue-state": "inquiry",
        "x-voiceai-tenant-id": "replus",
        "x-voiceai-persona-id": "collections"
    }

    # Turn 1: Cache Miss
    t0 = time.perf_counter()
    res1 = client.post("/v1/chat/completions", json=payload, headers=headers)
    t1_ms = (time.perf_counter() - t0) * 1000.0
    assert res1.status_code == 200
    data1 = res1.json()
    assert data1["x_voiceai"]["cache"] == "miss"

    # Turn 2: Exact repeat -> Cache Hit
    t0 = time.perf_counter()
    res2 = client.post("/v1/chat/completions", json=payload, headers=headers)
    t2_ms = (time.perf_counter() - t0) * 1000.0
    assert res2.status_code == 200
    data2 = res2.json()

    assert data2["x_voiceai"]["cache"] == "hit"
    assert data2["x_voiceai"]["reason_code"] == "CACHE_HIT"
    assert data2["x_voiceai"]["tier"] == "t0_cache"
    assert data2["choices"][0]["message"]["content"] == data1["choices"][0]["message"]["content"]


def test_api_cache_miss_on_different_state(client):
    payload = {
        "model": "stub-model",
        "messages": [
            {"role": "system", "content": "You are an assistant."},
            {"role": "user", "content": "Help me please."}
        ],
        "stream": False
    }
    headers1 = {
        "x-voiceai-session-id": "s_cache_002",
        "x-voiceai-turn-id": "1",
        "x-voiceai-dialogue-state": "state_A",
        "x-voiceai-tenant-id": "t1",
        "x-voiceai-persona-id": "p1"
    }
    res1 = client.post("/v1/chat/completions", json=payload, headers=headers1)
    assert res1.status_code == 200
    assert res1.json()["x_voiceai"]["cache"] == "miss"

    # Call with different dialogue state
    headers2 = dict(headers1)
    headers2["x-voiceai-dialogue-state"] = "state_B"
    res2 = client.post("/v1/chat/completions", json=payload, headers=headers2)
    assert res2.status_code == 200
    assert res2.json()["x_voiceai"]["cache"] == "miss"


def test_api_cache_bypass_on_state_mutation(client):
    session_id = "s_cache_mutation_003"
    payload = {
        "model": "stub-model",
        "messages": [{"role": "user", "content": "はい"}],
        "stream": False
    }

    # Step 1: In state_greet
    h1 = {
        "x-voiceai-session-id": session_id,
        "x-voiceai-turn-id": "1",
        "x-voiceai-dialogue-state": "state_greet"
    }
    res1 = client.post("/v1/chat/completions", json=payload, headers=h1)
    assert res1.json()["x_voiceai"]["cache"] == "miss"

    # Step 2: Repeat in state_greet -> Cache Hit
    res2 = client.post("/v1/chat/completions", json=payload, headers=h1)
    assert res2.json()["x_voiceai"]["cache"] == "hit"

    # Step 3: State mutates to state_negotiate -> Bypasses cache
    h2 = {
        "x-voiceai-session-id": session_id,
        "x-voiceai-turn-id": "2",
        "x-voiceai-dialogue-state": "state_negotiate"
    }
    res3 = client.post("/v1/chat/completions", json=payload, headers=h2)
    assert res3.json()["x_voiceai"]["cache"] == "miss"
