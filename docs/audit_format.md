# Append-Only Audit Trail & Hash-Chain Verification Specification

> **Version:** Schema v2  
> **Storage:** Append-only JSONL files at `services/agent/audit_logs/<session_id>.jsonl`  
> **Integrity Guarantee:** SHA-256 cryptographic hash-chaining sealed by Ed25519 or HMAC-SHA256 signature on `chain_head`.

---

## 1. Audit Record Schema (Schema v2)

Every conversational turn appends an immutable JSON record:

```json
{
  "schema_version": 2,
  "call_id": "s_e4b89a01",
  "turn_index": 1,
  "ts": "2026-11-24T08:15:30.123Z",
  "caller_text": "もしもし、山田です。",
  "agent_attempted_text": "山田様、未払い金48,000円のご案内です。",
  "agent_final_text": "山田様、生年月日をお伺いできますでしょうか。",
  "guard_events": [
    {
      "event": "post_llm_violation",
      "code": "amount_disclosed_before_verification",
      "tier": "t1_local"
    }
  ],
  "post_guard_applied": true,
  "route": {
    "tier": "t1_local",
    "backend": "ollama",
    "model": "qwen2.5:7b",
    "rule_id": "r_default",
    "reason_code": "POLICY_MATCH",
    "policy_version": 1,
    "cache": "miss"
  },
  "timings": {
    "vad_end_to_first_audio_ms": 612.4,
    "stages": {
      "vad_hangover": 350,
      "asr": 178,
      "pre_guard": 1.2,
      "llm_ttft": 32.5,
      "llm_total": 140.2,
      "post_guard": 2.1,
      "tts": 50.4
    }
  },
  "client_generated": false,
  "prev_hash": "GENESIS",
  "hash": "a4f89c72e90b8f1d3e4210a562f741b2e84c9019a3b6d4e8c1f7a205d9e3f1b4"
}
```

---

## 2. Chain Head Signature & Verification

Upon natural hangup or call completion, the audit chain is sealed with a terminal record:

```json
{
  "type": "chain_head",
  "call_id": "s_e4b89a01",
  "head_hash": "a4f89c72e90b8f1d3e4210a562f741b2e84c9019a3b6d4e8c1f7a205d9e3f1b4",
  "alg": "ed25519",
  "key_id": "key-ed25519-primary",
  "signature": "3a8f10b7..."
}
```

### Verification CLI
Run the verifier over any session log:
```bash
python services/agent/app/verify_audit.py services/agent/audit_logs/s_e4b89a01.jsonl
```

If an attacker modifies a single byte in any turn, the recomputed SHA-256 hash diverges from stored hashes, causing instant verification failure.
If browser-tier turns are present, the verifier validates the hash chain but reports:
`WARNING: File contains unverified client-generated records (client_generated: true)`.
In strict compliance mode (`--strict-client`), records with client-generated turns are rejected.
