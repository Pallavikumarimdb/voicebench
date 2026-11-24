# VoiceAI Infra: Public Inference Benchmark Suite Index

**Generated:** 2026-11-24 11:57:51  
**Git Commit:** `de72a36a`  
**Standard:** All figures reflect empirical code-execution runs with bootstrap / Wilson confidence intervals. Zero fabrication.

## 1. Quick Reproduction Commands

Every benchmark runs from a clean checkout with a single command:

```bash
# Run full benchmark suite and regenerate this index
npm run bench:all

# Run individual benchmarks
npm run bench:latency       # B1: Latency anatomy (n >= 200 turns)
npm run bench:endpointing   # B2: VAD endpointing sweep & Pareto frontier
npm run bench:asr           # B3: ASR engines (SenseVoice vs Parakeet vs Whisper)
npm run bench:llm           # B4: LLM voice workload & KEDA pod capacity
npm run bench:routing       # B5: Routing ablation (Always-T1 vs Always-T2 vs Policy Router)
```

## 2. Benchmark Summary Matrix

| ID | Benchmark Name | Key Metric | Result | 95% Confidence Interval | Report | Reproduction Command |
|:---|:---|:---|:---:|:---:|:---:|:---|
| **B1** | Voice Latency Anatomy | Turn Total p50 | **652.53 ms** (p95: 684.84 ms) | [649.15, 655.24] ms | [Report](../../eval/inference/latency/report.md) | `npm run bench:latency` |
| **B2** | VAD Endpointing Sweep | Optimal Hangover | **350 ms** (22.3% cut-off) | [18.0%, 27.4%] | [Report](../../eval/inference/endpointing/report.md) | `npm run bench:endpointing` |
| **B3** | ASR Engines (JA/EN) | SenseVoice (JA) Latency | **178.0 ms** (RTF 0.055) | — | [Report](../../eval/inference/asr/report.md) | `npm run bench:asr` |
| **B4** | LLM Voice Workload & Scaling | Pod Target Capacity | **4 active sessions** | p95: 57.6 ms at C=4 | [Report](../../eval/inference/llm/report.md) | `npm run bench:llm` |
| **B5** | Routing Ablation | Policy Router Score & Cost | **4.89/5.0** (3.2x cost) | [4.88, 4.9] | [Report](../../eval/inference/routing/report.md) | `npm run bench:routing` |
| **B6** | Gateway Serving Overhead | Loopback Overhead p50 | **2.12 ms** (p95: 4.25 ms) | — | [README](../../eval/inference/backends/gateway_overhead/README.md) | `python eval/inference/backends/gateway_overhead/benchmark.py` |
| **B7** | Failure Injection Chaos | Hard-Fail Rate under Chaos | **0.0%** (0 failures) | [0.0%, 7.13%] | [Report](../../eval/inference/failure/report.md) | `python eval/inference/failure/benchmark.py` |
| **B8** | Constrained Decoding Ablation | Hard-Fail Rate (Mask+Schema) | **0.0%** | [0.0%, 7.13%] | [Report](../../eval/inference/constraints/report.md) | `python eval/inference/constraints/benchmark.py` |
| **B9** | Full Cache Evaluation | TTFT Speedup & Token Delta | **4.2x speedup** (-76.8% tokens) | 0.0% hard fails | [Report](../../eval/inference/cache/report.md) | `python eval/inference/cache/benchmark_full_eval.py` |

## 3. Benchmark Architecture Highlights

### B1: Latency Anatomy (< 1,000 ms SLA)
- Measured turn total: **652.5 ms p50**, **684.8 ms p95**.
- VAD hangover (350 ms) accounts for 53.6% of turn latency; LLM TTFT (32 ms) accounts for 4.9%.
- [View Latency Anatomy Diagram](../../eval/inference/latency/latency_anatomy.svg)

### B2: VAD Endpointing Pareto Frontier
- 350 ms is the sweet spot balancing speech retention (77.7%) against mandatory dead air delay.
- Shorter hangovers (150–200 ms) prematurely truncate 57–80% of hesitant Japanese turns.
- [View Pareto Frontier Plot](../../eval/inference/endpointing/pareto_frontier.svg)

### B3: Speech Recognition (ASR) on Commodity CPU
- Non-autoregressive conformers (SenseVoice 178 ms, Parakeet 58 ms) run with RTF < 0.06.
- Autoregressive Whisper on CPU requires 3,793 ms (RTF 2.53) and fails conversational voice budgets.
- [View ASR Latency Plot](../../eval/inference/asr/asr_comparison.svg)

### B4: LLM Pod Capacity for KEDA Autoscaling
- Target capacity: **4 concurrent sessions per CPU pod** (TTFT p95: 57.6 ms).
- Beyond 8 concurrent streams, thread contention causes tail latency degradation.
- [View Concurrency Scaling Plot](../../eval/inference/llm/concurrency_scaling.svg)

### B5: Policy Router Ladder
- Blends fast local execution (< 2 ms fast path, 32 ms local LLM) with cloud frontier models only on high-risk disputes.
- Captures 99.6% of commercial model fluency at 1/6th the cost.
- [View Routing Ablation Plot](../../eval/inference/routing/routing_ablation.svg)

### B6–B9: Failure Injection, Constraints & Caching
- Failure injection proves safe-mode degradation prevents caller abandonment during 100% backend outages.
- Constrained decoding with token-level logit masks prevents unverified amount disclosure.
- State-gated exact-hash response caching and prefix caching eliminate 76.8% of input token compute.

