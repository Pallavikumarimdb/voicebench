"""
Unit and Tamper Tests for Audit Trail Schema v2 and Cryptographic Verification.
Covers Plan 1 P0-T6 requirements:
- Schema v1 and v2 records
- Ed25519 and HMAC-SHA256 chain-head signatures
- Tamper tests: modify payload, insert record, delete record, truncate file, wrong signing key
- Unverified browser tier records (client_generated: true)
- Policy change audit log chaining and tampering
"""

import os
import json
import pytest
import tempfile
import shutil
try:
    from app.audit import (
        AuditLogger,
        PolicyChangeLogger,
        verify_audit_file,
        verify_policy_log,
        generate_ed25519_keypair,
        compute_hash,
        AuditVerificationResult,
        HAS_CRYPTOGRAPHY
    )
except ImportError:
    from services.agent.app.audit import (
        AuditLogger,
        PolicyChangeLogger,
        verify_audit_file,
        verify_policy_log,
        generate_ed25519_keypair,
        compute_hash,
        AuditVerificationResult,
        HAS_CRYPTOGRAPHY
    )


@pytest.fixture
def temp_dir():
    d = tempfile.mkdtemp(prefix="voiceai_audit_test_")
    yield d
    shutil.rmtree(d, ignore_errors=True)


def test_schema_v1_backwards_compatible(temp_dir):
    """Schema v1 logs must continue to write and verify properly."""
    session_id = "test_v1_session"
    logger = AuditLogger(session_id=session_id, log_dir=temp_dir)
    logger.append("agent_utterance", {"text": "こんにちは", "phase": "greet"})
    logger.append("state_change", {"phase": "verify"})

    log_path = os.path.join(temp_dir, f"{session_id}.jsonl")
    assert os.path.exists(log_path)

    result = verify_audit_file(log_path)
    assert result.is_valid is True
    assert result.error is None
    assert result.record_count == 2
    assert 1 in result.schema_versions


def test_schema_v2_and_chain_head_ed25519(temp_dir):
    """Schema v2 logs with Ed25519 signed chain head must verify successfully."""
    if not HAS_CRYPTOGRAPHY:
        pytest.skip("cryptography package not installed; skipping Ed25519 test")
    priv_pem, pub_pem = generate_ed25519_keypair()
    priv_path = os.path.join(temp_dir, "priv.pem")
    pub_path = os.path.join(temp_dir, "pub.pem")
    with open(priv_path, "w", encoding="utf-8") as f:
        f.write(priv_pem)
    with open(pub_path, "w", encoding="utf-8") as f:
        f.write(pub_pem)

    session_id = "test_v2_ed25519"
    logger = AuditLogger(session_id=session_id, log_dir=temp_dir)
    logger.append_turn(
        turn_index=1,
        caller_text="もしもし",
        agent_attempted_text="お電話ありがとうございます。",
        agent_final_text="お電話ありがとうございます。",
        guard_events=[],
        route={"tier": "t0_fast_path"},
        timings={"vad_end_to_first_audio_ms": 120}
    )
    logger.append_turn(
        turn_index=2,
        caller_text="残高はいくらですか？",
        agent_attempted_text="48000円です。",
        agent_final_text="ご本人様確認のため生年月日をお知らせください。",
        guard_events=[{"rule_id": "DOB_BEFORE_DISCLOSURE", "stage": "post", "action": "rewrite"}],
        route={"tier": "t1_local", "model": "qwen3:1.7b"}
    )
    head = logger.seal_chain(signing_key_path=priv_path)
    assert head["alg"] == "ed25519"
    assert "signature" in head

    log_path = os.path.join(temp_dir, f"{session_id}.jsonl")
    result = verify_audit_file(log_path, verify_key=pub_path)
    assert result.is_valid is True
    assert result.head_verified is True
    assert result.record_count == 2
    assert 2 in result.schema_versions


def test_schema_v2_and_chain_head_hmac(temp_dir):
    """Schema v2 logs with dev HMAC-SHA256 signed chain head must verify successfully."""
    session_id = "test_v2_hmac"
    hmac_key = "test_secret_hmac_key_12345"
    logger = AuditLogger(session_id=session_id, log_dir=temp_dir)
    logger.append_turn(
        turn_index=1,
        caller_text="はい",
        agent_attempted_text="ご用件をお伺いします。",
        agent_final_text="ご用件をお伺いします。"
    )
    head = logger.seal_chain(hmac_key=hmac_key)
    assert head["alg"] == "hmac-sha256"

    log_path = os.path.join(temp_dir, f"{session_id}.jsonl")
    result = verify_audit_file(log_path, hmac_key=hmac_key)
    assert result.is_valid is True
    assert result.head_verified is True


