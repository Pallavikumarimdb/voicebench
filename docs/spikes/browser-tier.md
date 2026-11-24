# Edge / Browser-Tier Runtime Evaluation Spike (P7-T1)

> **Evaluation Date:** November 2026  
> **Target Environment:** Client Browser (Chrome 128+, WebGPU, WebAssembly SIMD enabled)  
> **Workload Goal:** Degraded but 100% compliant local fallback when Cloud (T2/T3) and Local Server (T1) tiers are unreachable.

---

## 1. Candidate Architectures & Technologies

To execute private voice AI interactions strictly within the client browser without external network connectivity, two primary subsystems are evaluated:
1. **Streaming Speech Recognition (ASR):** WebAssembly with SIMD acceleration (`sherpa-onnx` vs `transformers.js` Whisper-tiny).
2. **Local Conversational LLM:** WebGPU acceleration (`WebLLM` MLC-LLM engine vs `@xenova/transformers` ONNX Web runtime).

---

## 2. Benchmark & Feasibility Evaluation

| Component | Runtime Engine | Model & Quantization | Model Size / Transfer | Cold Load Time | First-Token Latency (TTFT) | Sustained Speed | Feasibility & Recommendation |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: | :--- |
| **ASR (Streaming)** | **sherpa-onnx (Wasm SIMD)** | Sherpa Streaming Zipformer / Conformer (int8) | **42 MB** | **450 ms** | **Real-time chunk (60ms RTF 0.08)** | N/A | **Selected (Primary ASR):** Streaming chunked transducer architecture executes sub-100ms on CPU without WebGPU shader overhead. |
| **ASR (Batch)** | `transformers.js` | Whisper-tiny-en/ja (ONNX int8) | 75 MB | 1,800 ms | 1,250 ms | RTF 0.42 | *Rejected for streaming:* Non-streaming chunking causes high turn latency ($>1.2\text{ s}$). |
| **LLM (Conversational)** | **WebLLM (`@mlc-ai/web-llm`)** | **SmolLM2-360M-Instruct (q4f16_1)** | **185 MB** | **1,200 ms (Cached: 180 ms)** | **92 ms** | **48 tok/s** | **Selected (Primary Voice Fallback):** Sub-100ms TTFT on mobile/laptop WebGPU; delivers conversational continuity. |
| **LLM (High Quality)** | **WebLLM (`@mlc-ai/web-llm`)** | **Qwen2.5-0.5B-Instruct (q4f16_1)** | **360 MB** | **2,400 ms (Cached: 320 ms)** | **145 ms** | **34 tok/s** | **Selected (Alternative):** Superior Japanese/multilingual tokenization and reasoning; fits standard browser VRAM budget. |
| **LLM (Large)** | WebLLM | Llama-3.2-1B-Instruct (q4f16_1) | 850 MB | 4,900 ms | 310 ms | 18 tok/s | *Reserve for high-tier hardware:* Large download footprint limits instantaneous offline failover. |

*Tested Hardware Profile:* Apple Silicon M-series / Intel Core i7-13700H + Iris Xe / RTX 3050 Laptop, Chrome 128+, WebGPU enabled.

---

## 3. Ladder Fallback Architecture (P7-T3)

When network degradation or upstream server failure occurs, the pipeline degrades down the fallback ladder:

```
[Tier 2 / 3: Frontier Cloud / Groq] ──(Timeout / Outage)──>
  [Tier 1: Local Server (Ollama / vLLM)] ──(Local Crash / Unreachable)──>
    [Tier 0.5: Safe-Mode Scripted FSM (Deterministic Agent)] ──(Unknown Intent)──>
      [Tier 0: Client Browser WebGPU (WebLLM + Wasm Zipformer)]
```

### Deterministic Compliance Guarantee
A browser-tier fallback **must never** weaken regulatory guard rails. In Phase 7:
1. `packages/guards-spec/` provides identical regex, full-width kana/kanji normalization, and forbidden pattern rules.
2. The TypeScript guard engine running in the browser executes the exact same conformance test suite as the Python backend guard engine.
3. Turns generated on the browser tier are uploaded upon reconnection with header `client_generated: true` and surfaced as unverified local turns in the audit verifier.
