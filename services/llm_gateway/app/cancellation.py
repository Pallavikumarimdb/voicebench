"""
Cancellation Manager for In-Flight LLM Gateway Requests (Plan 1 Section 6 P1-T3).
Tracks active completions and aborts upstream generation on client disconnect or explicit cancel.
"""

import time
import asyncio
from typing import Dict, Optional, Tuple, Any
from .logging import logger
from .metrics import (
    voiceai_llm_cancel_latency_seconds,
    voiceai_llm_requests_total
)


class ActiveRequest:
    def __init__(self, completion_id: str, session_id: str, turn_id: str, model: str, tier: str, backend: str):
        self.completion_id = completion_id
        self.session_id = session_id
        self.turn_id = turn_id
        self.model = model
        self.tier = tier
        self.backend = backend
        self.start_time = time.monotonic()
        self.cancel_event = asyncio.Event()
        self.cancelled = False
        self.cancel_start_time: Optional[float] = None
        self.cancel_latency_ms: float = 0.0


class CancellationManager:
    def __init__(self):
        self._by_id: Dict[str, ActiveRequest] = {}
        self._by_session: Dict[Tuple[str, str], ActiveRequest] = {}

    def register(
        self,
        completion_id: str,
        session_id: str,
        turn_id: str,
        model: str,
        tier: str,
        backend: str
    ) -> ActiveRequest:
        active = ActiveRequest(
            completion_id=completion_id,
            session_id=session_id,
            turn_id=turn_id,
            model=model,
            tier=tier,
            backend=backend
        )
        self._by_id[completion_id] = active
        self._by_session[(session_id, turn_id)] = active
        return active

    def unregister(self, completion_id: str):
        active = self._by_id.pop(completion_id, None)
        if active:
            self._by_session.pop((active.session_id, active.turn_id), None)

    def cancel(self, completion_id: Optional[str] = None, session_id: Optional[str] = None, turn_id: Optional[str] = None) -> Optional[ActiveRequest]:
        active: Optional[ActiveRequest] = None
        if completion_id and completion_id in self._by_id:
            active = self._by_id[completion_id]
        elif session_id and turn_id and (session_id, turn_id) in self._by_session:
            active = self._by_session[(session_id, turn_id)]
        elif session_id:
            # Cancel any request for this session
            for (s_id, _), req in list(self._by_session.items()):
                if s_id == session_id:
                    active = req
                    break

        if active and not active.cancelled:
            t0 = time.monotonic()
            active.cancel_start_time = t0
            active.cancelled = True
            active.cancel_event.set()

            latency_s = time.monotonic() - t0
            active.cancel_latency_ms = latency_s * 1000.0
            voiceai_llm_cancel_latency_seconds.observe(latency_s)
            voiceai_llm_requests_total.labels(
                backend=active.backend,
                model=active.model,
                tier=active.tier,
                status="cancelled"
            ).inc()
            logger.info(
                f"Cancelled in-flight request {active.completion_id} "
                f"(session={active.session_id}, turn={active.turn_id}, latency={active.cancel_latency_ms:.2f}ms)"
            )
            return active

        return active


cancellation_manager = CancellationManager()
