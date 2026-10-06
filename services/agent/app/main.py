"""
Voice Agent Service - FastAPI Entrypoint
Endpoints:
- POST /turn: Process caller utterance through conversation brain
- POST /session/start: Initialize debtor session & state
- POST /session/end: Finalize session, write audit, produce handoff
- GET /metrics: Prometheus metrics
- GET /healthz: Service health check
"""

import os
import time
import threading
from typing import Dict, Any, Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from prometheus_client import Histogram, Counter, generate_latest, CONTENT_TYPE_LATEST

from .protocol import (
    BrainRequest, BrainResponse, BrainEvent, BrainMetrics,
    SessionStartRequest, SessionEndRequest
)
from .graph import CollectionsGraphAgent
from .baseline import BaselineCollectionsAgent
from .audit import AuditLogger
from .handoff import generate_handoff_summary
from .state import CallState
from .compliance.guard import ComplianceGuard
from .generalized import GeneralizedVoiceAgent
from .llm import llm_client

app = FastAPI(title="Voice Agent Service", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pre-instantiate agents
guard = ComplianceGuard()
graph_agent = CollectionsGraphAgent(guard=guard, enable_slow_path=True)
graph_agent_fast_only = CollectionsGraphAgent(guard=guard, enable_slow_path=False)
baseline_agent = BaselineCollectionsAgent(guard=guard)
generalized_agent = GeneralizedVoiceAgent(guard=guard)

# Prometheus Metrics
AGENT_TURN_LATENCY = Histogram(
    "agent_turn_latency_seconds",
    "Time spent processing a turn in the agent",
    ["stage"],
    buckets=[0.05, 0.1, 0.2, 0.5, 1.0, 1.5, 2.0, 3.0]
)
AGENT_CALLS_TOTAL = Counter(
    "agent_calls_total",
    "Total agent calls by outcome",
    ["outcome"]
)
AGENT_COMPLIANCE_BLOCKS_TOTAL = Counter(
    "agent_compliance_blocks_total",
    "Total compliance blocks triggered",
    ["rule"]
)
AGENT_ESCALATIONS_TOTAL = Counter(
    "agent_escalations_total",
    "Total agent escalations triggered",
    ["reason"]
)
AGENT_LLM_TOKENS_TOTAL = Counter(
    "agent_llm_tokens_total",
    "Total LLM tokens consumed",
    ["direction"]
)

# Active session states (in-memory registry)
sessions: Dict[str, Dict[str, Any]] = {}

# [C4 / M1] Session limits and TTL reaper
MAX_SESSIONS = int(os.environ.get('MAX_AGENT_SESSIONS', 500))
SESSION_TTL_MS = int(os.environ.get('AGENT_SESSION_TTL_MS', 3_600_000))  # Default: 1 hour

def _reap_expired_sessions():
    """Background thread: removes sessions older than SESSION_TTL_MS."""
    while True:
        time.sleep(300)  # Run every 5 minutes
        now_ms = int(time.time() * 1000)
        expired = [
            sid for sid, s in list(sessions.items())
            if now_ms - s.get('createdAt', now_ms) > SESSION_TTL_MS
        ]
        for sid in expired:
            sessions.pop(sid, None)

_reaper_thread = threading.Thread(target=_reap_expired_sessions, daemon=True)
_reaper_thread.start()

@app.get("/healthz")
async def healthz():
    return {
        "status": "ok",
        "service": "agent",
        "sessions_active": len(sessions),
        "llm": {
            "local": llm_client.probe("local"),
            "openai": llm_client.probe("openai"),
            "local_model": llm_client.local_model,
        },
    }

@app.get("/metrics")
async def metrics():
    return PlainTextResponse(generate_latest(), media_type=CONTENT_TYPE_LATEST)

@app.post("/session/start")
async def session_start(req: SessionStartRequest):
    # [C4] Enforce session cap
    if len(sessions) >= MAX_SESSIONS:
        raise HTTPException(status_code=429, detail="Max concurrent sessions reached")

    session_id = req.sessionId or f"s_{int(time.time()*1000)}"
    debtor_id = req.debtorId
    variant = req.variant

    audit_logger = AuditLogger(session_id)
    initial_state: CallState = {
        "session_id": session_id,
        "debtor_id": debtor_id,
        "messages": [],
        "phase": "greet",
        "identity_verified": False,
        "verification_attempts": 0,
        "disclosure_done": False,
        "balance": None,
        "approved_terms": {},
        "offers_made": [],
        "promise_to_pay": None,
        "stop_contact": False,
        "third_party_detected": False,
        "escalation_reason": None,
        "turn_count": 0,
        "flags": {}
    }

    sessions[session_id] = {
        "sessionId": session_id,
        "debtorId": debtor_id,
        "variant": variant,
        "config": req.config or {},
        "state": initial_state,
        "audit_logger": audit_logger,
        "createdAt": int(time.time() * 1000)
    }
    return {"status": "started", "sessionId": session_id, "variant": variant}

@app.post("/session/end")
async def session_end(req: SessionEndRequest):
    session_id = req.sessionId
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    session_data = sessions.pop(session_id)
    audit_logger = session_data["audit_logger"]
    handoff = generate_handoff_summary(session_data["state"], audit_logger.log_path)
    return {"status": "ended", "sessionId": session_id, "handoff": handoff.model_dump()}

@app.post("/turn", response_model=BrainResponse)
async def turn(req: BrainRequest) -> BrainResponse:
    t_start = time.perf_counter()

    # Track or get session
    if req.sessionId not in sessions:
        # [C4] Enforce session cap on ad-hoc session creation
        if len(sessions) >= MAX_SESSIONS:
            raise HTTPException(status_code=429, detail="Max concurrent sessions reached")
        # Initialize ad-hoc session
        audit_logger = AuditLogger(req.sessionId)
        initial_state: CallState = {
            "session_id": req.sessionId,
            "debtor_id": "deb_001",
            "messages": [],
            "phase": "greet",
            "identity_verified": False,
            "verification_attempts": 0,
            "disclosure_done": False,
            "balance": None,
            "approved_terms": {},
            "offers_made": [],
            "promise_to_pay": None,
            "stop_contact": False,
            "third_party_detected": False,
            "escalation_reason": None,
            "turn_count": 0,
            "flags": {}
        }
        sessions[req.sessionId] = {
            "sessionId": req.sessionId,
            "debtorId": "deb_001",
            "variant": "v2_graph",
            "state": initial_state,
            "audit_logger": audit_logger,
            "createdAt": int(time.time() * 1000)
        }

    session_data = sessions[req.sessionId]
    variant = session_data.get("variant", "v2_graph")
    state = session_data["state"]
    audit_logger = session_data["audit_logger"]

    # Check for domain configuration
    cfg = req.config or session_data.get("config", {})
    domain = cfg.get("domain", "collections")
    language = cfg.get("language", "ja")

    with AGENT_TURN_LATENCY.labels(stage="turn_total").time():
        if domain in ["screening", "kyc", "custom"] or (domain == "collections" and language == "en"):
            turn_result = generalized_agent.process_turn(
                req.sessionId, req.text, state, config=cfg, audit_logger=audit_logger
            )
        else:
            # Select engine for Japanese collections
            if variant == "v1_baseline":
                agent = baseline_agent
            elif variant == "v2_graph_no_slow_path":
                agent = graph_agent_fast_only
            else:
                agent = graph_agent

            turn_result = agent.process_turn(req.sessionId, req.text, state, audit_logger)
        
        reply_text = turn_result["text"]
        raw_events = turn_result.get("events", [])
        raw_metrics = turn_result.get("metrics", {})

        brain_events = []
        for ev in raw_events:
            brain_events.append(BrainEvent(
                type=ev.get("type", "state_change"),
                payload=ev.get("payload", {}),
                ts=ev.get("ts", int(time.time() * 1000))
            ))

        brain_metrics = BrainMetrics(
            llmMs=raw_metrics.get("llmMs", 20.0),
            ttftMs=raw_metrics.get("ttftMs", 8.0),
            tokensIn=raw_metrics.get("tokensIn", len(req.text)),
            tokensOut=raw_metrics.get("tokensOut", len(reply_text)),
            model=raw_metrics.get("model", variant)
        )

        return BrainResponse(
            text=reply_text,
            events=brain_events,
            metrics=brain_metrics
        )