def test_tamper_modify_payload(temp_dir):
    """Tamper Test 1: Modifying payload inside an existing record triggers hash mismatch."""
    session_id = "tamper_modify"
    logger = AuditLogger(session_id=session_id, log_dir=temp_dir)
    logger.append_turn(1, "こんにちは", "はい、ご用件は？", "はい、ご用件は？")
    logger.append_turn(2, "山田です", "山田様ですね。", "山田様ですね。")

    log_path = os.path.join(temp_dir, f"{session_id}.jsonl")
    with open(log_path, "r", encoding="utf-8") as f:
        lines = [json.loads(l) for l in f]

    # Tamper with caller_text in line 0
    lines[0]["caller_text"] = "悪意のある変更 (tampered)"

    with open(log_path, "w", encoding="utf-8") as f:
        for entry in lines:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")

    result = verify_audit_file(log_path)
    assert result.is_valid is False
    assert "Hash mismatch" in result.error


def test_tamper_insert_record(temp_dir):
    """Tamper Test 2: Inserting an unauthorized record in the middle breaks the hash chain."""
    session_id = "tamper_insert"
    logger = AuditLogger(session_id=session_id, log_dir=temp_dir)
    logger.append_turn(1, "A", "Reply A", "Reply A")
    logger.append_turn(2, "B", "Reply B", "Reply B")

    log_path = os.path.join(temp_dir, f"{session_id}.jsonl")
    with open(log_path, "r", encoding="utf-8") as f:
        lines = [json.loads(l) for l in f]

    # Insert forged record between turn 1 and turn 2
    forged = {
        "schema_version": 2,
        "call_id": session_id,
        "turn_index": 99,
        "ts": "2026-01-01T00:00:00Z",
        "caller_text": "forged",
        "agent_attempted_text": "forged",
        "agent_final_text": "forged",
        "prev_hash": lines[0]["hash"]
    }
    forged["hash"] = compute_hash(forged)
    lines.insert(1, forged)

    with open(log_path, "w", encoding="utf-8") as f:
        for entry in lines:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")

    result = verify_audit_file(log_path)
    assert result.is_valid is False
    assert "Broken chain" in result.error


def test_tamper_delete_record(temp_dir):
    """Tamper Test 3: Deleting a record from the chain breaks the cryptographic continuity."""
    session_id = "tamper_delete"
    logger = AuditLogger(session_id=session_id, log_dir=temp_dir)
    logger.append_turn(1, "Turn 1", "Resp 1", "Resp 1")
    logger.append_turn(2, "Turn 2", "Resp 2", "Resp 2")
    logger.append_turn(3, "Turn 3", "Resp 3", "Resp 3")

    log_path = os.path.join(temp_dir, f"{session_id}.jsonl")
    with open(log_path, "r", encoding="utf-8") as f:
        lines = [json.loads(l) for l in f]

    # Delete turn 2
    del lines[1]

    with open(log_path, "w", encoding="utf-8") as f:
        for entry in lines:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")

    result = verify_audit_file(log_path)
    assert result.is_valid is False
    assert "Broken chain" in result.error


def test_tamper_truncate_corrupted_json(temp_dir):
    """Tamper Test 4a: File truncated mid-line is flagged as corrupted JSON."""
    session_id = "tamper_trunc_json"
    logger = AuditLogger(session_id=session_id, log_dir=temp_dir)
    logger.append_turn(1, "Turn 1", "Resp 1", "Resp 1")
    logger.append_turn(2, "Turn 2", "Resp 2", "Resp 2")

    log_path = os.path.join(temp_dir, f"{session_id}.jsonl")
    with open(log_path, "r", encoding="utf-8") as f:
        content = f.read()

    # Truncate halfway through line 2
    truncated_content = content[:-15]
    with open(log_path, "w", encoding="utf-8") as f:
        f.write(truncated_content)

    result = verify_audit_file(log_path)
    assert result.is_valid is False
    assert "Corrupted JSON" in result.error


