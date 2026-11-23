"""
OpenAI-compatible POST /v1/chat/completions endpoint with cancellation support.
Supports non-streaming and Server-Sent Events (SSE) streaming with Section 5.2 routing records,
delegating to backend adapters with cancellation propagation and automated fallback.
"""

import time
import json
import uuid
import httpx
import asyncio
from typing import List, Dict, Any, Optional, AsyncGenerator
from fastapi import APIRouter, Request, Header, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

from ..config import config
from ..logging import logger, trace_context
from ..adapters import (
    registry,
    AdapterRequest,
    AdapterResponse,
    AdapterChunk,
    BackendError5xx,
    BackendTimeoutError,
    BackendStreamDropError
)
from ..metrics import (
    voiceai_llm_requests_total,
    voiceai_llm_ttft_seconds,
    voiceai_fallback_total
)
from ..cancellation import cancellation_manager, ActiveRequest

router = APIRouter()


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatCompletionRequest(BaseModel):
    model: str = "qwen3:1.7b"
    messages: List[ChatMessage]
    stream: bool = False
    temperature: Optional[float] = 0.7
    max_tokens: Optional[int] = 256
    top_p: Optional[float] = 1.0
    backend: Optional[str] = None  # explicit override for tests / routing


class CancelRequest(BaseModel):
    completion_id: Optional[str] = None
    session_id: Optional[str] = None
    turn_id: Optional[str] = None


def resolve_backend(req: ChatCompletionRequest, profile: str, risk_tier: str) -> tuple[str, str]:
    """Resolves tier and backend name from request and policy."""
    if req.backend:
        return "t1_local", req.backend

    if req.model == "stub-model" or req.model.startswith("stub"):
        return "t1_local", "stub"

    policy = config.get_policy(profile)
    tiers = policy.get("tiers", {})

    tier_name = "t1_local"
    if risk_tier == "high":
        for rule in policy.get("rules", []):
            if rule.get("when", {}).get("risk_tier") == "high":
                tier_name = rule.get("route", "t1_local")
                break

    tier_cfg = tiers.get(tier_name, {})
    backend_name = tier_cfg.get("backend", "ollama_local")
    return tier_name, backend_name


def create_decision_record(
    model: str,
    tier: str,
    backend: str,
    profile: str,
    risk_tier: str,
    ttft_ms: float = 0.0,
    tokens_in: int = 0,
    tokens_out: int = 0,
    cached_tokens: int = 0,
    cancelled: bool = False,
    fallback_chain: Optional[List[Dict[str, str]]] = None
) -> Dict[str, Any]:
    """Generates the Section 5.2 x_voiceai decision record."""
    policy_ver = config.get_policy_version(profile)
    rule_id = "r_high_risk" if risk_tier == "high" else "r_default"
    reason_code = "RULE_MATCH"
    if cancelled:
        reason_code = "CLIENT_CANCELLED"
    elif fallback_chain:
        reason_code = "BACKEND_ERROR"

    return {
        "tier": tier,
        "backend": backend,
        "model": model,
        "rule_id": rule_id,
        "reason_code": reason_code,
        "policy_version": policy_ver,
        "cache": "miss",
        "constraint_mode": "schema+mask" if risk_tier == "high" else "none",
        "fallback_chain": fallback_chain or [],
        "ttft_ms": max(0, int(ttft_ms)),
        "tokens_in": tokens_in,
        "tokens_out": tokens_out,
        "cached_tokens": cached_tokens,
        "cancelled": cancelled
    }


