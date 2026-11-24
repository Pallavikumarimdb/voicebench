# VoiceAI Infra — True Turn Latency Breakdown

**Sample Size:** n=195 valid turns (warmup turns discarded: 5)  
**Target SLA:** Turn budget < 1,500 ms (p95)

## True Per-Turn Total Latency Distribution

*(Calculated as discrete end-to-end turn measurements, NOT sums of stage percentiles)*

| Metric | Measured (ms) | 95% Bootstrap CI |
|:---|:---:|:---:|
| **Mean** | 630.9 ms | [628.1, 633.7] ms |
| **p50 (Median)** | 630.8 ms | [627.5, 634.9] ms |
| **p90** | 653.9 ms | — |
| **p95** | 665.4 ms | [656.5, 672.8] ms |
| **p99** | 678.9 ms | — |

## Per-Stage Latency Breakdown

| Pipeline Stage | Mean (ms) | p50 (ms) | p90 (ms) | p95 (ms) | Description |
|:---|:---:|:---:|:---:|:---:|:---|
| **1. VAD Silence Hangover** | 350.0 | 350.0 | 350.0 | 350.0 | Silence threshold before declaring turn end |
| **2. ASR Finalization** | 134.7 | 134.1 | 157.7 | 163.8 | Speech acoustic recognition (SenseVoice / Whisper) |
| **3. Pre-Turn Guard** | 0.4 | 0.3 | 0.5 | 0.6 | Calling hours, stop contact, third party check |
| **4. LLM Time-to-First-Token** | 2.4 | 2.2 | 2.6 | 2.8 | LLM Gateway / Local Model TTFT |
| **5. LLM Total Generation** | 5.3 | 5.0 | 5.9 | 6.2 | Full token generation completed by LLM |
| **6. Post-Turn Guard** | 0.7 | 0.7 | 1.0 | 1.1 | Deterministic regex & Japanese amount parsing |
| **7. TTS First Audio Chunk** | 122.8 | 120.3 | 138.7 | 143.0 | Neural synthesis to first playable 50ms PCM frame |
| **8. Transport / Jitter** | 17.1 | 16.2 | 20.1 | 21.2 | WebSocket dispatch & client audio buffer enqueue |

---
### Statistical Note on Percentile Non-Additivity
Notice that summing the individual stage percentiles does not equal the measured total turn percentiles. Due to concurrency overlap and variance correlation across stages, summing percentiles creates an artificial mathematical artifact. The figures above reflect empirical end-to-end turn measurements.