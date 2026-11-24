"""
Append-only JSONL Audit Trail with Cryptographic Hash Chain and Signature Verification.
Guarantees non-repudiation and tamper-evident logging for compliance audits.
Supports Schema v1 and Schema v2 records, Ed25519 / HMAC-SHA256 chain-head signatures,
and policy-change audit logs.
"""

import os
import re
import json
import time
import hmac
import hashlib
import datetime
from typing import Dict, Any, Optional, Tuple, List, Union

try:
    from cryptography.hazmat.primitives.asymmetric import ed25519
    from cryptography.hazmat.primitives import serialization
    HAS_CRYPTOGRAPHY = True
except ImportError:
    HAS_CRYPTOGRAPHY = False

DEFAULT_AUDIT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "audit_logs"))
DEFAULT_DEV_HMAC_KEY = "voiceai_dev_hmac_secret_key_2026"

# [C5] Safe session ID pattern: alphanumeric, hyphens, underscores only, max 128 chars
_SAFE_SESSION_ID_RE = re.compile(r'^[a-zA-Z0-9_\-]{1,128}$')


def _sanitize_session_id(session_id: str) -> str:
    """Raises ValueError if session_id is not safe for use as a filename."""
    if not _SAFE_SESSION_ID_RE.match(session_id):
        raise ValueError(
            f"Invalid session_id '{session_id}': must match ^[a-zA-Z0-9_\\-]{{1,128}}$"
        )
    return session_id


def compute_hash(data: Dict[str, Any]) -> str:
    """Computes SHA-256 over canonical JSON string (sorted keys, no extra spaces)."""
    canonical_str = json.dumps(data, sort_keys=True, ensure_ascii=False, separators=(',', ':'))
    return hashlib.sha256(canonical_str.encode("utf-8")).hexdigest()


def generate_ed25519_keypair() -> Tuple[str, str]:
    """Generates an Ed25519 private/public keypair in PEM format."""
    if not HAS_CRYPTOGRAPHY:
        raise RuntimeError("cryptography package is required for Ed25519 key generation")
    private_key = ed25519.Ed25519PrivateKey.generate()
    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption()
    ).decode("utf-8")
    public_pem = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo
    ).decode("utf-8")
    return private_pem, public_pem


def _canonical_bytes(data: Dict[str, Any]) -> bytes:
    """Returns canonical JSON bytes without whitespace for hashing / signing."""
    return json.dumps(data, sort_keys=True, ensure_ascii=False, separators=(',', ':')).encode("utf-8")


def sign_head_record_ed25519(head_data: Dict[str, Any], private_key_pem: str) -> str:
    """Signs chain_head record data using Ed25519 private key (PEM)."""
    if not HAS_CRYPTOGRAPHY:
        raise RuntimeError("cryptography package is required for Ed25519 signing")
    priv_key = serialization.load_pem_private_key(private_key_pem.encode("utf-8"), password=None)
    to_sign = {k: v for k, v in head_data.items() if k != "signature"}
    sig_bytes = priv_key.sign(_canonical_bytes(to_sign))
    return sig_bytes.hex()


def verify_head_record_ed25519(head_data: Dict[str, Any], public_key_pem: str) -> bool:
    """Verifies Ed25519 signature on chain_head record."""
    if not HAS_CRYPTOGRAPHY:
        return False
    signature_hex = head_data.get("signature", "")
    if not signature_hex:
        return False
    try:
        pub_key = serialization.load_pem_public_key(public_key_pem.encode("utf-8"))
        to_verify = {k: v for k, v in head_data.items() if k != "signature"}
        pub_key.verify(bytes.fromhex(signature_hex), _canonical_bytes(to_verify))
        return True
    except Exception:
        return False


def sign_head_record_hmac(head_data: Dict[str, Any], hmac_key: str) -> str:
    """Signs chain_head record data using HMAC-SHA256 (dev fallback)."""
    to_sign = {k: v for k, v in head_data.items() if k != "signature"}
    canonical = _canonical_bytes(to_sign)
    return hmac.new(hmac_key.encode("utf-8"), canonical, hashlib.sha256).hexdigest()


def verify_head_record_hmac(head_data: Dict[str, Any], hmac_key: str) -> bool:
    """Verifies HMAC-SHA256 signature on chain_head record."""
    signature_hex = head_data.get("signature", "")
    if not signature_hex:
        return False
    expected = sign_head_record_hmac(head_data, hmac_key)
    return hmac.compare_digest(signature_hex, expected)


