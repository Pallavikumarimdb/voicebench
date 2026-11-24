"""
Tests for LLM Gateway Optional Tier 2 (Large Tier) (Plan 1 Section 6 P2-T5).
Validates that T2 large tier is disabled by default, enabled only when env vars
are set, routes hard turns to T2 when enabled, and falls back to T1 when disabled.
"""

import sys
import os
import pytest
from fastapi.testclient import TestClient

service_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if sys.path[0] != service_root:
    sys.path.insert(0, service_root)

from app.main import app
from app.config import config
from app.router.engine import RoutingInput, evaluate_routing_rule
from app.adapters import registry, StubAdapter


@pytest.fixture
def client():
    return TestClient(app)


def test_t2_disabled_by_default(client):
    """When LLM_T2_ENABLED is false/unset, hard turns fall back to t1_local."""
    config.t2_enabled = False
    policy = config.get_policy("default")

    assert policy["tiers"]["t2_large"]["enabled"] is False

    # Hard turn (negotiation + tokens > 25)
    r_inp = RoutingInput(
        profile="default",
        dialogue_state="negotiation",
        utterance_tokens=30
    )
    dec = evaluate_routing_rule(policy, r_inp)

    # Must match r_hard_turn but fall back to t1_local because t2 is disabled
    assert dec.rule_id == "r_hard_turn"
    assert dec.tier == "t1_local"
    assert "t2_large" in dec.fallback_chain


def test_t2_enabled_via_config(client):
    """When LLM_T2_ENABLED is true, hard turns route directly to t2_large."""
    config.t2_enabled = True
    config.t2_model = "qwen2.5-72b-instruct"
    try:
        policy = config.get_policy("default")
        assert policy["tiers"]["t2_large"]["enabled"] is True
        assert policy["tiers"]["t2_large"]["model"] == "qwen2.5-72b-instruct"

        r_inp = RoutingInput(
            profile="default",
            dialogue_state="negotiation",
            utterance_tokens=40
        )
        dec = evaluate_routing_rule(policy, r_inp)

        assert dec.rule_id == "r_hard_turn"
        assert dec.tier == "t2_large"
        assert dec.backend == "remote_large"
        assert dec.model == "qwen2.5-72b-instruct"
        assert len(dec.fallback_chain) == 0
    finally:
        config.t2_enabled = False


def test_t2_api_integration(client, monkeypatch):
    """API chat completion routes to t2_large when enabled and configured."""
    config.t2_enabled = True
    try:
        # Register a stub adapter under remote_large for test execution
        stub_t2 = StubAdapter(name="remote_large", default_tokens=["合意", "形成", "プラン"])
        registry.register("remote_large", stub_t2)

        payload = {
            "model": "qwen2.5-72b-instruct",
            "messages": [{"role": "user", "content": "3回払いで分割支払いしたいのですが。"}],
            "stream": False
        }
        headers = {
            "x-voiceai-session-id": "sess_t2_test",
            "x-voiceai-turn-id": "5",
            "x-voiceai-dialogue-state": "negotiation",
            "x-voiceai-utterance-tokens": "35",
            "x-voiceai-risk-tier": "low"
        }

        res = client.post("/v1/chat/completions", json=payload, headers=headers)
        assert res.status_code == 200
        data = res.json()

        x_voiceai = data.get("x_voiceai", {})
        assert x_voiceai["tier"] == "t2_large"
        assert x_voiceai["backend"] == "remote_large"
        assert x_voiceai["rule_id"] == "r_hard_turn"
    finally:
        config.t2_enabled = False
