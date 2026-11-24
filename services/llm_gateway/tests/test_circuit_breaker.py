"""
Tests for LLM Gateway Circuit Breaker & Fallback (Plan 1 Section 6 P2-T3).
Validates failure counting within rolling window, state transitions (CLOSED -> OPEN -> HALF_OPEN -> CLOSED),
cooldown elapsed probes, and router integration.
"""

import sys
import os
import time
import pytest

service_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if sys.path[0] != service_root:
    sys.path.insert(0, service_root)

from app.router.breaker import (
    BackendBreaker,
    CircuitState,
    CircuitBreakerRegistry
)
from app.router.engine import (
    RoutingInput,
    evaluate_routing_rule
)


def test_backend_breaker_state_transitions():
    """Validates CLOSED -> OPEN -> HALF_OPEN -> CLOSED lifecycle."""
    breaker = BackendBreaker(failure_threshold=3, window_s=10.0, cooldown_s=1.0)
    assert breaker.state == CircuitState.CLOSED
    assert breaker.is_available() is True

    # 1. First failure -> stays CLOSED
    breaker.record_failure()
    assert breaker.state == CircuitState.CLOSED
    assert breaker.is_available() is True

    # 2. Second failure -> stays CLOSED
    breaker.record_failure()
    assert breaker.state == CircuitState.CLOSED
    assert breaker.is_available() is True

    # 3. Third failure (threshold) -> trips to OPEN
    breaker.record_failure()
    assert breaker.state == CircuitState.OPEN
    assert breaker.is_available() is False

    # 4. Immediate probe while in cooldown -> still unavailable
    assert breaker.is_available() is False

    # 5. Simulate cooldown elapsed (fast-forward monotonic clock or wait)
    breaker.last_state_change -= 1.1  # simulate 1.1s elapsed (exceeding 1.0s cooldown)
    assert breaker.is_available() is True
    assert breaker.state == CircuitState.HALF_OPEN

    # 6. Successful trial request in HALF_OPEN -> circuit resets to CLOSED
    breaker.record_success()
    assert breaker.state == CircuitState.CLOSED
    assert breaker.is_available() is True
    assert len(breaker.failures) == 0


def test_backend_breaker_half_open_failure_reopens():
    """Trial probe failure in HALF_OPEN state must immediately re-open the circuit."""
    breaker = BackendBreaker(failure_threshold=2, window_s=10.0, cooldown_s=1.0)
    breaker.record_failure()
    breaker.record_failure()
    assert breaker.state == CircuitState.OPEN

    # Advance time past cooldown
    breaker.last_state_change -= 1.5
    assert breaker.is_available() is True
    assert breaker.state == CircuitState.HALF_OPEN

    # Failure during trial probe re-opens circuit
    breaker.record_failure()
    assert breaker.state == CircuitState.OPEN
    assert breaker.is_available() is False


def test_backend_breaker_rolling_window_expiry():
    """Failures that occurred outside window_s must expire and not count toward threshold."""
    breaker = BackendBreaker(failure_threshold=3, window_s=2.0, cooldown_s=1.0)

    # 2 failures in the past
    breaker.record_failure()
    breaker.record_failure()
    assert len(breaker.failures) == 2

    # Advance time past window (2.5s)
    breaker.failures[0] -= 3.0
    breaker.failures[1] -= 3.0

    # New failure occurs: old 2 must be pruned, total count is now 1 (not 3)
    breaker.record_failure()
    assert breaker.state == CircuitState.CLOSED
    assert breaker.is_available() is True
    assert len(breaker.failures) == 1


def test_circuit_breaker_registry_router_integration():
    """Tripped circuit in registry is reflected in router evaluation."""
    registry = CircuitBreakerRegistry(failure_threshold=2, window_s=10.0, cooldown_s=5.0)

    # Initially all tiers available
    assert registry.is_available("t1_local") is True
    assert "t1_local" not in registry.get_open_tiers()

    # Record 2 failures on t1_local
    registry.record_failure("t1_local")
    registry.record_failure("t1_local")
    assert registry.is_available("t1_local") is False
    assert "t1_local" in registry.get_open_tiers()

    # Router evaluation must avoid t1_local and fall back to t3_safe_mode
    policy = {
        "tiers": {
            "t1_local": {"backend": "ollama_local", "enabled": True},
            "t3_safe_mode": {"kind": "deterministic", "enabled": True}
        },
        "rules": [
            {"id": "r_default", "default": True, "use": "t1_local", "fallback": ["t3_safe_mode"]}
        ]
    }
    r_inp = RoutingInput(
        profile="default",
        circuit_open_tiers=registry.get_open_tiers()
    )
    dec = evaluate_routing_rule(policy, r_inp)
    assert dec.tier == "t3_safe_mode"
    assert "t1_local" in dec.fallback_chain
