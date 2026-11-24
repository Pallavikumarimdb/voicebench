"""
Circuit Breaker and TTFT Budget Manager (Plan 1 Section 6 P2-T3).
Implements per-backend failure tracking (failures / window / cooldown),
state transitions (CLOSED, OPEN, HALF_OPEN), and TTFT budget deadlines.
"""

import time
from typing import Dict, List, Optional, Set
from enum import Enum


class CircuitState(str, Enum):
    CLOSED = "CLOSED"
    OPEN = "OPEN"
    HALF_OPEN = "HALF_OPEN"


class BackendBreaker:
    def __init__(self, failure_threshold: int = 3, window_s: float = 30.0, cooldown_s: float = 20.0):
        self.failure_threshold = failure_threshold
        self.window_s = window_s
        self.cooldown_s = cooldown_s
        self.failures: List[float] = []
        self.state: CircuitState = CircuitState.CLOSED
        self.last_state_change: float = time.monotonic()

    def record_success(self):
        """Records a successful call. Closes circuit if half-open."""
        if self.state == CircuitState.HALF_OPEN:
            self.state = CircuitState.CLOSED
            self.failures.clear()
            self.last_state_change = time.monotonic()
        elif self.state == CircuitState.CLOSED:
            # Clean up old failures outside window
            now = time.monotonic()
            self.failures = [t for t in self.failures if now - t <= self.window_s]

    def record_failure(self):
        """Records a failure. Trips circuit to OPEN if threshold reached."""
        now = time.monotonic()
        if self.state == CircuitState.HALF_OPEN:
            # Trial failed: re-open circuit
            self.state = CircuitState.OPEN
            self.last_state_change = now
            return

        self.failures.append(now)
        # Prune failures outside rolling window
        self.failures = [t for t in self.failures if now - t <= self.window_s]

        if len(self.failures) >= self.failure_threshold:
            self.state = CircuitState.OPEN
            self.last_state_change = now

    def is_available(self) -> bool:
        """Returns True if the backend can accept traffic (CLOSED or cooldown elapsed -> HALF_OPEN)."""
        now = time.monotonic()
        if self.state == CircuitState.CLOSED:
            return True

        if self.state == CircuitState.OPEN:
            if now - self.last_state_change >= self.cooldown_s:
                # Transition to HALF_OPEN for trial probe
                self.state = CircuitState.HALF_OPEN
                self.last_state_change = now
                return True
            return False

        if self.state == CircuitState.HALF_OPEN:
            return True

        return False

    def reset(self):
        self.failures.clear()
        self.state = CircuitState.CLOSED
        self.last_state_change = time.monotonic()


class CircuitBreakerRegistry:
    def __init__(self, failure_threshold: int = 3, window_s: float = 30.0, cooldown_s: float = 20.0):
        self.default_threshold = failure_threshold
        self.default_window_s = window_s
        self.default_cooldown_s = cooldown_s
        self._breakers: Dict[str, BackendBreaker] = {}

    def get_breaker(self, backend_or_tier: str) -> BackendBreaker:
        if backend_or_tier not in self._breakers:
            self._breakers[backend_or_tier] = BackendBreaker(
                failure_threshold=self.default_threshold,
                window_s=self.default_window_s,
                cooldown_s=self.default_cooldown_s
            )
        return self._breakers[backend_or_tier]

    def is_available(self, backend_or_tier: str) -> bool:
        return self.get_breaker(backend_or_tier).is_available()

    def record_success(self, backend_or_tier: str):
        self.get_breaker(backend_or_tier).record_success()

    def record_failure(self, backend_or_tier: str):
        self.get_breaker(backend_or_tier).record_failure()

    def get_open_tiers(self) -> Set[str]:
        """Returns set of all tiers/backends currently in OPEN state."""
        return {name for name, b in self._breakers.items() if not b.is_available()}

    def reset_all(self):
        for b in self._breakers.values():
            b.reset()


circuit_breaker_registry = CircuitBreakerRegistry()