async def stream_chat_generator(
    http_request: Request,
    req: ChatCompletionRequest,
    tier_name: str,
    backend_name: str,
    session_id: str,
    turn_id: str,
    profile: str,
    risk_tier: str
) -> AsyncGenerator[str, None]:
    start_time = time.monotonic()
    completion_id = f"chatcmpl-{uuid.uuid4().hex[:12]}"
    created_ts = int(time.time())

    active_req = cancellation_manager.register(
        completion_id=completion_id,
        session_id=session_id,
        turn_id=turn_id,
        model=req.model,
        tier=tier_name,
        backend=backend_name
    )

    adapter = registry.get(backend_name)
    adapter_req = AdapterRequest(
        model=req.model,
        messages=[{"role": m.role, "content": m.content} for m in req.messages],
        temperature=req.temperature or 0.7,
        max_tokens=req.max_tokens or 256,
        stream=True
    )

    fallback_chain: List[Dict[str, str]] = []
    first_token = True
    ttft_ms = 0.0
    total_tokens_in = sum(len(m.content) for m in req.messages)
    total_tokens_out = 0
    cached_tokens = 0
    cancelled = False

    in_thinking = False

    async def _run_stream(target_adapter, target_backend: str):
        nonlocal first_token, ttft_ms, total_tokens_in, total_tokens_out, cached_tokens, cancelled, in_thinking
        async for chunk in target_adapter.stream(adapter_req):
            # Check for client disconnect or explicit cancellation
            if active_req.cancel_event.is_set() or active_req.cancelled:
                cancelled = True
                break
            if await http_request.is_disconnected():
                cancellation_manager.cancel(completion_id=completion_id)
                cancelled = True
                break

            if chunk.tokens_in is not None:
                total_tokens_in = chunk.tokens_in
            if chunk.tokens_out is not None:
                total_tokens_out = chunk.tokens_out
            if chunk.cached_tokens is not None:
                cached_tokens = chunk.cached_tokens

            delta = chunk.delta_content
            if delta:
                # Plan 1 P1-T6: Suppress Qwen reasoning (<think>) tokens on the voice path
                if "<think>" in delta:
                    in_thinking = True
                    delta = delta.split("<think>", 1)[0]
                if in_thinking:
                    if "</think>" in delta:
                        in_thinking = False
                        delta = delta.split("</think>", 1)[1]
                    else:
                        delta = ""

                if delta:
                    if first_token:
                        ttft_s = time.monotonic() - start_time
                        ttft_ms = ttft_s * 1000.0
                        voiceai_llm_ttft_seconds.observe(ttft_s)
                        first_token = False

                    out_chunk = {
                        "id": completion_id,
                        "object": "chat.completion.chunk",
                        "created": created_ts,
                        "model": req.model,
                        "choices": [
                            {
                                "index": 0,
                                "delta": {"content": delta},
                                "finish_reason": None
                            }
                        ]
                    }
                    yield f"data: {json.dumps(out_chunk, ensure_ascii=False)}\n\n"

    try:
        try:
            async for item in _run_stream(adapter, backend_name):
                yield item
                if cancelled:
                    break
        except (httpx.ConnectError, httpx.RequestError) as net_err:
            if first_token and not cancelled:
                logger.warning(
                    f"Backend '{backend_name}' connection failed ({net_err}), falling back to 'stub'"
                )
                voiceai_fallback_total.labels(
                    from_tier=tier_name,
                    to_tier="stub",
                    reason="BACKEND_ERROR"
                ).inc()
                fallback_chain.append({"from": backend_name, "to": "stub", "reason": "BACKEND_ERROR"})
                backend_name = "stub"
                adapter = registry.get("stub")
                async for item in _run_stream(adapter, backend_name):
                    yield item
                    if cancelled:
                        break
            else:
                raise

        # Final chunk carrying Section 5.2 decision record
        is_cancelled = cancelled or active_req.cancelled or active_req.cancel_event.is_set()
        decision = create_decision_record(
            model=req.model,
            tier=tier_name,
            backend=backend_name,
            profile=profile,
            risk_tier=risk_tier,
            ttft_ms=ttft_ms,
            tokens_in=total_tokens_in,
            tokens_out=total_tokens_out,
            cached_tokens=cached_tokens,
            cancelled=is_cancelled,
            fallback_chain=fallback_chain
        )
        final_chunk = {
            "id": completion_id,
            "object": "chat.completion.chunk",
            "created": created_ts,
            "model": req.model,
            "choices": [
                {
                    "index": 0,
                    "delta": {},
                    "finish_reason": "stop" if not cancelled else "abort"
                }
            ],
            "usage": {
                "prompt_tokens": total_tokens_in,
                "completion_tokens": total_tokens_out,
                "total_tokens": total_tokens_in + total_tokens_out,
                "prompt_tokens_details": {"cached_tokens": cached_tokens}
            },
            "x_voiceai": decision
        }
        yield f"data: {json.dumps(final_chunk, ensure_ascii=False)}\n\n"
        yield "data: [DONE]\n\n"

        if not cancelled:
            voiceai_llm_requests_total.labels(
                backend=backend_name,
                model=req.model,
                tier=tier_name,
                status="success"
            ).inc()

    except Exception as exc:
        logger.error(f"Stream generation error ({type(exc).__name__}): {exc}")
        voiceai_llm_requests_total.labels(
            backend=backend_name,
            model=req.model,
            tier=tier_name,
            status="error"
        ).inc()
        raise
    finally:
        cancellation_manager.unregister(completion_id)


