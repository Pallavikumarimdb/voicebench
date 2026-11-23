# Spike: Qwen Reasoning Tokens on the Voice Path

## 1. Executive Summary

Reasoning and distilled reasoning models (such as Qwen 2.5-Coder, Qwen-QwQ, DeepSeek-R1-Distill-Qwen, and Qwen 3 experimental reasoning checkpoints) output chain-of-thought tokens enclosed within `<think>...</think>` tags prior to generating the user-visible response.

While beneficial for complex offline reasoning and mathematics, **reasoning tokens on an interactive voice path are catastrophic**:
1. **Severe TTFT Inflation:** Emitting 150–350 internal monologue tokens prior to the first conversational token increases Time-to-First-Token (TTFT) by **10x to 20x**, completely blowing past our voice budget of **< 250 ms TTFT** (and < 800 ms end-to-end latency).
2. **Acoustic & Compliance Hazard:** If reasoning chunks stream directly into TTS without filtering, the caller hears the agent's internal monologue (e.g. *"Okay, debtor claims they cannot pay due to illness. I must check FDCPA rules and formulate a compliant payment plan..."*).

In VoiceAI Infra, reasoning tokens are **strictly disabled and filtered** on the voice path.

---

## 2. Benchmark & Measured TTFT Difference

We benchmarked a voice turn (rephrasing a verification prompt in English and Japanese) on a CPU-first inference host across two configurations:
1. **Reasoning Tokens Active:** Model permitted to generate `<think>...</think>` chain-of-thought before speaking.
2. **Reasoning Tokens Suppressed:** Prompt-level suppression directive + gateway streaming filter.

### Measured Latency & Token Metrics

| Metric | Reasoning Active (`<think>` enabled) | Reasoning Suppressed (Voice Path) | Delta / Speedup |
|---|---|---|---|
| **Pre-Spoken Tokens Generated** | 184 tokens (internal monologue) | 0 tokens | -184 tokens |
| **LLM TTFT ($p_{50}$)** | **2,150 ms** | **145 ms** | **14.8x faster** |
| **LLM TTFT ($p_{95}$)** | **3,890 ms** | **220 ms** | **17.7x faster** |
| **LLM Total Generation ($p_{50}$)** | 2,740 ms | 310 ms | 8.8x faster |
| **End-to-End Perceived Latency ($p_{50}$)** | **2,980 ms** (BLOWN) | **565 ms** (PASS) | **Budget Compliant** |
| **Spoken Content Integrity** | Leaked internal thought risk | 100% clean spoken dialog | Guarded |

*Hardware: 12-core x86_64 CPU, 32GB RAM, quantized local model (`qwen3:1.7b` / `qwen2.5:1.5b`), prompt length: 280 tokens.*

---

## 3. Mitigation & Suppression Architecture

VoiceAI Infra implements a 3-layer defense against reasoning token inflation on the voice path:

### Layer 1: Prompt-Level Directives
In `services/agent/app/generalized.py` and prompt templates, static prefixes instruct the model to respond concisely for speech without preamble or thought tags:
```text
Rephrase the AGENT LINE below naturally for spoken conversation in 1-2 short sentences.
Respond directly and concisely for spoken voice without internal monologue or <think> tags.
```

### Layer 2: LLM Gateway Real-Time Streaming Filter
In `services/llm_gateway/app/api/chat.py` (`_run_stream`):
- The streaming generator detects incoming `<think>` tags and buffers/discards internal tokens until `</think>` is reached.
- The `voiceai_llm_ttft_seconds` metric observes the timestamp of the **first spoken conversational token**, not the first internal reasoning token.
- Downstream WebSocket consumers (audio TTS streamer) receive only pure conversational chunks.

### Layer 3: Non-Streaming & Fallback Filter
In `services/llm_gateway/app/adapters/base.py`:
`strip_thinking_tokens()` cleanses any residual reasoning tags and content:
```python
def strip_thinking_tokens(text: str) -> str:
    cleaned = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL)
    if "<think>" in cleaned:
        cleaned = re.sub(r"<think>.*$", "", cleaned, flags=re.DOTALL)
    return cleaned.strip()
```

---

## 4. Conclusion & Policy Rule

For interactive voice calls, chain-of-thought reasoning must be performed **either**:
1. Completely out-of-band on a background slow-path (e.g. strategy generation in parallel while the fast-path acknowledges the user), or
2. Suppressed entirely on the per-turn conversational hot path.

Any local or hosted model deployed on the voice serving tier must have reasoning tokens suppressed to maintain compliance with the 250 ms TTFT and 800 ms perceived latency budgets.
