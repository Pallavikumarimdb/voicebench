"""
Tests for Plan 1 Section 6 P2-T4:
Tier 3 Safe-Mode Degradation on ALL_BACKENDS_FAILED.
Asserts that when all LLM backends fail, the agent produces deterministic
scripted responses per domain with a human-handoff offer, runs post-guards,
and logs t3_safe_mode in the schema v2 audit trail.
"""

import os
import json
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.safe_mode import get_safe_mode_response, SAFE_MODE_SCRIPTS
from app.audit import DEFAULT_AUDIT_DIR
from app.compliance.guard import ComplianceGuard


def test_safe_mode_scripts_coverage():
    """All 4 domains have valid non-empty Japanese and English scripts."""
    domains = ["collections", "screening", "kyc", "custom"]
    for d in domains:
        ja_text, reason = get_safe_mode_response(d, "ja")
        en_text, reason = get_safe_mode_response(d, "en")
        assert len(ja_text) > 10
        assert len(en_text) > 10
        assert reason == "ALL_BACKENDS_FAILED"


def test_safe_mode_scripts_pass_post_guards():
    """Deterministic safe-mode scripts must pass compliance guards without violation."""
    guard = ComplianceGuard()
    state = {"identity_verified": False, "debtor_name": "山田 太郎", "original_balance": 48000}

    for domain in ["collections", "screening", "kyc", "custom"]:
        for lang in ["ja", "en"]:
            text, _ = get_safe_mode_response(domain, lang)
            block = guard.check_post_llm(text, state)
            assert block is None, f"Safe mode script for {domain}-{lang} violated guard: {block}"


def test_agent_safe_mode_degradation_on_outage(monkeypatch):
    """
    Simulates total backend failure: Agent Brain must degrade to T3 safe mode,
    emit human handoff event, and record t3_safe_mode in audit log.
    """
    client = TestClient(app)
    session_id = f"sess_safe_mode_{os.getpid()}"

    # Start session
    start_res = client.post("/session/start", json={
        "sessionId": session_id,
        "debtorId": "deb_safe_01"
    })
    assert start_res.status_code == 200

    # Mock generalized agent to trigger safe mode
    import app.main as app_main

    class FailingGeneralizedAgent:
        def process_turn(self, *args, **kwargs):
            return {
                "text": "Fallback",
                "events": [],
                "metrics": {},
                "x_voiceai": {"tier": "t3_safe_mode", "reason_code": "ALL_BACKENDS_FAILED"}
            }

    monkeypatch.setattr(app_main, "generalized_agent", FailingGeneralizedAgent())

    turn_req = {
        "sessionId": session_id,
        "uttId": 1,
        "text": "こんにちは、スクリーニングの件です",
        "config": {
            "domain": "screening",
            "language": "ja"
        }
    }
    res = client.post("/turn", json=turn_req)
    assert res.status_code == 200
    data = res.json()

    # Assert reply matches screening safe mode script
    expected_ja, _ = get_safe_mode_response("screening", "ja")
    assert data["text"] == expected_ja

    # Assert human handoff escalation event was emitted
    event_types = [ev["type"] for ev in data["events"]]
    assert "escalate" in event_types
    escalate_ev = next(ev for ev in data["events"] if ev["type"] == "escalate")
    assert escalate_ev["payload"]["action"] == "human_handoff"

    # Assert audit log contains t3_safe_mode
    audit_file = os.path.join(DEFAULT_AUDIT_DIR, f"{session_id}.jsonl")
    assert os.path.exists(audit_file)

    with open(audit_file, "r", encoding="utf-8") as f:
        records = [json.loads(line) for line in f if line.strip()]

    v2_records = [r for r in records if r.get("schema_version") == 2]
    assert len(v2_records) >= 1
    last_turn = v2_records[-1]
    assert last_turn["route"]["tier"] == "t3_safe_mode"
    assert last_turn["route"]["reason_code"] == "ALL_BACKENDS_FAILED"
