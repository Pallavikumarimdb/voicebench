# Latency Measurement Methodology

**VoiceAI Infra — End-to-End Latency Measurement Standard**  
**Version:** 1.0  
**Status:** Approved for v1.0  

---

## 1. Perceived Latency Definition

In voice conversational AI, user-perceived response latency is defined as:

$$\text{Perceived Latency} = T_{\text{playback\_start}} - T_{\text{speech\_end}}$$

- **$T_{\text{speech\_end}}$ (True Acoustic End-of-Speech):**
  - **Replay / Benchmark Mode:** Exactly determined by the ground-truth acoustic end of speech labeled in the dataset (or the timestamp of the last audio sample with voice energy above silence threshold in the input `.wav` file).
  - **Live Mode:** Approximated by the timestamp of the last active speech frame emitted by VAD before the silence hangover window begins.
- **$T_{\text{playback\_start}}$ (First Audio Played):**
  - The monotonic millisecond timestamp recorded by the client browser/consumer when the first decoded audio sample buffer is scheduled for playback by the Web Audio API audio destination.

> [!IMPORTANT]
> **Statistical Fallacy Notice:** Under no circumstances may total turn latency be computed as the sum of individual stage percentiles ($\sum p50 \neq \text{total } p50$). Percentiles are non-additive. Total latency must be measured as the discrete end-to-end duration for each individual turn, and percentiles calculated over the resulting distribution.

---

## 2. Stage Breakdown & Monotonic Boundaries

To prevent cross-host clock skew and NTP synchronization drift, all stage durations are recorded using monotonic clock intervals (`time.perf_counter()` in Python, `process.hrtime.bigint()` in Node.js, `performance.now()` in browser) within their respective services:

```text
Caller speaks ... [Speech End]
      │
      ├─► [Stage 1: vad_hangover]   Silence hangover (e.g. 350ms) declared by VAD state machine
      │
      ├─► [Stage 2: asr]            ASR inference (Sherpa-ONNX / Whisper) on speech segment
      │
      ├─► [Stage 3: pre_guard]      Deterministic pre-turn compliance & state check (< 2ms)
      │
      ├─► [Stage 4: llm_ttft]       Time-to-first-token emitted by LLM Gateway / local model
      │
      ├─► [Stage 5: llm_total]      Full token generation completed by LLM
      │
      ├─► [Stage 6: post_guard]     Deterministic regex, amount parsing & compliance check (< 3ms)
      │
      ├─► [Stage 7: tts_first_audio] TTS synthesis time to first audio chunk (16kHz PCM)
      │
      ├─► [Stage 8: transport]      WebSocket binary serialization, routing, client buffer
      ▼
Client hears: [Playback Start]
```

### Stage Definitions

| Stage Name | Monotonic Measurement | Target Budget | Description |
|---|---|---|---|
| `vad_hangover` | $T_{\text{vad\_cut}} - T_{\text{speech\_end}}$ | 350 ms | Silence threshold required to declare turn completion. |
| `asr` | $T_{\text{asr\_done}} - T_{\text{asr\_start}}$ | 60–250 ms | Acoustic feature extraction and greedy decoding. |
| `pre_guard` | $T_{\text{pre\_done}} - T_{\text{pre\_start}}$ | < 2 ms | Check calling hours, stop contact, third party. |
| `llm_ttft` | $T_{\text{first\_tok}} - T_{\text{llm\_start}}$ | 150–400 ms | Time to first token from LLM Gateway. |
| `llm_total` | $T_{\text{last\_tok}} - T_{\text{llm\_start}}$ | 300–600 ms | Complete response token stream generation. |
| `post_guard` | $T_{\text{post\_done}} - T_{\text{post\_start}}$ | < 5 ms | Japanese amount parsing, forbidden patterns, limit enforcement. |
| `tts_first_audio` | $T_{\text{audio\_chunk\_0}} - T_{\text{tts\_start}}$ | 100–200 ms | Neural TTS synthesis to first 50ms audio chunk. |
| `transport` | Residual | 20–50 ms | Network framing, WebSocket dispatch, client playback enqueue. |
| **Total Turn** | $T_{\text{playback\_start}} - T_{\text{speech\_end}}$ | **< 1,500 ms** | **Per-turn measured end-to-end duration.** |

---

## 3. Trace Record Schema (`latency_traces.jsonl`)

Every turn evaluated in benchmarks or replays emits an append-only JSONL record:

```json
{
  "session_id": "s_trace_001",
  "turn_id": 1,
  "caller_audio_duration_ms": 2340,
  "true_speech_end_ms": 1950,
  "t_playback_start_ms": 2895,
  "total_e2e_ms": 945.0,
  "stages": {
    "vad_hangover_ms": 350.0,
    "asr_ms": 182.4,
    "pre_guard_ms": 0.6,
    "llm_ttft_ms": 142.1,
    "llm_total_ms": 298.5,
    "post_guard_ms": 1.8,
    "tts_first_audio_ms": 128.0,
    "transport_ms": 41.6
  },
  "flags": {
    "is_warmup": false,
    "is_fast_path": false,
    "backend": "ollama_local",
    "model": "qwen3:1.7b"
  }
}
```

---

## 4. Statistical Rigor Standards

1. **Sample Size:** $n \ge 200$ turns per benchmark scenario.
2. **Warmup Handling:** First 5 turns of any benchmark run are flagged `is_warmup: true` and discarded from reported statistics to exclude JIT compilation, model cache loading, and connection setup overhead.
3. **Failure Retention:** Network timeouts, model dropouts, and errors are retained in trace counts and reported as failed turns (not silently dropped).
4. **Confidence Intervals:**
   - 95% Bootstrap Confidence Intervals (1,000 resamples) computed for means, p50, and p95.
   - Wilson Score 95% Confidence Intervals for failure and breach rates.