@router.post("/chat/completions")
async def chat_completions(
    http_request: Request,
    req: ChatCompletionRequest,
    x_voiceai_session_id: Optional[str] = Header(None),
    x_voiceai_turn_id: Optional[str] = Header(None),
    x_voiceai_profile: Optional[str] = Header(None),
    x_voiceai_dialogue_state: Optional[str] = Header(None),
    x_voiceai_risk_tier: Optional[str] = Header("low"),
    x_voiceai_asr_confidence: Optional[str] = Header(None),
    x_voiceai_utterance_tokens: Optional[str] = Header(None),
):
    session_id = x_voiceai_session_id or "sess_default"
    turn_id = x_voiceai_turn_id or "turn_0"
    profile = x_voiceai_profile or config.default_profile
    risk_tier = x_voiceai_risk_tier or "low"

    trace_context.set({
        "trace_id": str(uuid.uuid4())[:8],
        "session_id": session_id,
        "turn_id": turn_id
    })

    tier_name, backend_name = resolve_backend(req, profile, risk_tier)

    logger.info(
        f"Incoming chat completion: model={req.model}, stream={req.stream}, "
        f"tier={tier_name}, backend={backend_name}, risk_tier={risk_tier}"
    )

    if req.stream:
        return StreamingResponse(
            stream_chat_generator(http_request, req, tier_name, backend_name, session_id, turn_id, profile, risk_tier),
            media_type="text/event-stream"
        )

    # Non-streaming execution via adapter with fallback
    completion_id = f"chatcmpl-{uuid.uuid4().hex[:12]}"
    active_req = cancellation_manager.register(
        completion_id=completion_id,
        session_id=session_id,
        turn_id=turn_id,
        model=req.model,
        tier=tier_name,
        backend=backend_name
    )

    adapter = registry.get(backend_name)
    adapter_req = AdapterRequest(
        model=req.model,
        messages=[{"role": m.role, "content": m.content} for m in req.messages],
        temperature=req.temperature or 0.7,
        max_tokens=req.max_tokens or 256,
        stream=False
    )

    fallback_chain: List[Dict[str, str]] = []

    try:
        try:
            adapter_res = await adapter.complete(adapter_req)
        except (httpx.ConnectError, httpx.RequestError) as net_err:
            logger.warning(
                f"Backend '{backend_name}' connection failed ({net_err}), falling back to 'stub'"
            )
            voiceai_fallback_total.labels(
                from_tier=tier_name,
                to_tier="stub",
                reason="BACKEND_ERROR"
            ).inc()
            fallback_chain.append({"from": backend_name, "to": "stub", "reason": "BACKEND_ERROR"})
            backend_name = "stub"
            adapter = registry.get("stub")
            adapter_res = await adapter.complete(adapter_req)

        from ..adapters.base import strip_thinking_tokens
        adapter_res.content = strip_thinking_tokens(adapter_res.content)

        voiceai_llm_ttft_seconds.observe(adapter_res.ttft_ms / 1000.0)
        created_ts = int(time.time())

        decision = create_decision_record(
            model=req.model,
            tier=tier_name,
            backend=backend_name,
            profile=profile,
            risk_tier=risk_tier,
            ttft_ms=adapter_res.ttft_ms,
            tokens_in=adapter_res.tokens_in,
            tokens_out=adapter_res.tokens_out,
            cached_tokens=adapter_res.cached_tokens,
            cancelled=active_req.cancelled,
            fallback_chain=fallback_chain
        )

        response_body = {
            "id": completion_id,
            "object": "chat.completion",
            "created": created_ts,
            "model": req.model,
            "choices": [
                {
                    "index": 0,
                    "message": {
                        "role": "assistant",
                        "content": adapter_res.content
                    },
                    "finish_reason": adapter_res.finish_reason
                }
            ],
            "usage": {
                "prompt_tokens": adapter_res.tokens_in,
                "completion_tokens": adapter_res.tokens_out,
                "total_tokens": adapter_res.tokens_in + adapter_res.tokens_out,
                "prompt_tokens_details": {"cached_tokens": adapter_res.cached_tokens}
            },
            "x_voiceai": decision
        }

        voiceai_llm_requests_total.labels(
            backend=backend_name,
            model=req.model,
            tier=tier_name,
            status="success"
        ).inc()

        return JSONResponse(content=response_body)

    except BackendTimeoutError as exc:
        logger.error(f"Backend timeout: {exc}")
        voiceai_llm_requests_total.labels(
            backend=backend_name,
            model=req.model,
            tier=tier_name,
            status="timeout"
        ).inc()
        raise HTTPException(status_code=504, detail="Upstream backend timeout")

    except BackendError5xx as exc:
        logger.error(f"Backend 5xx error: {exc}")
        voiceai_llm_requests_total.labels(
            backend=backend_name,
            model=req.model,
            tier=tier_name,
            status="5xx"
        ).inc()
        raise HTTPException(status_code=502, detail="Upstream backend internal error")

    except Exception as exc:
        logger.error(f"Completion failed ({type(exc).__name__}): {exc}")
        voiceai_llm_requests_total.labels(
            backend=backend_name,
            model=req.model,
            tier=tier_name,
            status="error"
        ).inc()
        raise HTTPException(status_code=500, detail=str(exc))
    finally:
        cancellation_manager.unregister(completion_id)


@router.post("/chat/completions/{completion_id}/cancel")
async def cancel_completion(completion_id: str):
    """Explicitly cancels an in-flight completion request by ID."""
    active = cancellation_manager.cancel(completion_id=completion_id)
    if not active:
        return {"status": "not_found", "cancelled": False, "completion_id": completion_id}
    return {
        "status": "cancelled",
        "cancelled": True,
        "completion_id": completion_id,
        "cancel_latency_ms": active.cancel_latency_ms
    }


@router.post("/cancel")
async def cancel_turn(body: CancelRequest):
    """Explicitly cancels an in-flight completion by session_id, turn_id, or completion_id."""
    active = cancellation_manager.cancel(
        completion_id=body.completion_id,
        session_id=body.session_id,
        turn_id=body.turn_id
    )
    if not active:
        return {"status": "not_found", "cancelled": False}
    return {
        "status": "cancelled",
        "cancelled": True,
        "completion_id": active.completion_id,
        "session_id": active.session_id,
        "turn_id": active.turn_id,
        "cancel_latency_ms": active.cancel_latency_ms
    }
