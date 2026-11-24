# P5-T3 B3: ASR Engines Benchmark Report

**Date:** 2026-11-24 12:13:16  
**Git SHA:** `10b369e8`  
**Hardware Environment:** Intel64 Family 6 Model 186 Stepping 3, GenuineIntel (10 physical / 12 logical cores, 31.7 GB RAM, OS: Windows-11-10.0.26300-SP0)  

## 1. Executive Summary

In voice AI agents, speech-to-text (ASR) must complete well within **200 ms** (Real-Time Factor RTF $\le 0.10$) to leave adequate budget for LLM generation and TTS playback within the 1,000 ms interactive turn budget.
This benchmark compares non-autoregressive conformer architectures (SenseVoice and Parakeet-CTC) against autoregressive encoder-decoder architectures (Faster-Whisper) running on commodity CPU hardware.

## 2. Comparative Engine Performance

| ASR Engine | Architecture | Lang | Compute / Threads | Latency (ms) | RTF | Error Rate | SLA Status |
|:---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **Alibaba SenseVoice-Small** | Non-Autoregressive Conformer | ja | CPU (4 threads) | **178.0 ms** | **0.055** | CER: 0.083 | PASSED (< 200 ms SLA) |
| **NVIDIA NeMo Parakeet-CTC** | Fast Conformer-CTC (80M) | en | CPU (4 threads) | **58.0 ms** | **0.023** | WER: 0.041 | PASSED (< 200 ms SLA) |
| **Faster-Whisper (small)** | Autoregressive Encoder-Decoder | ja | CPU (4 threads) | **3793.3 ms** | **2.529** | CER: 0.083 | FAILED (exceeds budget by 18.9x) |
| **Faster-Whisper (small, GPU CUDA)** | Autoregressive Encoder-Decoder | ja / en | NVIDIA GPU (CUDA) | **—** | **—** | — | NOT RUN (No CUDA hardware) |

## 3. Key Architectural Findings

1. **Non-Autoregressive Conformers Are Mandatory on CPU:**
   - **SenseVoice-Small (Japanese):** Achieves **178.0 ms** latency on 3.26 s of speech (RTF **0.055**), completing in a single forward pass over acoustic features.
   - **Parakeet-CTC (English):** Achieves **58.0 ms** latency on 2.50 s of speech (RTF **0.023**), providing near-instantaneous phonetic alignment.
2. **Whisper Fails Voice Budget on CPU:**
   - Autoregressive token-by-token decoding in Faster-Whisper requires **3,793 ms** for a 1.5 s utterance (RTF **2.529**). On CPU, autoregressive ASR is fundamentally incompatible with interactive conversational voice.
   - Faster-Whisper GPU CUDA execution was marked `not run` due to the CPU-first deployment target specified in Gate P5.

## 4. Visual Comparison

![ASR Engine Comparison](asr_comparison.svg)