class AuditVerificationResult(tuple):
    """
    Tuple subclass (is_valid, reason) with rich verification metadata for backwards compatibility.
    """
    def __new__(
        cls,
        is_valid: bool,
        error: Optional[str] = None,
        client_unverified: bool = False,
        head_verified: Optional[bool] = None,
        record_count: int = 0,
        schema_versions: Optional[List[int]] = None
    ):
        return super().__new__(cls, (is_valid, error))

    def __init__(
        self,
        is_valid: bool,
        error: Optional[str] = None,
        client_unverified: bool = False,
        head_verified: Optional[bool] = None,
        record_count: int = 0,
        schema_versions: Optional[List[int]] = None
    ):
        self._is_valid = is_valid
        self._error = error
        self._client_unverified = client_unverified
        self._head_verified = head_verified
        self._record_count = record_count
        self._schema_versions = schema_versions or []

    @property
    def is_valid(self) -> bool:
        return self._is_valid

    @property
    def error(self) -> Optional[str]:
        return self._error

    @property
    def client_unverified(self) -> bool:
        return self._client_unverified

    @property
    def head_verified(self) -> Optional[bool]:
        return self._head_verified

    @property
    def record_count(self) -> int:
        return self._record_count

    @property
    def schema_versions(self) -> List[int]:
        return self._schema_versions


