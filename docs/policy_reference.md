# VoiceAI Policy Reference & Deterministic Risk Mapping

## 1. Overview
This document specifies the routing policy schema, metadata headers, and deterministic risk tier derivations for VoiceAI Infra (Plan 1 Section 5 and Section 6 P2-T2).

Routing decisions are performed per turn by evaluating policy rules against turn metadata (`risk_tier`, `dialogue_state`, `utterance_tokens`, `asr_confidence`).

---

## 2. Policy Schema (`config/policies/*.yaml`)

```yaml
version: 1
profile: default
budgets:
  ttft_ms: 450              # Target Time-to-First-Token
  total_turn_ms: 1000       # Target total turn latency
  cost_weight: 0.3          # 0 = latency only, 1 = cost only

tiers:
  t0_fast_path:  {kind: deterministic}                       # agent graph emits text directly
  t1_local:      {backend: ollama_local, model: "qwen3:1.7b"}
  t2_large:      {backend: remote_large, model: "qwen2.5-7b-instruct", enabled: false}
  t3_safe_mode:  {kind: deterministic}                       # agent produces scripted safe response

rules:                                                       # first match wins
  - id: r_high_risk
    when: {risk_tier: high}
    use: t1_local
    constrain: strict
    fallback: [t3_safe_mode]

  - id: r_hard_turn
    when: {dialogue_state: negotiation, utterance_tokens_gt: 25}
    use: t2_large
    fallback: [t1_local, t3_safe_mode]

  - id: r_default
    default: true
    use: t1_local
    fallback: [t3_safe_mode]

circuit_breaker:
  failures: 3
  window_s: 30
  cooldown_s: 20

constraints:
  output_schema: brain_turn_v1
  token_masks:
    unverified_identity: [ascii_digits, fullwidth_digits, currency_symbols]
  on_unsupported_backend: validate_and_retry_once

cache:
  prefix: {enabled: true}
  response: {enabled: false, cacheable_intents: [], ttl_s: 3600, semantic_matching: false}
```

---

## 3. Metadata Headers (Section 5.2)

The agent sends metadata on each LLM completion request:

| Header / Key | Type | Description |
|---|---|---|
| `x-voiceai-session-id` | string | Unique call session identifier |
| `x-voiceai-turn-id` | string | Sequential utterance turn number within session |
| `x-voiceai-profile` | string | Policy profile name (e.g. `default`) |
| `x-voiceai-dialogue-state` | string | LangGraph dialogue state (e.g. `negotiate`, `greet`) |
| `x-voiceai-risk-tier` | enum | `low`, `medium`, `high` (deterministic graph derivation) |
| `x-voiceai-asr-confidence` | float | Acoustic ASR confidence if provided by STT engine |
| `x-voiceai-utterance-tokens`| int | Caller utterance token/character count |

---

## 4. Deterministic Risk Tier Derivation (P2-T2)

To ensure consistent and verifiable compliance, the agent computes `risk_tier` deterministically from dialogue graph state without heuristic guesswork:

### Collections Domain
| State Condition | Derived Risk Tier | Compliance Justification |
|---|---|---|
| `identity_verified is False` | **`high`** | FDCPA / Consumer Contract Act: debt balance and creditor identity must never leak prior to authenticated identity. |
| `phase in ("negotiate", "capture_promise")` | **`medium`** | Legally binding settlement promises and installment agreements. |
| `identity_verified is True` and `phase in ("greet", "disclose", "close")` | **`low`** | Standard conversational flows post-verification. |

### Screening Domain
| State Condition | Derived Risk Tier | Compliance Justification |
|---|---|---|
| `stage in ("evaluation", "decision")` | **`high`** | Employment compliance: hiring determinations, candidate rating. |
| `stage in ("pre_screen", "identity")` | **`medium`** | Verification of candidate qualifications and credentials. |
| `stage in ("experience_inquiry", "closing")` | **`low`** | General informational inquiry. |

### KYC / Customer Support Domain
| State Condition | Derived Risk Tier | Compliance Justification |
|---|---|---|
| `verified is False` or `stage in ("auth", "security_check")` | **`high`** | PII protection, date of birth / phone number authentication. |
| `verified is True` | **`low`** | Authenticated customer support and general inquiries. |

### Custom Domain
| State Condition | Derived Risk Tier | Compliance Justification |
|---|---|---|
| `is_high_risk is True` or `stage in ("sensitive", "auth", "financial")` | **`high`** | Enterprise-defined sensitive operations. |
| `stage in ("triage", "inquiry")` | **`medium`** | Intermediate customer routing. |
| All other states | **`low`** | Standard default conversational tier. |

---

## 5. Router Decision Record (`x_voiceai`)

On completion, the LLM Gateway returns the routing decision record:
```json
{
  "tier": "t1_local",
  "backend": "ollama_local",
  "model": "qwen3:1.7b",
  "rule_id": "r_high_risk",
  "reason_code": "RULE_MATCH",
  "policy_version": "sha256:739a8bc4",
  "cache": "miss",
  "constraint_mode": "strict",
  "fallback_chain": [],
  "ttft_ms": 142,
  "tokens_in": 120,
  "tokens_out": 24,
  "cached_tokens": 64,
  "cancelled": false
}
```

Allowed `reason_code` values:
- `RULE_MATCH`: Explicit policy condition matched.
- `DEFAULT`: Fallback rule `r_default` triggered.
- `TTFT_BUDGET_EXCEEDED`: Backend failed TTFT deadline; fallback activated.
- `BACKEND_ERROR`: Upstream network / HTTP error triggered ladder.
- `CIRCUIT_OPEN`: Circuit breaker tripped; tier bypassed.
- `CACHE_HIT`: Exact or semantic cache returned response.
- `ALL_BACKENDS_FAILED`: All available tiers exhausted; safe mode initiated.
- `CLIENT_CANCELLED`: Request cancelled in-flight via barge-in.
