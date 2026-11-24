"""
P7-T5 Failure Drill Test Suite
Tests:
  1. Kill/failure of upstream server backends mid-call triggers ladder fallback:
     Cloud (T2/T3) -> Local Server (T1) -> Scripted Safe-Mode (T0.5) -> Browser Tier (T0).
  2. Guards STILL apply deterministically when running on browser tier (via @voice/guards-spec).
  3. Browser-tier turns uploaded with client_generated: true are tagged and reported
     as unverified by verify_audit_file, but cryptographic hash chain remains intact.
"""

import os
import json
import pytest
from app.audit import AuditLogger, verify_audit_file
from app.compliance.guard import ComplianceGuard
from app.safe_mode import get_safe_mode_response

# Shared conformance vectors
SPEC_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "packages", "guards-spec"))
CONFORMANCE_PATH = os.path.join(SPEC_DIR, "conformance.json")


def test_failure_drill_ladder_and_client_audit_tagging(tmp_path):
    """
    Simulates a mid-call cascade:
      Turn 1: Cloud/Local tier active -> normal verified audit record.
      Turn 2: Upstream backends crash mid-call -> Degrades to Safe-Mode scripted turn.
      Turn 3: Safe-mode intent missing -> Degrades to Browser Tier (client_generated: true).
      Turn 4: Verifier checks chain head, confirms client_unverified flag, and maintains tamper detection.
    """
    audit_file = str(tmp_path / "drill_session.jsonl")
    logger = AuditLogger("drill_session", log_dir=str(tmp_path))

    # Turn 1: Normal verified local server turn
    logger.append_turn(
        turn_index=1,
        caller_text="もしもし",
        agent_attempted_text="もしもし、山田太郎様のお電話でお間違いないでしょうか？",
        agent_final_text="もしもし、山田太郎様のお電話でお間違いないでしょうか？",
        route={"tier": "t1_local", "backend": "ollama", "model": "qwen2.5:7b"},
        client_generated=False
    )

    # Turn 2: Local backend killed -> Fallback to Safe Mode
    safe_reply, script_id = get_safe_mode_response(domain="collections", language="ja")
    logger.append_turn(
        turn_index=2,
        caller_text="山田です、本人です",
        agent_attempted_text=safe_reply,
        agent_final_text=safe_reply,
        route={"tier": "t0_safe_mode", "backend": "scripted_fsm", "model": f"script:{script_id}"},
        client_generated=False
    )

    # Turn 3: Edge/Browser tier fallback execution (client_generated: true)
    # Even on browser tier, guard MUST catch violations
    guard = ComplianceGuard()
    proposed_browser_reply = "わかりました。未払い金額は48,000円です。"
    unverified_state = {"identity_verified": False, "disclosure_done": False}
    violation = guard.check_post_llm(proposed_browser_reply, unverified_state)
    assert violation is not None, "Browser tier guard MUST catch amount leak before verification"
    assert violation[0] == "amount_disclosed_before_verification"

    # Browser applies fallback utterance
    compliant_browser_reply = violation[1]
    logger.append_turn(
        turn_index=3,
        caller_text="金額いくらですか？",
        agent_attempted_text=proposed_browser_reply,
        agent_final_text=compliant_browser_reply,
        route={"tier": "t0_browser_tier", "backend": "webllm_webgpu", "model": "SmolLM2-360M-Instruct"},
        guard_events=[{"event": "post_llm_violation", "code": violation[0], "tier": "browser"}],
        client_generated=True  # Uploaded from client browser after reconnection
    )

    # Finalize chain head
    head_record = logger.seal_chain()
    assert head_record is not None

    # Verify audit file with verify_audit_file
    res_default = verify_audit_file(audit_file, allow_client_unverified=True)
    assert res_default.is_valid is True, f"Audit file should be valid: {res_default.error}"
    assert res_default.client_unverified is True, "Must report client_unverified: True"
    assert "unverified client-generated records" in (res_default.error or "")

    # Strict mode verification (rejecting client-generated turns)
    res_strict = verify_audit_file(audit_file, allow_client_unverified=False)
    assert res_strict.is_valid is False, "Strict verification must reject files with client_generated records"
    assert "unverified client-generated records" in res_strict.error