class AuditLogger:
    """
    Append-only JSONL audit trail logger with cryptographic hash chain.
    Supports both Schema v1 (legacy stage/payload) and Schema v2 (turn-level metadata & timing).
    """
    def __init__(self, session_id: str, log_dir: Optional[str] = None, default_schema_version: int = 1):
        session_id = _sanitize_session_id(session_id)
        self.session_id = session_id
        self.log_dir = log_dir or DEFAULT_AUDIT_DIR
        os.makedirs(self.log_dir, exist_ok=True)
        self.log_path = os.path.join(self.log_dir, f"{session_id}.jsonl")
        self.entry_index = 0
        self.last_hash = "GENESIS"
        self.default_schema_version = default_schema_version
        self._init_existing_chain()

    def _init_existing_chain(self):
        """If resuming an existing log, read last entry to continue chain."""
        if os.path.exists(self.log_path):
            with open(self.log_path, "r", encoding="utf-8") as f:
                lines = [line.strip() for line in f if line.strip()]
                if lines:
                    last_entry = json.loads(lines[-1])
                    self.entry_index = len(lines)
                    # If last entry was chain_head, chain is sealed, use its head_hash or hash
                    self.last_hash = last_entry.get("hash") or last_entry.get("head_hash", "GENESIS")

    def append(self, stage: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        """
        Appends a Schema v1 hash-chained audit record to the JSONL log.
        Maintains backwards compatibility with all existing agent nodes and eval tests.
        """
        self.entry_index += 1
        record = {
            "seq": self.entry_index,
            "session_id": self.session_id,
            "ts": int(time.time() * 1000),
            "stage": stage,
            "payload": payload,
            "prev_hash": self.last_hash
        }
        current_hash = compute_hash(record)
        record["hash"] = current_hash
        self.last_hash = current_hash

        with open(self.log_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")

        return record

    def append_turn(
        self,
        turn_index: int,
        caller_text: str,
        agent_attempted_text: str,
        agent_final_text: str,
        guard_events: Optional[List[Dict[str, Any]]] = None,
        route: Optional[Dict[str, Any]] = None,
        timings: Optional[Dict[str, Any]] = None,
        post_guard_applied: bool = True,
        client_generated: bool = False,
        extra_fields: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Appends a Schema v2 hash-chained audit record per Plan 1 Section 5.3 & P2-T6.
        """
        self.entry_index += 1
        now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z")

        record: Dict[str, Any] = {
            "schema_version": 2,
            "call_id": self.session_id,
            "turn_index": turn_index,
            "ts": now_iso,
            "caller_text": caller_text,
            "agent_attempted_text": agent_attempted_text,
            "agent_final_text": agent_final_text,
            "guard_events": guard_events or [],
            "post_guard_applied": post_guard_applied,
            "route": route or {"tier": "t0_fast_path"},
            "timings": timings or {
                "vad_end_to_first_audio_ms": 0,
                "stages": {
                    "vad_hangover": 0, "asr": 0, "pre_guard": 0,
                    "llm_ttft": 0, "llm_total": 0, "post_guard": 0,
                    "tts_first_audio": 0, "transport": 0
                }
            },
            "prev_hash": self.last_hash
        }

        if client_generated:
            record["client_generated"] = True

        if extra_fields:
            for k, v in extra_fields.items():
                if k not in record:
                    record[k] = v

        current_hash = compute_hash(record)
        record["hash"] = current_hash
        self.last_hash = current_hash

        with open(self.log_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")

        return record

    def seal_chain(
        self,
        signing_key_path: Optional[str] = None,
        hmac_key: Optional[str] = None,
        key_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Appends a chain_head record sealing the call's audit chain with a cryptographic signature.
        Uses Ed25519 if key path is provided or AUDIT_SIGNING_KEY_PATH is set.
        Falls back to HMAC-SHA256 with AUDIT_HMAC_KEY (clearly labeled dev-only).
        """
        key_path = signing_key_path or os.getenv("AUDIT_SIGNING_KEY_PATH")
        env_hmac = hmac_key or os.getenv("AUDIT_HMAC_KEY")

        if key_path and os.path.exists(key_path) and HAS_CRYPTOGRAPHY:
            alg = "ed25519"
            resolved_key_id = key_id or os.getenv("AUDIT_KEY_ID", "key-ed25519-primary")
            with open(key_path, "r", encoding="utf-8") as kf:
                priv_pem = kf.read()
            head_data = {
                "type": "chain_head",
                "call_id": self.session_id,
                "head_hash": self.last_hash,
                "alg": alg,
                "key_id": resolved_key_id
            }
            sig = sign_head_record_ed25519(head_data, priv_pem)
            head_data["signature"] = sig
        else:
            alg = "hmac-sha256"
            resolved_key_id = key_id or "dev-hmac-key"
            resolved_hmac = env_hmac or DEFAULT_DEV_HMAC_KEY
            head_data = {
                "type": "chain_head",
                "call_id": self.session_id,
                "head_hash": self.last_hash,
                "alg": alg,
                "key_id": resolved_key_id
            }
            sig = sign_head_record_hmac(head_data, resolved_hmac)
            head_data["signature"] = sig

        with open(self.log_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(head_data, ensure_ascii=False) + "\n")

        return head_data


class PolicyChangeLogger:
    """
    Append-only hash-chained policy change log at <log_dir>/policy_changes.jsonl.
    Tracks who, when, old_hash, new_hash, and diff summary.
    """
    def __init__(self, log_dir: Optional[str] = None):
        self.log_dir = log_dir or DEFAULT_AUDIT_DIR
        os.makedirs(self.log_dir, exist_ok=True)
        self.log_path = os.path.join(self.log_dir, "policy_changes.jsonl")
        self.last_hash = "GENESIS"
        self._init_chain()

    def _init_chain(self):
        if os.path.exists(self.log_path):
            with open(self.log_path, "r", encoding="utf-8") as f:
                lines = [l.strip() for l in f if l.strip()]
                if lines:
                    last_record = json.loads(lines[-1])
                    self.last_hash = last_record.get("hash", "GENESIS")

    def log_change(
        self,
        who: str,
        old_hash: str,
        new_hash: str,
        diff_summary: Union[str, Dict[str, Any]]
    ) -> Dict[str, Any]:
        now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z")
        record = {
            "ts": now_iso,
            "who": who,
            "old_hash": old_hash,
            "new_hash": new_hash,
            "diff_summary": diff_summary,
            "prev_hash": self.last_hash
        }
        current_hash = compute_hash(record)
        record["hash"] = current_hash
        self.last_hash = current_hash

        with open(self.log_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")

        return record


def verify_policy_log(log_path: str) -> Tuple[bool, Optional[str]]:
    """Verifies the hash chain of a policy_changes.jsonl file."""
    if not os.path.exists(log_path):
        return False, f"File does not exist: {log_path}"

    with open(log_path, "r", encoding="utf-8") as f:
        lines = [l.strip() for l in f if l.strip()]

    if not lines:
        return True, None

    expected_prev = "GENESIS"
    for idx, line in enumerate(lines, start=1):
        try:
            entry = json.loads(line)
        except json.JSONDecodeError as ex:
            return False, f"Corrupted JSON on line {idx}: {ex}"

        stored_hash = entry.get("hash")
        entry_prev = entry.get("prev_hash")
        if entry_prev != expected_prev:
            return False, f"Broken policy chain at line {idx}: prev_hash '{entry_prev}' != '{expected_prev}'"

        entry_to_hash = {k: v for k, v in entry.items() if k != "hash"}
        recomputed = compute_hash(entry_to_hash)
        if recomputed != stored_hash:
            return False, f"Hash mismatch at line {idx}: stored '{stored_hash}' != recomputed '{recomputed}'"

        expected_prev = stored_hash

    return True, None


def verify_audit_file(
    log_path: str,
    verify_key: Optional[str] = None,
    hmac_key: Optional[str] = None,
    allow_client_unverified: bool = True
) -> AuditVerificationResult:
    """
    Verifies the cryptographic integrity of an audit JSONL log file.
    Handles Schema v1, Schema v2, chain head signatures (Ed25519 & HMAC),
    and detects client-generated unverified records.

    Returns AuditVerificationResult (unpacks as (is_valid, error_reason)).
    """
    if not os.path.exists(log_path):
        return AuditVerificationResult(False, f"File does not exist: {log_path}")

    with open(log_path, "r", encoding="utf-8") as f:
        lines = [l.strip() for l in f if l.strip()]

    if not lines:
        return AuditVerificationResult(True, None, record_count=0)

    expected_prev = "GENESIS"
    client_unverified = False
    head_verified: Optional[bool] = None
    schema_versions: List[int] = []
    record_count = 0

    for idx, line in enumerate(lines, start=1):
        try:
            entry = json.loads(line)
        except json.JSONDecodeError as ex:
            return AuditVerificationResult(False, f"Corrupted JSON on line {idx}: {ex}", record_count=record_count)

        # Check if record is chain_head
        if entry.get("type") == "chain_head":
            if idx != len(lines):
                return AuditVerificationResult(
                    False,
                    f"chain_head record must be the final entry, found at line {idx} of {len(lines)}",
                    record_count=record_count
                )
            head_hash = entry.get("head_hash")
            if head_hash != expected_prev:
                return AuditVerificationResult(
                    False,
                    f"chain_head hash mismatch: head_hash '{head_hash}' != chain tail '{expected_prev}'",
                    record_count=record_count
                )

            alg = entry.get("alg")
            if alg == "ed25519":
                pub_key = verify_key or os.getenv("AUDIT_VERIFY_KEY_PATH") or os.getenv("AUDIT_SIGNING_KEY_PATH")
                if pub_key and os.path.exists(pub_key):
                    with open(pub_key, "r", encoding="utf-8") as kf:
                        pub_content = kf.read()
                    # If priv key was passed, derive pub key
                    if "PRIVATE KEY" in pub_content and HAS_CRYPTOGRAPHY:
                        priv = serialization.load_pem_private_key(pub_content.encode("utf-8"), password=None)
                        pub_content = priv.public_key().public_bytes(
                            encoding=serialization.Encoding.PEM,
                            format=serialization.PublicFormat.SubjectPublicKeyInfo
                        ).decode("utf-8")
                elif pub_key and "PUBLIC KEY" in pub_key:
                    pub_content = pub_key
                else:
                    pub_content = None

                if pub_content:
                    valid_sig = verify_head_record_ed25519(entry, pub_content)
                    if not valid_sig:
                        return AuditVerificationResult(
                            False,
                            "Invalid Ed25519 signature on chain_head",
                            head_verified=False,
                            record_count=record_count
                        )
                    head_verified = True
                else:
                    # Key not provided for verification
                    head_verified = None
            elif alg == "hmac-sha256":
                resolved_hmac = hmac_key or os.getenv("AUDIT_HMAC_KEY", DEFAULT_DEV_HMAC_KEY)
                valid_sig = verify_head_record_hmac(entry, resolved_hmac)
                if not valid_sig:
                    return AuditVerificationResult(
                        False,
                        "Invalid HMAC-SHA256 signature on chain_head",
                        head_verified=False,
                        record_count=record_count
                    )
                head_verified = True
            else:
                return AuditVerificationResult(
                    False,
                    f"Unsupported signature algorithm in chain_head: '{alg}'",
                    record_count=record_count
                )
            continue

        # Regular audit record
        record_count += 1
        stored_hash = entry.get("hash")
        entry_prev = entry.get("prev_hash")
        seq = entry.get("seq", entry.get("turn_index", idx))

        version = entry.get("schema_version", 1)
        if version not in schema_versions:
            schema_versions.append(version)

        if entry.get("client_generated"):
            client_unverified = True

        if entry_prev != expected_prev:
            return AuditVerificationResult(
                False,
                f"Broken chain at seq {seq} (line {idx}): prev_hash '{entry_prev}' != expected '{expected_prev}'",
                client_unverified=client_unverified,
                record_count=record_count
            )

        entry_to_hash = {k: v for k, v in entry.items() if k != "hash"}
        recomputed = compute_hash(entry_to_hash)

        if recomputed != stored_hash:
            return AuditVerificationResult(
                False,
                f"Hash mismatch at seq {seq} (line {idx}): stored '{stored_hash}' != recomputed '{recomputed}'",
                client_unverified=client_unverified,
                record_count=record_count
            )

        expected_prev = stored_hash

    if client_unverified and not allow_client_unverified:
        return AuditVerificationResult(
            False,
            "Audit file contains unverified client-generated records (client_generated: true)",
            client_unverified=True,
            head_verified=head_verified,
            record_count=record_count,
            schema_versions=schema_versions
        )

    warning_msg = None
    if client_unverified:
        warning_msg = "Audit chain is intact, but contains unverified client-generated records (client_generated: true)"

    return AuditVerificationResult(
        True,
        warning_msg,
        client_unverified=client_unverified,
        head_verified=head_verified,
        record_count=record_count,
        schema_versions=schema_versions
    )
