# VoiceAI Infra — Phase 0 Reconnaissance Report

**Date:** 2026-11-23  
**Status:** Complete  
**Branch:** `feat/p0-foundations`

---

## 1. Directory Layout & Architecture Map

| Component | Actual Path | Port | Framework / Tech Stack | Dockerfile Present |
|---|---|---|---|---|
| Browser Client | `client/` | 5173 | React 18, Vite, TypeScript | No (needed in P6) |
| Gateway Router | `gateway/` | 8443 | Node.js 20, TypeScript, `ws`, Node test runner | Yes (`gateway/Dockerfile`) |
| ASR / VAD | `services/stt/` | 8001 | FastAPI, sherpa-onnx, faster-whisper fallback, Silero VAD | Yes (`services/stt/Dockerfile`) |
| Machine Translation | `services/mt/` | 8002 | FastAPI / vLLM / Qwen2.5-7B | Yes (`services/mt/Dockerfile`) |
| Agent Brain | `services/agent/` | 8003 | FastAPI, LangGraph, Pydantic, AuditLogger | Yes (`services/agent/Dockerfile`) |
| TTS | `services/tts/` | 8004 | FastAPI, sherpa-onnx, Edge-TTS | Yes (`services/tts/Dockerfile`) |
| Protocol Contracts | `packages/protocol/` | — | TypeScript + Pydantic sync models | N/A |
| Evaluations | `eval/agent/`, `eval/` | — | Python 3.13, pytest, soundfile | N/A |

---

## 2. Answers to Section 9 Open Questions

### Q1: Is `/turn` streaming or request/response today? Can an in-flight turn be cancelled?
- **Finding:** Synchronous request/response.
- **Details:** `services/agent/app/main.py` defines `POST /turn` returning a complete `BrainResponse` (Pydantic model containing `text`, `events`, `metrics`).
- **Cancellation:** In `gateway/src/server.ts`, when barge-in is detected during playback (`sttMsg.type === 'partial'` and `session.isAgentSpeaking`), the gateway aborts the TTS stream via `session.currentTTSAbort?.abort()`. However, while `agentClient.turn(...)` is computing in `POST /turn`, there is **no cancellation hook** to abort an in-flight turn in the agent brain or upstream LLM. Phase 1 must implement this cancel path end-to-end.

### Q2: Where is the VAD hangover configured, and can it be changed per session?
- **Finding:** Configured globally via environment variables.
- **Details:** In `services/stt/main.py`, `hangover_ms` is initialized as `int(os.getenv("HANGOVER_MS", "700"))` (overridden to 900ms in `.env`). It is passed to `SessionState(..., hangover_ms=hangover_ms)` on session creation.
- **Session configurability:** The STT WebSocket protocol does not currently expose dynamic hangover or VAD threshold adjustments per session. To support policy-driven endpointing sweeps (P5-T2), the gateway and STT session init must accept session-level overrides.

### Q3: Does the ASR expose a confidence score?
- **Finding:** Sherpa-ONNX does not expose acoustic confidence; Faster-Whisper exposes word-level probabilities and segment `no_speech_prob`.
- **Details:** In `services/stt/asr.py`, `SherpaONNXEngine` populates `words_list` with hardcoded `"probability": 1.0`. `FasterWhisperEngine` records `w.probability` for each transcribed token. Policy routing input `x-voiceai-asr-confidence` must handle `None` gracefully when Sherpa-ONNX is active.

### Q4: Which Ollama version is installed, and does it support JSON-schema structured output? Is llama.cpp server available?
- **Finding:** Ollama client v0.40.11 is installed. `llama-server` is not installed on PATH.
- **Details:** Ollama 0.40+ supports JSON schema via the `format` parameter (`format: { ... }`) on `/api/chat` and `/v1/chat/completions`. Spike required in Phase 3 to confirm exact grammar/schema compliance.

### Q5: What does the current audit record look like, and where is it written?
- **Finding:** Hash-chained JSONL records in `services/agent/audit_logs/<session_id>.jsonl`.
- **Current schema (v1):**
  ```json
  {
    "seq": 1,
    "session_id": "s_test_123",
    "ts": 1700000000000,
    "stage": "agent_utterance",
    "payload": {
      "attempted": "もしもし...",
      "final": "もしもし...",
      "phase": "greet",
      "turn": 1,
      "latency_ms": 12.5
    },
    "prev_hash": "GENESIS",
    "hash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
  }
  ```
- **Hashing:** Canonical JSON serialization (sorted keys, UTF-8 encoded) with SHA-256.
- **Verification:** Verified by `verify_audit_file` in `services/agent/app/audit.py`. Currently lacks cryptographic key signing (Ed25519/HMAC head) and does not store routing decision or latency breakdown.

### Q6: Which services have Dockerfiles? What is the JS test runner?
- **Finding:**
  - Dockerfiles present: `gateway/Dockerfile`, `services/agent/Dockerfile`, `services/mt/Dockerfile`, `services/stt/Dockerfile`, `services/tts/Dockerfile`.
  - Missing Dockerfile: `client/` (to be added in Phase 6).
  - JS test runner: Node.js built-in test runner (`node --experimental-strip-types --test tests/**/*.test.ts`).

### Q7: Which existing guard rules are sentence-local?
- **Finding:**
  - **Sentence-local:** Regex checks for forbidden content (threats, shaming, profanity, false urgency) and installment limits (`([0-9]+)\s*回払い`).
  - **Non-sentence-local / Turn-level:**
    1. Monetary amount disclosure (`parse_japanese_amount`) vs verification status: requires tracking whether identity verification and recording disclosure occurred.
    2. Rewriting behavior: When any post-guard fails, the entire utterance is rewritten to a polite canned response. If sentence 1 is streamed and spoken to the caller before sentence 2 triggers a compliance block, the spoken audio cannot be recalled.
  - **Decision:** As planned in Section 6 (P1-T4), retain "full response → post-guard → TTS". Sentence streaming guard remains an experimental stretch behind `SENTENCE_STREAMING_GUARD=false`.

### Q8: Hardware and execution environment availability
- **Finding:**
  - **GPU:** None (CPU-only host). All benchmarks involving GPU will be labeled `not run (CPU host)`.
  - **Kubernetes:** `kubectl` is available (v1.34.1 via Docker Desktop). `k3d` and `kind` are not installed. Phase 6 autoscaling will use simulation and/or Docker-based load replay.

---

## 3. Deviations from Plan Section 3

1. **Client Dockerfile:** Section 3 assumes containerization across all components; `client/` currently lacks a `Dockerfile`.
2. **Local ASR Model Selection:** `SHERPA_MODEL` defaults to `sense-voice`, which is CPU-optimized (RTF < 0.15 on CPU). Faster-whisper fallback is present for comparison.
3. **Sandbox Networking Consideration:** On Windows inside restricted sandbox environments, loopback TCP socket binding (`127.0.0.1`) requires standard network socket permissions; tests opening HTTP servers run cleanly with standard bypass authorization.

---

## 4. Baseline Test Verification (P0-T2)

All existing test suites pass:
- `client/`: 10 passed (100%)
- `gateway/`: 28 passed (100%)
- `services/agent/`: 34 passed (100%)
- `packages/protocol/`: 2 passed (100%)
- `eval/`: 1 passed (`test_stt_foundation.py`)
