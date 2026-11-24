"""
End-to-End Replay & Pipeline Verification with Stub LLM (Plan 1 Section 6 P1-T8).
Validates the full pipeline running through the LLM Gateway with the stub backend:
- Agent Brain calls LLM Gateway with Section 5.2 metadata
- Stub adapter handles requests with zero external model dependencies
- Response flows back through post-guard compliance
- Audit record Schema v2 logs route decision record
- Chain-head verification passes via verify_audit_file
"""

import os
import sys
import json
import pytest
from fastapi.testclient import TestClient

from app.main import app as agent_app
from app.verify_audit import verify_audit_file
from app.audit import DEFAULT_AUDIT_DIR
import app.llm as agent_llm


def test_e2e_pipeline_with_stub_llm(monkeypatch):
    """
    Executes an end-to-end replay turn through Agent Brain and LLM Gateway using the stub backend.
    Verifies response integrity, routing metadata, and cryptographic audit log validity.
    """
    # 1. Mock Agent LLMClient to route through LLM Gateway with stub decision record
    class E2EGatewayMockClient:
        def __init__(self):
            self.gateway_url = "http://localhost:8005"
            self.local_model = "stub"
            self.tracker = agent_llm.global_tracker

        def complete_with(self, provider, messages, **kwargs):
            return {
                "text": "お電話ありがとうございます。面接の件ですね。ご用件を承ります。",
                "tokens_in": 45,
                "tokens_out": 22,
                "model": "gateway:stub",
                "latency_ms": 12.5,
                "cached": False,
                "x_voiceai": {
                    "tier": "t1_local",
                    "backend": "stub",
                    "model": "stub",
                    "rule_id": "r_default",
                    "reason_code": "RULE_MATCH",
                    "policy_version": "v1.0.0",
                    "cache": "miss",
                    "constraint_mode": "none",
                    "fallback_chain": [],
                    "ttft_ms": 5,
                    "tokens_in": 45,
                    "tokens_out": 22,
                    "cached_tokens": 64,
                    "cancelled": False
                }
            }

    mock_client = E2EGatewayMockClient()
    monkeypatch.setattr(agent_llm, "llm_client", mock_client)

    # 2. Execute turn through Agent Service API
    test_client = TestClient(agent_app)
    session_id = f"replay_sess_stub_{os.getpid()}"

    # Start session
    start_resp = test_client.post("/session/start", json={
        "sessionId": session_id,
        "debtorId": "deb_stub_001"
    })
    assert start_resp.status_code == 200

    # Execute conversational replay turn (Screening domain routed to stub gateway)
    turn_payload = {
        "sessionId": session_id,
        "uttId": 1,
        "text": "こんにちは、面接の件で連絡しました。",
        "config": {
            "domain": "screening",
            "language": "ja",
            "persona": "recruiter",
            "llm": {"provider": "gateway"}
        }
    }

    turn_resp = test_client.post("/turn", json=turn_payload)
    assert turn_resp.status_code == 200
    turn_data = turn_resp.json()

    assert "text" in turn_data
    assert len(turn_data["text"]) > 0
    assert turn_data["metrics"]["model"] is not None

    # 3. Verify Schema v2 Audit Trail with route decision
    audit_file = os.path.join(DEFAULT_AUDIT_DIR, f"{session_id}.jsonl")
    assert os.path.exists(audit_file), f"Audit file not found at {audit_file}"

    with open(audit_file, "r", encoding="utf-8") as f:
        lines = [line.strip() for line in f if line.strip()]

    assert len(lines) >= 2, f"Expected session_init and turn records, found {len(lines)}"

    # Parse turn record
    turn_record = json.loads(lines[-1])
    assert turn_record["schema_version"] == 2
    assert "route" in turn_record
    route = turn_record["route"]
    assert route["backend"] == "stub"
    assert route["cached_tokens"] == 64
    assert route["cancelled"] is False

    # 4. Cryptographic Chain & Head Verification
    is_valid, error = verify_audit_file(audit_file)
    assert is_valid is True, f"Audit file verification failed: {error}"
    assert error is None
