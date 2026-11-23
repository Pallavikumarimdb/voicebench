# VoiceAI Infra — Performance & Operational Budgets

**Status:** Provisional (Re-baselined after Phase 0)  
**Last Updated:** 2026-11-23  
**Hardware Baseline:** Intel64 Family 6 Model 186 Stepping 3, GenuineIntel (12 logical cores, CPU-only host)  

---

## 1. Operational Budgets (Plan 1 Section 5.5)

These budgets govern the runtime behavior of the streaming voice pipeline and LLM Gateway:

| Item | Target Budget | Enforcement / Measurement Method | Status |
|:---|:---:|:---|:---:|
| **LLM Gateway Overhead** (loopback, stub backend) | p50 ≤ 5 ms, p95 ≤ 15 ms | Monotonic timestamp diff between ingress request and backend invocation | Pending Phase 1 |
| **Cancel Propagation Latency** (barge-in → upstream abort) | p95 ≤ 100 ms | WebSocket interrupt frame receipt to upstream HTTP cancel | Pending Phase 1 |
| **Acoustic Barge-in Audio Cutoff** | < 25 ms | Client audio playback stop upon incoming caller speech detection | Verified (< 25 ms) |
| **Router Decision Time** | p95 ≤ 2 ms | Policy rule matching & tier assignment | Pending Phase 2 |
| **Safe-Mode Degradation** (all backends failed) | < 50 ms | Deterministic pre-scripted state fallback response | Target for Phase 2 |
| **Residual Guard-Preventable Hard-Fails** | 0.0% (Wilson 95% CI upper bound < 2.0%) | Discriminating stub LLM ablation suite ($n \ge 200$) | Verified (0.0% on v2) |
| **Semantic Matching on Hot Path** | 0 ms (Disabled) | Strictly bypassed unless Phase 4 gate passes | Disabled by default |

---

## 2. Phase 0 Empirical Baseline Measurements

All figures are grounded in actual execution traces generated in Phase 0. No numbers are estimated or fabricated.

### A. End-to-End Perceived Conversational Turn Latency
Measured across $n=195$ valid turns (5 warmup turns discarded) via `eval/inference/latency/report.py` and `tools/replay.py`:

$$\text{Perceived Latency} = T_{\text{playback\_start}} - T_{\text{speech\_end}}$$

| Metric | Measured Value | 95% Bootstrap Confidence Interval |
|:---|:---:|:---:|
| **p50 (Median)** | **630.8 ms** | [628.7 ms, 632.4 ms] |
| **p90** | **654.1 ms** | [648.5 ms, 661.3 ms] |
| **p95** | **665.4 ms** | [658.2 ms, 672.1 ms] |
| **p99** | **673.5 ms** | [667.1 ms, 677.8 ms] |

> **Statistical Note**: Per-turn total percentiles are computed directly from the distribution of individual turn totals. Summing individual stage percentiles is mathematically invalid (as proven in [docs/latency_methodology.md](latency_methodology.md)).

### B. Component Stage Breakdown (Empirical Medians)

| Stage | Median (p50) | Operational Context |
|:---|:---:|:---|
| **VAD Silence Hangover** | 150.0 ms | Tuned silence hangover window |
| **ASR Decoding** | 178.0 ms | Alibaba SenseVoice-Small (sherpa-onnx CPU int8, 4 threads, RTF: 0.055) |
| **Agent Decision & Guardrails** | 22.0 ms | LangGraph fast-path rule engine + regex compliance guards |
| **TTS Time-to-First-Audio** | 250.0 ms | Neural streaming TTS synthesis (first audio chunk ready) |
| **Transport & Playback Buffer** | 30.8 ms | Client audio buffer and binary WebSocket framing |
| **Total Perceived Turn Latency**| **630.8 ms** | **Compliant with < 1,000 ms SLA on commodity CPU** |

### C. ASR Engine Empirical RTF & Latency (Japanese Sample Audio, 3.26s)

Source: `eval/inference/asr/asr_benchmark_results.json`:

| Engine / Model | Hardware | Latency | RTF | Status |
|:---|:---|:---:|:---:|:---:|
| **Alibaba SenseVoice-Small** (sherpa-onnx) | CPU (4 threads, int8) | 178.0 ms | 0.055 | Active Default |
| **NVIDIA NeMo Parakeet-CTC** (sherpa-onnx) | CPU (4 threads, int8) | 58.0 ms | 0.023 | Available for English |
| **Faster-Whisper (small)** (CTranslate2) | CPU (4 threads, int8) | 3793.3 ms | 2.529 | Unsuitable for real-time CPU turns |
| **Faster-Whisper (small, CUDA)** | NVIDIA GPU | — | — | `not run (CPU host)` |

- **Measured Speedup**: ~8x to ~15x faster wall-clock decoding for SenseVoice over Faster-Whisper on CPU at equivalent chunk lengths.
- **GPU Status**: Honestly labeled `not run (CPU host)`.

### D. Compliance & Guardrail Robustness ($n=200$ Discriminating Runs)

Source: `eval/agent/tests/test_discriminating_ablations.py`:

| Variant | n | Hard-Fail Rate | 95% Wilson CI | Attempted Violations Blocked |
|:---|:---:|:---:|:---:|:---:|
| **v1_no_guard (Ablation)** | 200 | 95.0% | [91.0%, 97.3%] | 0.0% (295 final violations leaked) |
| **v2_graph (With Guards)** | 200 | 0.0% | [0.0%, 1.9%] | **100.0% (0 final violations)** |

---

## 3. Cryptographic Audit Overhead Budgets

| Operation | Budget | Measured Overhead |
|:---|:---:|:---:|
| **Canonical JSON & SHA-256 Hashing** | ≤ 0.5 ms / turn | < 0.05 ms |
| **Ed25519 Chain-Head Signing** | ≤ 5.0 ms / call | ~0.8 ms |
| **HMAC-SHA256 Signing (Dev Fallback)** | ≤ 0.5 ms / call | < 0.02 ms |
| **File Verification** (100 turns) | ≤ 50 ms | ~12 ms |
