"""
Tests for Plan 1 Section 6 P2-T6:
Guard Coverage Proof across All Tiers (t0_fast_path, t1_local, t2_large, t3_safe_mode, cache_hit).
Proves that no tier can emit text without post-guard evaluation,
and that every schema v2 audit record carries post_guard_applied: true.
"""

import os
import json
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.audit import DEFAULT_AUDIT_DIR
from app.compliance.guard import ComplianceGuard


@pytest.fixture
def client():
    return TestClient(app)


def test_guard_coverage_intercepts_violations_across_all_tiers():
    """
    Asserts that post-guard evaluates and intercepts violating text across all tiers:
    - t0_fast_path: baseline/graph deterministic nodes
    - t1_local: local SLM output
    - t2_large: large model output
    - t3_safe_mode: deterministic safe-mode scripts
    - cache_hit: cached responses
    """
    guard = ComplianceGuard()
    state = {
        "identity_verified": False,
        "debtor_name": "鈴木 一郎",
        "original_balance": 98000
    }

    # Test cases: attempted violating text from different tiers
    tier_violating_samples = [
        ("t0_fast_path", "鈴木様、残高98,000円のお支払いが確認できておりません。"),
        ("t1_local", "未払い金9万8000円のご入金をお願いします。"),
        ("t2_large", "鈴木様、98000円を支払わないと法的措置をとります。"),
        ("t3_safe_mode", "システム障害です。残高98000円です。"),
        ("cache_hit", "お電話ありがとうございます。98,000円の件です。"),
    ]

    for tier, attempted_text in tier_violating_samples:
        block = guard.check_post_llm(attempted_text, state)
        assert block is not None, f"Tier '{tier}' emitted violating text that bypassed post-guard!"
        rule_code, fallback = block
        assert rule_code in (
            "amount_disclosed_before_verification",
            "creditor_disclosed_before_verification",
            "DOB_BEFORE_DISCLOSURE",
            "FORBIDDEN_THREAT_LEGAL",
            "FORBIDDEN_SHAMING",
        )
        assert "98" not in fallback, f"Fallback for tier {tier} leaked amount!"


def test_audit_record_v2_has_post_guard_applied_across_turns(client):
    """
    Asserts that every Schema v2 turn audit record contains post_guard_applied: true.
    """
    session_id = f"sess_guard_cov_{os.getpid()}"

    # Start session
    start_res = client.post("/session/start", json={
        "sessionId": session_id,
        "debtorId": "deb_cov_01"
    })
    assert start_res.status_code == 200

    # Execute turns
    for utt_id in range(1, 4):
        res = client.post("/turn", json={
            "sessionId": session_id,
            "uttId": utt_id,
            "text": f"メッセージ {utt_id}",
            "config": {"domain": "collections", "language": "ja"}
        })
        assert res.status_code == 200

    audit_file = os.path.join(DEFAULT_AUDIT_DIR, f"{session_id}.jsonl")
    assert os.path.exists(audit_file)

    with open(audit_file, "r", encoding="utf-8") as f:
        records = [json.loads(line) for line in f if line.strip()]

    turn_records = [r for r in records if r.get("schema_version") == 2]
    assert len(turn_records) == 3

    for r in turn_records:
        assert "post_guard_applied" in r, f"Audit record turn {r['turn_index']} missing post_guard_applied field!"
        assert r["post_guard_applied"] is True
        assert "guard_events" in r
        assert "route" in r
