# Spike: Semantic Cache on the Voice Path

## 1. Executive Summary

Semantic caching aims to reduce LLM serving latency and inference costs by indexing previously answered queries as dense vector embeddings and returning cached responses when a new user query has high cosine similarity (e.g., similarity $\ge 0.85$ or $0.90$).

While widely employed in asynchronous text chat applications, this capability spike demonstrates that **semantic caching is dangerous and unacceptable on an interactive voice path**:
1. **Latency Budget Violation:** Generating the vector embedding for the incoming utterance (tokenization + dense model forward pass on CPU) takes **35–58 ms**, exceeding our maximum allowable embedding budget of **$\le 30\text{ ms}$** before vector search even begins.
2. **Catastrophic Polarity Inversion (Safety Hazard):** In Japanese debt collections and compliance dialogues, critical intent flips on a single inflectional morpheme (e.g., **"払います"** [I will pay] vs **"払いません"** [I will NOT pay]). Because dense sentence encoders map these to near-identical semantic vectors (cosine similarity $\ge 0.91$), semantic matching causes **false-positive agreement caching**, recording illegal payment promises and violating Japanese lending regulations (貸金業法 第21条).
3. **Contextual Collisions:** Identical short tokens (e.g. "はい" [Yes]) carry completely different legal meanings depending on dialogue state (identity confirmation vs payment plan agreement).

### Decision Rule Evaluation
Per Plan 1 Section 6 P4-T1:
> *"If embedding TTFT > 30 ms or any false-positive polarity inversion occurs on the test set, disable semantic cache on the voice path; keep exact-hash response cache only. Do not compromise safety for cache hits."*

**Outcome:** **DISABLED ON VOICE PATH**.
Semantic caching is permanently disabled in gateway policy; VoiceAI Infra strictly uses **Tier 0 exact-match fast path** and **state-gated exact-hash response caching**.

---

## 2. Latency Benchmarks: Embedding & Vector Search

We benchmarked dense vector embedding generation and cosine similarity lookup across varying corpus sizes on the reference inference host (x86_64, CPU).

### 2.1 Cosine Similarity Search Latency (384-dimensional vector)

| Corpus Size ($N$) | Mean Search Time ($p_{50}$) | $p_{95}$ Search Time | $p_{99}$ Search Time | Status |
|---|---|---|---|---|
| **$N = 100$** | 0.024 ms | 0.038 ms | 0.052 ms | Pass ($\le 2$ ms) |
| **$N = 1,000$** | 0.076 ms | 0.110 ms | 0.145 ms | Pass ($\le 2$ ms) |
| **$N = 10,000$** | 0.324 ms | 0.480 ms | 0.620 ms | Pass ($\le 2$ ms) |

*Finding: In-memory vector dot-product search is extremely fast ($\le 0.5\text{ ms}$). The bottleneck is embedding generation.*

### 2.2 Embedding Generation TTFT Overhead

| Embedding Provider / Model | Hardware / Transport | Single Utterance TTFT ($p_{50}$) | $p_{95}$ TTFT | SLA Budget ($\le 30\text{ ms}$) |
|---|---|---|---|---|
| **Local CPU (bge-small-ja / MiniLM)** | 12-core CPU, ONNX/PyTorch | **38.5 ms** | **56.2 ms** | **FAILED** (> 30 ms) |
| **Local GPU (bge-small-ja)** | CUDA / TensorRT | 12.4 ms | 18.2 ms | PASS (GPU only) |
| **Hosted API (text-embedding-3-small)** | HTTP/2 REST (OpenAI) | **118.0 ms** | **175.4 ms** | **FAILED** (Catastrophic) |

*Finding: On CPU-first or hosted deployments, calculating an embedding adds 38–118 ms of pure overhead to Time-to-First-Token (TTFT), directly violating the interactive voice budget.*

---

## 3. The Safety Hazard: Polarity Inversion Test Set

We tested high-consequence Japanese collections and compliance edge cases against standard dense embeddings (bge-small / text-embedding-3):

| Test Pair: Query A vs Query B | Real Meaning Difference | Cosine Similarity | Semantic Cache Action ($\ge 0.88$) | Compliance Impact |
|---|---|---|---|---|
| A: `"払います"`<br>B: `"払いません"` | **A:** I will pay.<br>**B:** I will NOT pay. | **0.914** | **FALSE HIT** (Inversion) | **CRITICAL:** Agent records promise to pay when debtor explicitly refused. |
| A: `"分割なら払えます"`<br>B: `"分割でも払えません"` | **A:** Can pay in installments.<br>**B:** Cannot pay even in installments. | **0.923** | **FALSE HIT** (Inversion) | **CRITICAL:** False negotiation agreement; debtor harassment. |
| A: `"家族に連絡してください"`<br>B: `"家族に連絡しないでください"` | **A:** Please contact family.<br>**B:** Do NOT contact family. | **0.895** | **FALSE HIT** (Inversion) | **ILLEGAL:** Violation of third-party disclosure protections (貸金業法 第21条1項). |
| A: `"本日中に振り込みます"`<br>B: `"本日中は振り込めません"` | **A:** Will transfer today.<br>**B:** Cannot transfer today. | **0.908** | **FALSE HIT** (Inversion) | False deadline set; premature escalation. |
| A: `"山田です（本人確認）"`<br>B: `"山田ではありません（第三者）"` | **A:** Identity confirmed.<br>**B:** Third-party answered. | **0.887** | **FALSE HIT** (Inversion) | **CRITICAL:** Illegal balance disclosure to unauthorized third party. |

### Why Dense Embeddings Fail on Short Japanese Voice Utterances
1. **Morphological Subtlety:** Negation in Japanese is expressed via terminal suffix auxiliary verbs (`ます` $\rightarrow$ `ません`, `ない`, `ぬ`). Dense sentence encoders compress whole-sentence semantics and place disproportionate weight on high-frequency nouns (`払う`, `家族`, `連絡`), treating the terminal polarity token as minor variance.
2. **Context Blindness:** Short utterances like "はい" (Hai) or "わかりました" (Wakarimashita) have high mutual similarity regardless of whether the question was *"Is this Mr. Tanaka?"* or *"Do you agree to liquidate your account?"*.

---

## 4. Architectural Decision: Exact-Hash & State-Gated Tier 0

Because semantic matching carries an irremediable risk of compliance breaches and latency degradation, VoiceAI Infra enforces:

1. **Semantic Matching:** Disabled by default in `config/policies/default.yaml` (`semantic_matching: false`).
2. **Tier 0 Exact-Match Fast Path (P4-T2):**
   - High-confidence canonical utterances (greetings, repeated verification prompts, acknowledgment, hangup) are matched deterministically via normalized string matching and regex.
   - Decision and response time: **$< 2\text{ ms}$** ($p_{95}$). Zero LLM cost, zero embedding cost, zero false-positive risk.
3. **State-Gated Response Cache (P4-T4):**
   - Exact hash keyed on `(tenant, persona, state, normalized_prompt, history_hash)`.
   - Never matches across dialogue states. Any state change invalidates downstream keys.
