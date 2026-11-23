#!/usr/bin/env python3
"""
Honest Latency Report Generator for VoiceAI Infra.
Computes true per-turn end-to-end percentiles and stage breakdowns from latency_traces.jsonl.
Complies with Statistical Standards in plan1.md:
- Discards warmup turns
- True per-turn total distribution (never sums of percentiles)
- Bootstrap 95% confidence intervals for mean, p50, p95
- Formats markdown breakdown table + JSON summary
"""

import os
import sys
import json
import argparse
import numpy as np
from typing import Dict, Any, List, Tuple, Optional

def bootstrap_ci(
    data: np.ndarray,
    stat_fn=np.median,
    n_bootstrap: int = 1000,
    alpha: float = 0.05,
    seed: int = 42
) -> Tuple[float, float]:
    """Computes two-sided bootstrap confidence interval for a statistic."""
    if len(data) == 0:
        return (0.0, 0.0)
    rng = np.random.default_rng(seed)
    boot_stats = []
    n = len(data)
    for _ in range(n_bootstrap):
        sample = rng.choice(data, size=n, replace=True)
        boot_stats.append(stat_fn(sample))
    low = float(np.percentile(boot_stats, 100.0 * (alpha / 2.0)))
    high = float(np.percentile(boot_stats, 100.0 * (1.0 - alpha / 2.0)))
    return (round(low, 2), round(high, 2))

