# VoiceAI Infra LLM Inference Gateway Architecture

> **Service Port:** `8005` (`services/llm_gateway`)  
> **API Format:** OpenAI-Compatible (`/v1/chat/completions`, `/healthz`, `/readyz`, `/metrics`, `/reload`)  
> **Core Purpose:** Real-time conversational inference routing, prompt stabilization, constrained decoding, and upstream streaming cancellation.

---

## 1. Architectural Role & Pipeline Placement

```
                  ┌──────────────────────┐
                  │   WebSocket Gateway   │ (:8443)
                  └──────────┬───────────┘
                             │  Audio & Session State
                             ▼
                  ┌──────────────────────┐
                  │     Agent Brain      │ (:8003)
                  └──────────┬───────────┘
                             │  HTTP POST /v1/chat/completions
                             ▼
┌────────────────────────────────────────────────────────┐
│             VoiceAI Infra LLM Gateway (:8005)           │
│                                                        │
│  [Tier 0: Exact-Hash Cache] ──< 2ms Hit               │
│               │ (Miss)                                 │
│  [Routing Policy Engine] (High Risk / Hard / Default) │
│               │                                        │
│  [Tier 1: Local CPU / Ollama / vLLM / MLX]            │
│               │ (Circuit Breaker / Outage)             │
│  [Tier 2: Remote Frontier / Large]                     │
│               │ (Outage)                               │
│  [Tier 3: Scripted Safe-Mode FSM (Deterministic)]      │
│                                                        │
│  Streaming Generator -> SSE Output Chunks              │
│  True Upstream Cancellation on Client Barge-In         │
└────────────────────────────────────────────────────────┘
```

---

## 2. Key Capabilities

### A. Dynamic Fallback Ladder & Circuit Breaker
- **Zero-Crash Conversational Guarantee:** Requests traverse `t0_fast_path` → `t1_local` → `t2_large` → `t3_safe_mode`.
- If an upstream backend times out or errors 3 consecutive times in a 30s window, the circuit breaker opens for 20s, instantly routing incoming traffic to adjacent tiers without stalling caller audio.

### B. True Upstream Cancellation
- When the caller speaks during agent playback (barge-in), the client WebSocket issues an interrupt.
- The Agent cancels the in-flight HTTP request. The LLM Gateway's generator detects disconnect and immediately sends abort signals to local and remote backend subprocesses / streams.

### C. State-Gated Exact Cache
- Identical utterances within the same dialogue state return in $< 2\text{ ms}$ with 0 token consumption.
- Cache entries are automatically invalidated when dialogue state transitions (e.g., `greet` → `negotiate`).

### D. Zero-Restart Policy Reloading
- The Gateway exposes `POST /reload`. Modifying policy YAML files via Agent Studio or API takes effect for the very next turn without interrupting in-flight sessions.
