"""
Prometheus metrics definition per Plan 1 Section 5.4.
Exposes standard Prometheus metric types mounted at /metrics.
"""

from prometheus_client import (
    Counter,
    Gauge,
    Histogram,
    generate_latest,
    CONTENT_TYPE_LATEST
)

# Active concurrent sessions
voiceai_active_sessions = Gauge(
    "voiceai_active_sessions",
    "Current number of active voice sessions"
)

# Total requests processed by the LLM Gateway
voiceai_llm_requests_total = Counter(
    "voiceai_llm_requests_total",
    "Total requests handled by the LLM gateway",
    ["backend", "model", "tier", "status"]
)

# Time to First Token (TTFT)
voiceai_llm_ttft_seconds = Histogram(
    "voiceai_llm_ttft_seconds",
    "Time to First Token in seconds",
    buckets=[0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 0.75, 1.0, 1.5, 2.0]
)

# Cancel propagation latency
voiceai_llm_cancel_latency_seconds = Histogram(
    "voiceai_llm_cancel_latency_seconds",
    "Time from cancel signal to upstream abort in seconds",
    buckets=[0.01, 0.025, 0.05, 0.075, 0.1, 0.15, 0.2, 0.3, 0.5]
)

# Tier fallbacks
voiceai_fallback_total = Counter(
    "voiceai_fallback_total",
    "Total routing fallback events",
    ["from_tier", "to_tier", "reason"]
)

# Cache hits and misses
voiceai_cache_total = Counter(
    "voiceai_cache_total",
    "Cache lookups by kind and result",
    ["kind", "result"]
)

# Guard overrides on outputs
voiceai_guard_override_total = Counter(
    "voiceai_guard_override_total",
    "Total guard overrides triggered",
    ["rule_id", "stage"]
)

# End-to-end turn latency
voiceai_turn_latency_seconds = Histogram(
    "voiceai_turn_latency_seconds",
    "Total turn latency from speech end to first audio in seconds",
    buckets=[0.2, 0.4, 0.6, 0.8, 1.0, 1.2, 1.5, 2.0, 3.0]
)

# Time to First Audio
voiceai_ttfa_seconds = Histogram(
    "voiceai_ttfa_seconds",
    "Time to First Audio played in seconds",
    buckets=[0.1, 0.2, 0.25, 0.3, 0.4, 0.5, 0.75, 1.0]
)