def analyze_traces(
    traces_path: str,
    output_dir: Optional[str] = None
) -> Dict[str, Any]:
    if not os.path.exists(traces_path):
        raise FileNotFoundError(f"Traces file not found: {traces_path}")

    records: List[Dict[str, Any]] = []
    with open(traces_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                records.append(json.loads(line))
            except json.JSONDecodeError:
                continue

    total_records = len(records)
    valid_turns = [r for r in records if not r.get("flags", {}).get("is_warmup", False)]
    warmup_count = total_records - len(valid_turns)

    if not valid_turns:
        raise ValueError("No valid non-warmup turns found in trace file")

    # Extract true per-turn total latencies
    total_e2e = np.array([float(r["total_e2e_ms"]) for r in valid_turns if "total_e2e_ms" in r])
    n = len(total_e2e)

    # Compute percentiles for total
    p50_total = float(np.percentile(total_e2e, 50))
    p90_total = float(np.percentile(total_e2e, 90))
    p95_total = float(np.percentile(total_e2e, 95))
    p99_total = float(np.percentile(total_e2e, 99))
    mean_total = float(np.mean(total_e2e))

    # Bootstrap CIs for total
    ci_mean = bootstrap_ci(total_e2e, np.mean)
    ci_p50 = bootstrap_ci(total_e2e, np.median)
    ci_p95 = bootstrap_ci(total_e2e, lambda x: np.percentile(x, 95))

    # Stage breakdown percentiles
    stage_names = [
        "vad_hangover_ms",
        "asr_ms",
        "pre_guard_ms",
        "llm_ttft_ms",
        "llm_total_ms",
        "post_guard_ms",
        "tts_first_audio_ms",
        "transport_ms"
    ]

    stage_stats: Dict[str, Dict[str, float]] = {}
    for stage in stage_names:
        vals = [float(r["stages"][stage]) for r in valid_turns if "stages" in r and stage in r["stages"]]
        arr = np.array(vals) if vals else np.array([0.0])
        stage_stats[stage] = {
            "mean": round(float(np.mean(arr)), 2),
            "p50": round(float(np.percentile(arr, 50)), 2),
            "p90": round(float(np.percentile(arr, 90)), 2),
            "p95": round(float(np.percentile(arr, 95)), 2),
        }

    summary = {
        "sample_size_total": total_records,
        "warmup_discarded": warmup_count,
        "sample_size_evaluated": n,
        "turn_total_ms": {
            "mean": round(mean_total, 2),
            "ci_mean_95": ci_mean,
            "p50": round(p50_total, 2),
            "ci_p50_95": ci_p50,
            "p90": round(p90_total, 2),
            "p95": round(p95_total, 2),
            "ci_p95_95": ci_p95,
            "p99": round(p99_total, 2),
        },
        "stages": stage_stats,
    }

    # Format Markdown
    stage_labels = {
        "vad_hangover_ms": ("1. VAD Silence Hangover", "Silence threshold before declaring turn end"),
        "asr_ms": ("2. ASR Finalization", "Speech acoustic recognition (SenseVoice / Whisper)"),
        "pre_guard_ms": ("3. Pre-Turn Guard", "Calling hours, stop contact, third party check"),
        "llm_ttft_ms": ("4. LLM Time-to-First-Token", "LLM Gateway / Local Model TTFT"),
        "llm_total_ms": ("5. LLM Total Generation", "Full token generation completed by LLM"),
        "post_guard_ms": ("6. Post-Turn Guard", "Deterministic regex & Japanese amount parsing"),
        "tts_first_audio_ms": ("7. TTS First Audio Chunk", "Neural synthesis to first playable 50ms PCM frame"),
        "transport_ms": ("8. Transport / Jitter", "WebSocket dispatch & client audio buffer enqueue"),
    }

    md_lines = [
        "# VoiceAI Infra — True Turn Latency Breakdown",
        "",
        f"**Sample Size:** n={n} valid turns (warmup turns discarded: {warmup_count})  ",
        f"**Target SLA:** Turn budget < 1,500 ms (p95)",
        "",
        "## True Per-Turn Total Latency Distribution",
        "",
        "*(Calculated as discrete end-to-end turn measurements, NOT sums of stage percentiles)*",
        "",
        "| Metric | Measured (ms) | 95% Bootstrap CI |",
        "|:---|:---:|:---:|",
        f"| **Mean** | {summary['turn_total_ms']['mean']:.1f} ms | [{ci_mean[0]:.1f}, {ci_mean[1]:.1f}] ms |",
        f"| **p50 (Median)** | {summary['turn_total_ms']['p50']:.1f} ms | [{ci_p50[0]:.1f}, {ci_p50[1]:.1f}] ms |",
        f"| **p90** | {summary['turn_total_ms']['p90']:.1f} ms | — |",
        f"| **p95** | {summary['turn_total_ms']['p95']:.1f} ms | [{ci_p95[0]:.1f}, {ci_p95[1]:.1f}] ms |",
        f"| **p99** | {summary['turn_total_ms']['p99']:.1f} ms | — |",
        "",
        "## Per-Stage Latency Breakdown",
        "",
        "| Pipeline Stage | Mean (ms) | p50 (ms) | p90 (ms) | p95 (ms) | Description |",
        "|:---|:---:|:---:|:---:|:---:|:---|",
    ]

    for stage_key in stage_names:
        name, desc = stage_labels.get(stage_key, (stage_key, ""))
        st = stage_stats[stage_key]
        md_lines.append(
            f"| **{name}** | {st['mean']:.1f} | {st['p50']:.1f} | {st['p90']:.1f} | {st['p95']:.1f} | {desc} |"
        )

    md_lines.extend([
        "",
        "---",
        "### Statistical Note on Percentile Non-Additivity",
        "Notice that summing the individual stage percentiles does not equal the measured total turn percentiles. "
        "Due to concurrency overlap and variance correlation across stages, summing percentiles creates an artificial mathematical artifact. "
        "The figures above reflect empirical end-to-end turn measurements."
    ])

    report_md = "\n".join(md_lines)

    if output_dir:
        os.makedirs(output_dir, exist_ok=True)
        with open(os.path.join(output_dir, "latency_breakdown.json"), "w", encoding="utf-8") as f:
            json.dump(summary, f, indent=2)
        with open(os.path.join(output_dir, "latency_breakdown.md"), "w", encoding="utf-8") as f:
            f.write(report_md)

    return summary

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Analyze VoiceAI Infra latency traces")
    parser.add_argument("--traces", type=str, default="eval/inference/latency/latency_traces.jsonl", help="Path to latency_traces.jsonl")
    parser.add_argument("--out-dir", type=str, default="eval/inference/latency", help="Directory for output files")
    args = parser.parse_args()

    res = analyze_traces(args.traces, args.out_dir)
    print(f"[Latency Analysis] Analyzed {res['sample_size_evaluated']} turns.")
    print(f"  Total Turn p50: {res['turn_total_ms']['p50']} ms (95% CI: {res['turn_total_ms']['ci_p50_95']})")
    print(f"  Total Turn p95: {res['turn_total_ms']['p95']} ms (95% CI: {res['turn_total_ms']['ci_p95_95']})")
