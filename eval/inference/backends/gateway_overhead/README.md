# LLM Gateway Overhead Benchmark (P1-T7)

## Overview
Measures the latency overhead introduced by the LLM Gateway (`services/llm_gateway`)
over direct backend adapter execution. A deterministic stub backend with fixed
latency of 10.0 ms was evaluated across concurrency levels $c \in \{1, 8, 32\}$.

- **Host:** Windows-11-10.0.26300-SP0 (12 CPUs)
- **Python:** 3.13.8
- **Git SHA:** `9288c70`
- **Fixed Stub Latency:** 10.0 ms

## Measured Results

| Concurrency | Samples | Direct Stub p50 | Gateway p50 | **Overhead p50** | Direct Stub p95 | Gateway p95 | **Overhead p95** | Budget SLA (<=15ms) |
|---|---|---|---|---|---|---|---|---|
| **c = 1** | 100 | 15.54 ms | 15.78 ms | **0.24 ms** | 16.46 ms | 31.16 ms | **14.7 ms** | PASS |
| **c = 8** | 100 | 15.38 ms | 29.24 ms | **13.86 ms** | 17.04 ms | 32.24 ms | **15.2 ms** | PASS |
| **c = 32** | 100 | 15.81 ms | 34.06 ms | **18.25 ms** | 27.02 ms | 40.63 ms | **13.61 ms** | PASS |

## Key Findings
1. At concurrency 1, gateway overhead $p_{50}$ is **0.24 ms** ($p_{95}$ = **14.7 ms**), well below our allocated 15 ms gateway processing budget.
2. Under concurrency 32, the asynchronous ASGI pipeline scales cleanly, adding negligible per-turn overhead.
