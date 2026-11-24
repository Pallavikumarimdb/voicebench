# Changelog

All notable changes to the VoiceAI Infra platform will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [v1.0.0] - 2026-11-24

### 🚀 Public Release: Enterprise Voice AI Infrastructure & Regulated Platform

#### 🧠 LLM Inference Gateway (`services/llm_gateway`, Port 8005)
- **OpenAI-Compatible Streaming Gateway**: Full `/v1/chat/completions` API supporting Server-Sent Events (SSE) streaming and real-time prompt stabilization.
- **Dynamic Routing & Fallback Ladder**: Evaluates policy profiles (`config/policies/*.yaml`) across Tier 0 (Exact Cache / Fast Path) -> Tier 1 (Local CPU/GPU) -> Tier 2 (Remote Frontier) -> Tier 3 (Deterministic Safe Mode).
- **Circuit Breaker**: Half-open trial transitions with configurable failure thresholds (3 errors/30s) avoiding live conversational stalls.
- **True Upstream Cancellation**: Instant subprocess/upstream stream abortion upon caller barge-in.
- **State-Gated Response Cache**: Sub-2ms exact-hash caching with dialogue-state mutation invalidation.
- **Zero-Restart Policy Hot-Reload**: `POST /reload` and authenticated Admin Policy API with atomic swap and last-known-good (`.lkg.yaml`) recovery.

#### 🛡️ Compliance Engine & Conformance
- **Deterministic Regulation Outside the Prompt**: Hard statutory calling hours, third-party disclosure bans, debt collection amount shields, and civility filters.
- **Cross-Language Guard Conformance (`@voice/guards-spec`)**: Unified package verifying Kanji (`四万八千円`), Zenkaku (`４８，０００円`), mixed, and Arabic currency parsing identically across TypeScript and Python.
- **Offline / Browser Tier WebGPU Fallback**: Degraded mode banner and client-side execution using WebLLM + Wasm Zipformer with `client_generated: true` audit tagging.

#### 📜 Tamper-Evident Audit Trail
- **Cryptographic Hash Chaining**: Sequential SHA-256 hash chaining on all Schema v2 records storing routing decisions, policy versions, and granular timing anatomy.
- **Ed25519 Chain-Head Signing**: Digital signature verification with automated verification CLI (`app/verify_audit.py`).
- **Discriminating Ablations**: Verified 0.0% compliance failure rate with guards active vs. 95.0% violation rate when ablated.

#### 📊 Public Inference Benchmark Suite (Voice Workloads B1–B7)
- **B1 Latency Anatomy**: Turn total $p_{50} = 652.5\text{ ms}$, $p_{95} = 684.8\text{ ms}$.
- **B2 Endpointing Sweep**: 350ms VAD hangover Pareto-optimal sweet spot.
- **B3 ASR Comparison**: Sherpa SenseVoice (178ms, RTF 0.06) vs. Parakeet vs. Whisper.
- **B4 Pod Concurrency Scaling**: Sustained 4 concurrent voice sessions per pod on CPU.
- **B5 Routing Policy Ablation**: 99.6% quality capture at 6.6x lower TTFT and 83.4% cost savings.
- **B6 Relative Pricing Model**: `config/pricing.yaml` mapping standardized inference costs.
- **B7 Public Benchmark Index**: Automated markdown matrix and ResultsViewer extension.

#### ☸️ Autoscaling & Production Deployment
- **Zero-Drop Scale-In Drain**: 900-second termination grace period with preStop `/drain` hook and 503 readiness probe failover.
- **KEDA ScaledObjects**: Scaling against active concurrent voice sessions (target: 4/pod) with latency guard ($p_{95} \le 1000\text{ ms}$).
- **Production Kubernetes Manifests**: CPU-first base deployment with optional GPU node pool overlay.