def test_tamper_truncate_head_mismatch(temp_dir):
    """Tamper Test 4b: Truncating a record before chain_head triggers head_hash mismatch."""
    session_id = "tamper_trunc_head"
    logger = AuditLogger(session_id=session_id, log_dir=temp_dir)
    logger.append_turn(1, "Turn 1", "Resp 1", "Resp 1")
    logger.append_turn(2, "Turn 2", "Resp 2", "Resp 2")
    logger.seal_chain(hmac_key="dev-key")

    log_path = os.path.join(temp_dir, f"{session_id}.jsonl")
    with open(log_path, "r", encoding="utf-8") as f:
        lines = [json.loads(l) for l in f]

    # Delete turn 2, but keep chain_head (line 2)
    del lines[1]

    with open(log_path, "w", encoding="utf-8") as f:
        for entry in lines:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")

    result = verify_audit_file(log_path, hmac_key="dev-key")
    assert result.is_valid is False
    assert "chain_head hash mismatch" in result.error


def test_tamper_wrong_signing_key(temp_dir):
    """Tamper Test 5: Verifying chain_head with wrong Ed25519 public key or wrong HMAC key fails."""
    if not HAS_CRYPTOGRAPHY:
        pytest.skip("cryptography package not installed; skipping Ed25519 test")
    priv1, pub1 = generate_ed25519_keypair()
    priv2, pub2 = generate_ed25519_keypair()

    priv1_path = os.path.join(temp_dir, "priv1.pem")
    pub2_path = os.path.join(temp_dir, "pub2.pem")
    with open(priv1_path, "w", encoding="utf-8") as f:
        f.write(priv1)
    with open(pub2_path, "w", encoding="utf-8") as f:
        f.write(pub2)

    session_id = "tamper_wrong_key"
    logger = AuditLogger(session_id=session_id, log_dir=temp_dir)
    logger.append_turn(1, "Turn 1", "Resp 1", "Resp 1")
    logger.seal_chain(signing_key_path=priv1_path)

    log_path = os.path.join(temp_dir, f"{session_id}.jsonl")
    # Verify using pub2 instead of pub1
    result = verify_audit_file(log_path, verify_key=pub2_path)
    assert result.is_valid is False
    assert "Invalid Ed25519 signature" in result.error

    # Test HMAC wrong key
    session_hmac = "tamper_hmac_wrong"
    l_hmac = AuditLogger(session_id=session_hmac, log_dir=temp_dir)
    l_hmac.append_turn(1, "Turn 1", "Resp 1", "Resp 1")
    l_hmac.seal_chain(hmac_key="correct_secret_key")

    log_hmac_path = os.path.join(temp_dir, f"{session_hmac}.jsonl")
    res_hmac = verify_audit_file(log_hmac_path, hmac_key="wrong_secret_key")
    assert res_hmac.is_valid is False
    assert "Invalid HMAC-SHA256 signature" in res_hmac.error


def test_client_generated_records_flagged_unverified(temp_dir):
    """Browser-tier records marked client_generated: true must be flagged as unverified."""
    session_id = "browser_client_unverified"
    logger = AuditLogger(session_id=session_id, log_dir=temp_dir)
    logger.append_turn(1, "こんにちは", "はい", "はい")
    logger.append_turn(2, "山田です", "山田様確認しました", "山田様確認しました", client_generated=True)

    log_path = os.path.join(temp_dir, f"{session_id}.jsonl")
    result = verify_audit_file(log_path, allow_client_unverified=True)
    assert result.is_valid is True
    assert result.client_unverified is True
    assert "unverified client-generated records" in result.error

    # Strict mode rejects unverified client records
    strict_result = verify_audit_file(log_path, allow_client_unverified=False)
    assert strict_result.is_valid is False
    assert strict_result.client_unverified is True


def test_policy_change_logger(temp_dir):
    """Policy change audit trail must chain correctly and detect tampering."""
    logger = PolicyChangeLogger(log_dir=temp_dir)
    rec1 = logger.log_change(
        who="admin@voiceai.internal",
        old_hash="GENESIS",
        new_hash="a1b2c3d4",
        diff_summary={"profile": "strict_debt_collection", "action": "created"}
    )
    rec2 = logger.log_change(
        who="compliance_officer",
        old_hash="a1b2c3d4",
        new_hash="e5f6g7h8",
        diff_summary={"max_installment_months": 12}
    )

    log_path = os.path.join(temp_dir, "policy_changes.jsonl")
    is_valid, err = verify_policy_log(log_path)
    assert is_valid is True
    assert err is None

    # Tamper with policy log
    with open(log_path, "r", encoding="utf-8") as f:
        lines = [json.loads(l) for l in f]
    lines[0]["who"] = "malicious_user"
    with open(log_path, "w", encoding="utf-8") as f:
        for entry in lines:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")

    tampered_valid, tampered_err = verify_policy_log(log_path)
    assert tampered_valid is False
    assert "Hash mismatch" in tampered_err
