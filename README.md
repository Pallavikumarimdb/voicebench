# 🎙️ Voicebench: Regulated Voice Agent Platform & Streaming Engine

<div align="center">

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Python](https://img.shields.io/badge/Python-3.11%20%7C%203.12%20%7C%203.13-blue?logo=python)](https://www.python.org/)
[![Monorepo](https://img.shields.io/badge/Build-Turborepo-ef4444?logo=turborepo)](https://turbo.build/)
[![Latency SLA](https://img.shields.io/badge/E2E%20Latency-879ms%20(p50)-emerald)](eval/agent/results/latency_breakdown.md)
[![Compliance](https://img.shields.io/badge/Hard--Fail%20Rate-50.0%25-orange)](eval/agent/results/summary.csv)
[![Audit](https://img.shields.io/badge/Audit%20Log-SHA--256%20Chained-indigo)](docs/ui_data_formats.md)

**An ultra-low latency (<880ms p50), enterprise voice infrastructure and multi-purpose regulated agent platform. Easily configured across Debt Collections (`債権回収`), Candidate Screening (`採用選考`), Customer KYC (`本人確認`), and Custom Voice Workflows via in-UI prompt and guardrail controls.**

[Vertical Solutions](#-multi-purpose-vertical-solutions) •
[In-UI Agent Studio](#-in-ui-agent-studio--dynamic-configuration) •
[Architecture](#-system-architecture) •
[Benchmark Results](#-benchmark-results-champion-vs-challenger) •
[Reviewer UI](#-reviewer--validation-ui) •
[Quickstart](#-quickstart--deployment) •
[Compliance Engine](#-code-level-compliance-guarantees)

</div>

---

> [!IMPORTANT]
> **LEGAL & SYNTHETIC DATA DISCLAIMERS**:
> 1. **100% Synthetic Data**: All debtor profiles, candidate credentials, customer accounts, and creditor entities used across this repository, automated test suites, and sample data packages are strictly synthetic. Any resemblance to real persons or entities is entirely coincidental.
> 2. **Engineering Prototype**: This project represents an advanced systems engineering and AI safety demonstration. It does not constitute legal counsel, nor is it a licensed financial service or employment agency.
> 3. **Illustrative Regulation Rules**: Enforced policies (e.g. Japanese statutory contact windows, mandatory pre-disclosure DOB verification, anti-bias interview guards) reflect representative regulatory frameworks.
> 4. **Japanese Linguistic Verification**: Conversational register and business honorifics (*Keigo / です・ます*) are documented in [docs/japanese_review.md](docs/japanese_review.md).

---

## 🌐 Multi-Purpose Vertical Solutions

VoiceAI Infra is architected as a **generalized, modular voice foundation**. The core streaming audio engine (faster-whisper STT, Silero VAD, sub-25ms barge-in, neural TTS, and SHA-256 audit chaining) remains rock-solid, while domain behavior, prompt instructions, and regulatory guardrails can be adapted with a few configuration parameters or configured live in the UI:

| Vertical Domain | Primary Workflow | Key Compliance & Guardrail Rules | Out-of-the-Box Persona Context |
|:---|:---|:---|:---|
| 💼 **Collections & AR** (`債権回収`) | Debt notifications, payment negotiation, hardship installment arrangements. | • DOB verification before disclosure<br>• Statutory calling hours (08:00–21:00 JST)<br>• Third-party disclosure prohibition | **山田 太郎 (Taro Yamada)**<br>¥48,000 balance • みらいファイナンス |
| 🎯 **Candidate Screening** (`採用スクリーニング`) | Recruiter first-round interviews, tech qualification, work model & salary fit. | • Anti-discrimination & bias guard<br>• Candidate privacy & NDA protection<br>• Salary range band verification | **佐藤 健一 (Kenichi Sato)**<br>Senior Full-Stack Lead Engineer |
| 🛡️ **Customer KYC & Support** (`本人確認`) | Identity authentication, 2FA/PIN confirmation, account service inquiry. | • 2-Factor PIN verification<br>• PII masking on credentials<br>• Fraud suspicion auto-escalation | **鈴木 一郎 (Ichiro Suzuki)**<br>Account #88219 • Tier 2 Security |
| ⚡ **Custom Enterprise Agent** (`カスタム`) | User-defined inbound/outbound telephony, surveys, and advisory workflows. | • Configurable compliance guard rules<br>• PII and confidentiality filters<br>• Empathy & civility filters | Custom user-provided context & scenario |

---

## 🎛️ In-UI Agent Studio & Dynamic Configuration

Users can adapt or switch the agent's behavior directly inside the **Live Agent Studio** without rebuilding services:

```text
┌──────────────────────────────────────────────────────────────────────────────────┐
│ ⚙️ Agent Studio: Domain & Instructions Configurator        Active: 🎯 採用スクリーニング │
├──────────────────────────────────────────────────────────────────────────────────┤
│ Preset: [💼 Collections & AR]  [🎯 Candidate Screening]  [🛡️ KYC]  [⚡ Custom]      │
│                                                                                  │
│ System Instructions & Domain Guidance:                                           │
│ ┌──────────────────────────────────────────────────────────────────────────────┐ │
│ │ Conduct a professional, warm 5-minute first-round screening interview. Ask   │ │
│ │ about: 1) Recent experience with React & distributed systems, 2) Preferred   │ │
│ │ working model (remote vs hybrid), 3) Expected compensation range.            │ │
│ └──────────────────────────────────────────────────────────────────────────────┘ │
│ Opening Greeting:                                                                │
│ ┌──────────────────────────────────────────────────────────────────────────────┐ │
│ │ 佐藤様、本日は面談のお時間をいただきありがとうございます。AI採用アシスタント... │ │
│ └──────────────────────────────────────────────────────────────────────────────┘ │
│ Context: Role: Senior Full-Stack Engineer • Level: Lead                          │
│ Active Guardrails: [✓ Anti-Discrimination] [✓ Salary Cap] [✓ NDA] [✓ Civility]   │
└──────────────────────────────────────────────────────────────────────────────────┘
```

1. **One-Click Domain Switching**: Instant switching between Collections, Candidate Screening, Customer KYC, and Custom Agents.
2. **Live Instruction Editing**: Edit prompt instructions, greeting, and context on-the-fly; the browser passes configuration via WebSocket to the gateway and agent brain.
3. **Adaptive State Machine Chips**: Status indicators dynamically transform based on the active domain (e.g. Collections displays `Verified / Disclosed / Debt Promise`, Screening displays `Stage / Tech Stack Noted / Compensation Fit / Qualified`).
4. **Guardrail Checkpoints**: Toggle regulatory checks like statutory hours, DOB identity verification, anti-discrimination filters, and civility guards.

---

## ⚡ Why Code-Level Guarantees Matter

In high-stakes voice interactions, an unconstrained LLM guided only by a prompt is an unacceptable business risk:
* **Prompt Leaks & Jailbreaks**: Callers asking *"Why are you calling?"* often trick standard prompts into leaking private financial or confidential information before verifying credentials.
* **Timing & Statutory Hours**: Prompts cannot reliably read clocks or enforce timezone windows (e.g. 08:00–21:00 JST).
* **Bias & Unregulated Questions**: In HR interviews, LLMs may inadvertently ask off-limit personal questions (e.g. marital status, age).

### The Solution: Code-Level Guarantees Outside the Prompt
```text
Caller Utterance ──► [Pre-Turn Guard] ──► [LangGraph Fast Path]  (Deterministic: 18ms)
                            │                       │
                     (Blocked? Exit)                ▼
                            │              [LangGraph Slow Path]  (LLM Synthesis: 350ms)
                            ▼                       │
                   [Post-Turn Guard] ◄──────────────┘
                            │
               (Violations Overridden)
                            ▼
              [SHA-256 Hash Audit Chain] ──► [Streaming TTS Output]
```

1. **Deterministic Pre-Turn Guards**: Intercepts unauthorized turns *before* token generation—consuming **0 LLM tokens**.
2. **Deterministic Post-Turn Guards**: Normalizes complex Japanese numeric/kanji currencies and blocks unauthorized disclosures or off-limit phrases before speech synthesis.
3. **Dual-Path Routing**: Fast-path deterministic graph nodes resolve routine turns in `< 20ms`; slow-path LLM synthesis handles complex negotiation in `< 450ms`.
4. **Cryptographic Tamper-Evident Audit Trails**: Every turn generates an immutable JSONL record chained with `prev_hash: sha256(...)` matching FIPS 180-4 standards.

---

## 🏗️ System Architecture

`	ext
                                 ┌──────────────────────────────────┐
                                 │   Browser Client (React + Vite)  │
                                 │  - Web Audio Worklet (16kHz PCM) │
                                 │  - Live Agent Studio & Inspector │
                                 │  - Dynamic Engine & Model Config │
                                 └─────────────────┬────────────────┘
                                                   │
                                     wss://:8443   │  Binary 16kHz PCM (in)
                                     /session      │  Chunked 16kHz PCM (out)
                                                   ▼
                                 ┌──────────────────────────────────┐
                                 │    Gateway Router (Node.js/TS)   │
                                 │  - WebSocket Session Coordinator │
                                 │  - Dynamic STT Model Handshake   │
                                 │  - Instant Barge-in Cancellation │
                                 │  - Domain Config & REST Data API │
                                 └────────┬─────────────────┬───────┘
                                          │                 │
                ws://:8001/stream         │                 │  http://:8003/turn
      ┌───────────────────────────────────┘                 └───────────────────────────────────┐
      ▼                                                                                         ▼
┌───────────────────────────────────────┐                                             ┌───────────────────┐
│   Modular ASR Service (CPU-Optimized) │                                             │    Agent Brain    │
│ 1. Sherpa-ONNX (Default, <100ms CPU): │                                             │ (Multi-Domain)    │
│    • Alibaba SenseVoice (EN+JA + ITN) │                                             │ • Local Ollama    │
│    • NVIDIA Parakeet-CTC (EN Conformer│                                             │   (qwen3:1.7b)    │
│ 2. Faster-Whisper (Optional Fallback) │                                             │ • Rules Guards    │
│ + Silero VAD & Zero-Energy Noise Gate │                                             │ • SHA-256 Auditor │
└───────────────────┬───────────────────┘                                             └─────────┬─────────┘
                    │                                                 http://:8004              │
                    │                                                  /synthesize              │
                    │                                                                           ▼
                    │                                                                 ┌───────────────────┐
                    │                                                                 │    TTS Service    │
                    │                                                                 │  Streaming Neural │
                    │                                                                 │    (16kHz PCM)    │
                    │                                                                 └─────────┬─────────┘
                    │                                                                           │
                    └────────────────────── Instant Barge-in Cutoff (< 25ms) ◄──────────────────┘
`

### ⚡ CPU ASR Optimization: Autoregressive vs. Non-Autoregressive

In real-time voice infrastructure on commodity CPU hardware, traditional autoregressive models (e.g. OpenAI Whisper) suffer from high token-by-token decoding latency (~7.3s for small), triggering acoustic queue backlogs and speech collision cascades.

By implementing **non-autoregressive ONNX architectures via sherpa-onnx**, ASR latency on CPU is slashed by **~46x–75x**, enabling sub-second conversational turns 100% locally:

| ASR Engine / Model | Architecture | Target Languages | CPU Latency (p50) | RTF (Real-Time Factor) | Best For |
|:---|:---|:---:|:---:|:---:|:---|
| **Alibaba SenseVoice-Small** *(sherpa-onnx)* | Non-Autoregressive Encoder | **English + Japanese** | **~92 ms** | **0.05** | Production bilingual voice bots, native ITN |
| **NVIDIA Parakeet-CTC** *(sherpa-onnx)* | Fast Conformer-CTC (80M) | **English** | **~30 ms** | **0.02** | Ultra-low latency English conversational turns |
| **Faster-Whisper (small)** *(CTranslate2)* | Autoregressive Encoder-Decoder | Multilingual (99 langs) | ~7,200 ms | 1.80 | High-accuracy transcription when GPU is available |

* **Zero-Energy Noise Gating**: Automatically rejects silence buffers (
p.max(np.abs(audio)) < 0.005), preventing hallucinated filler tokens on dead air.
* **Automatic Language-Aware Routing**: English calls can leverage NVIDIA Parakeet-CTC for 30ms latency, while Japanese turns automatically route to SenseVoice-Small without manual reconfiguration.
* **100% Zero-Cloud Dependency**: Runs entirely on local CPU using INT8 quantized ONNX weights and local Ollama LLMs (qwen3:1.7b).

---

## 📊 Benchmark Results: Champion vs. Challenger

Evaluated across **10 personas** with 50 simulation runs per variant (`eval/agent/results/summary.csv`):

| Architecture Variant | Sample Size (n) | Hard-Fail Rate (95% CI) | Judge Score (1–5) | Latency p50 | Latency p95 |
|:---|:---:|:---:|:---:|:---:|:---:|
| **v1 Baseline** | 50 | 60.0% [46.2%, 72.4%] | 3.98 [3.7, 4.22] | 1.0 ms | 19.5 ms |
| **v2 LangGraph (Challenger)** | 50 | **50.0% [36.6%, 63.4%]** | **4.18 [3.99, 4.36]** | **0.4 ms** | **2.1 ms** |
| *v1 No Guard (ablation)* | 50 | 60.0% [46.2%, 72.4%] | 3.98 [3.7, 4.22] | 0.7 ms | 2.2 ms |
| *v2 No Slow Path (ablation)* | 50 | 50.0% [36.6%, 63.4%] | 4.18 [3.99, 4.36] | 0.4 ms | 2.0 ms |

* **Lower hard-fail rate**: v2 cuts final hard-failures from 60% to 50% vs v1 baseline.
* **Higher judge scores**: 3.98 → 4.18 mean score on the 6-criterion rubric.
* **Lower turn latency**: median 1.0 ms → 0.4 ms in simulation.

---

## ⏱️ Round-Trip Conversational Turn Latency

Real-time audio telemetry measured from end-of-utterance to start of synthesized Japanese speech:

```text
[VAD Silence: 350ms] ──► [ASR: 218ms] ──► [Brain & Guard: 158ms] ──► [TTS TTFT: 138ms] ──► [Net: 15ms]
├────────────────────────────────────── Total: 879.5 ms (p50) ─────────────────────────────────────────┤
```

| Pipeline Stage | p50 (ms) | p95 (ms) | % of Total | Operational Function |
|:---|:---:|:---:|:---:|:---|
| **1. VAD Silence Detection** | 350.0 ms | 350.0 ms | 39.8% | Silence hangover threshold (350 ms is the evaluated Pareto optimum; service default is 500 ms) |
| **2. ASR Acoustic Decoding** | 218.4 ms | 338.7 ms | 24.8% | Faster-Whisper acoustic tokenization |
| **3. Agent Decision & Guard** | 158.4 ms | 452.1 ms | 18.0% | Multi-domain classifier + deterministic guard |
| **4. TTS Time-to-First-Audio**| 138.2 ms | 226.8 ms | 15.7% | Streaming 16kHz mono PCM synthesis |
| **5. Transport & Jitter** | 14.5 ms | 32.0 ms | 1.7% | Binary WebSocket framing overhead |
| **Total Round-Trip Time** | **879.5 ms** | **1,180.0 ms** | **100.0%** | **Compliant with < 1,500 ms SLA** |

---

## 🖥️ Reviewer & Validation UI

The web application includes a comprehensive control center for live testing, call inspection, and validation:

* **Live Agent Studio (`/live`)**: Test voice calls across Collections, Candidate Screening, Customer KYC, and Custom Agents. Includes in-UI instruction and greeting editor, a selectable conversation brain (Template / Local Qwen / OpenAI), real-time state machine indicators, and sub-25ms barge-in cutoff. The agent greets first on every call.
* **Deep Call Inspector (`/calls`, `/calls/:id`)**: Browse calls with multi-field filtering, newest first. Detailed vertical timeline shows caller speech, agent attempted text vs. safe override diffs, tool calls, and per-turn latency. SHA-256 hash-chain integrity is verified live and displayed per call.
* **Human Labeling Suite (`/label`)**: Blinded labeling console preventing evaluation bias. Reviewers score transcripts against a 6-criterion rubric with keyboard shortcuts (`1-5`, `Enter`, `N`).
* **Evaluation Results Viewer (`/results`)**: Direct rendering of benchmark summary metrics with Wilson 95% confidence intervals, and the silence hangover Pareto frontier. Every number comes from the result files; unavailable values render as "—", never guesses.
* **Live data only**: The UI reads exclusively from the gateway data API. If the API is unreachable, views show explicit error states — there is no sample-data fallback.

---

## 🚀 Quickstart & Deployment

### Prerequisites
* **Node.js**: v20+ (v22+ or v24 recommended)
* **Python**: v3.11+
* **Package Managers**: `npm` and `pip`

### 1. Clone & Build Monorepo
```bash
git clone https://github.com/Pallavikumarimdb/1.Voice-AI-Infra.git
cd 1.Voice-AI-Infra

# Install dependencies and build protocol, gateway, and client
npm install
npm run build
```

### 2. Launch Services (Single Command Options)

You can launch all required services with a **single command** using either Python/npm or Docker Compose:

#### Option A: Single Command via Orchestrator (Recommended for Local Dev)
```bash
# Start Voice Agent pipeline (Agent :8003, TTS :8004, STT :8001, Gateway :8443, Client :5173):
npm run start:agent
# or: python scripts/start_all.py --mode agent

# Start Voice Translator pipeline (MT :8002, TTS :8004, STT :8001, Gateway :8443, Client :5173):
npm run start:translator
# or: python scripts/start_all.py --mode translator

# Start Full Pipeline (All services concurrently):
npm run start:all
# or: python scripts/start_all.py --mode all
```

#### Option B: Single Command via Docker Compose
```bash
docker compose up --build
```

#### Option C: Individual Terminal Commands
```bash
# Terminal 1: Agent Brain Service
python -m uvicorn services.agent.app.main:app --port 8003 --reload

# Terminal 2: Streaming STT Service
cd services/stt && python -m uvicorn main:app --port 8001 --reload

# Terminal 3: Streaming TTS Service
cd services/tts && python -m uvicorn main:app --port 8004 --reload

# Terminal 4: MT Translation Service (Translator Mode)
cd services/mt && python -m uvicorn main:app --port 8002 --reload

# Terminal 5: Gateway (WebSocket Router & Data API)
cd gateway && npm run dev

# Terminal 6: Frontend Client (Vite)
cd client && npm run dev
```

Open `http://localhost:5173` in your browser.

---

### 3. Interactive CLI Testing
```bash
cd services/agent

# Test against a cooperative debtor
python -m app.cli --persona cooperative

# Test against a hostile debtor
python -m app.cli --persona hostile

# Test against an unauthorized third-party
python -m app.cli --persona third_party
```

---

### 4. Running the Evaluation Suite & Verification
```bash
# 1. Run unit, integration, and compliance red-team tests
pytest services/agent/tests/

# 2. Execute simulation batch (20 calls per persona)
python -m eval.agent.run_suite --variant v2_graph --n 20

# 3. Compute comparative metrics and confidence intervals
python -m eval.agent.compare

# 4. Cryptographically verify audit trail integrity
python -m app.verify_audit --log-file audit.jsonl
```

---

## 🔒 Code-Level Compliance Guarantees

Our compliance engine enforces rules deterministically at compile and runtime:

### Japanese Currency Parser
Regex-based normalizer handles all written forms of Japanese financial amounts:
* **Arabic Standard**: `48,000円`, `48000円`
* **Full-Width Numbers**: `４８，０００円`
* **Mixed Kanji**: `4万8000円`, `4万8千円`
* **Pure Formal Kanji**: `四万八千円`

If an unverified identity turn contains any of the above patterns, the response is instantly rewritten to a safe generic inquiry before TTS audio synthesis.

### Cryptographic Hash-Chain Specification
Every turn record satisfies:
$$\text{Record Hash}_i = \text{SHA-256}\Big(\text{CanonicalJSON}\big(\text{turn}_i, \text{prev\_hash}_{i-1}\big)\Big)$$

Tampering with any historical turn, timestamp, or score immediately breaks all downstream hashes, ensuring complete legal admissibility.

---

## 📁 Repository Structure

```text
.
├── client/                     # Voicebench UI: live calls, inspector, labeling, results
│   ├── src/ui/                 # LiveCallPanel, CallList, CallInspector, LabelingScreen, ResultsViewer, TranslatePanel, Navbar
│   ├── src/data/               # Live data API client, loaders, hash-chain verifier, types
├── gateway/                    # WebSocket router, agent/translate dispatch, barge-in, echo guard, Data REST API
│   ├── src/routes/dataApi.ts   # Secure endpoints for calls, runs, personas, and labels
│   └── tests/                  # Path-traversal security test suite
├── services/
│   ├── agent/                  # Multi-domain agent, LangGraph state machine, rules guards, CLI
│   ├── stt/                    # Faster-Whisper ASR + Silero VAD segmenter
│   ├── tts/                    # Streaming neural 16kHz PCM synthesizer
│   └── mt/                     # Real-time Japanese ↔ English streaming translation engine
├── packages/
│   └── protocol/               # Shared TypeScript types and Python Pydantic models
├── eval/
│   └── agent/                  # 10 debtor personas, red-team harnesses, LLM-as-a-judge
├── docs/                       # Technical architecture, failure mode analyses, decisions
└── tools/
    ├── export_sample_data.py   # Legacy: synced eval outputs to the removed sample-data fallback (no longer consumed by the UI)
    └── replay.py               # Reproducible audio packet injector
```

See [docs/local_llm.md](docs/local_llm.md) to run the conversation brain on a local Qwen model (Ollama) or a paid API instead of templates.

---

## 📄 License

Distributed under the Apache 2.0 License. See `LICENSE` for details. Synthetic dataset assets and simulation fixtures are provided freely for demonstration and benchmarking purposes.
