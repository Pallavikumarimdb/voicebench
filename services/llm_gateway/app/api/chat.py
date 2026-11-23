"""
OpenAI-compatible POST /v1/chat/completions endpoint.
Supports non-streaming and Server-Sent Events (SSE) streaming with Section 5.2 routing records.
"""

import time
import json
import uuid
import asyncio
from typing import List, Dict, Any, Optional, AsyncGenerator
from fastapi import APIRouter, Request, Header, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

from ..config import config
from ..logging import logger, trace_context
from ..metrics import (
    voiceai_llm_requests_total,
    voiceai_llm_ttft_seconds
)

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


def create_decision_record(
    model: str,
    profile: str,
    risk_tier: str,
    ttft_ms: float = 12.0,
    tokens_in: int = 40,
    tokens_out: int = 15,
    cached_tokens: int = 0,
    cancelled: bool = False
) -> Dict[str, Any]:
    """Generates the Section 5.2 x_voiceai decision record."""
    policy_ver = config.get_policy_version(profile)
    return {
        "tier": "t1_local" if risk_tier != "high" else "t1_local",
        "backend": "ollama_local",
        "model": model,
        "rule_id": "r_default" if risk_tier != "high" else "r_high_risk",
        "reason_code": "RULE_MATCH",
        "policy_version": policy_ver,
        "cache": "miss",
        "constraint_mode": "schema+mask" if risk_tier == "high" else "none",
        "fallback_chain": [],
        "ttft_ms": int(ttft_ms),
        "tokens_in": tokens_in,
        "tokens_out": tokens_out,
        "cached_tokens": cached_tokens,
        "cancelled": cancelled
    }


async def stream_chat_generator(
    req: ChatCompletionRequest,
    session_id: str,
    turn_id: str,
    profile: str,
    risk_tier: str
) -> AsyncGenerator[str, None]:
    start_time = time.monotonic()
    completion_id = f"chatcmpl-{uuid.uuid4().hex[:12]}"
    created_ts = int(time.time())

    # Simulated response tokens for the skeleton (adapters plug in at P1-T2)
    last_user_msg = req.messages[-1].content if req.messages else ""
    tokens = ["お電話", "ありがとうございます。", "ご用件を", "承ります。"]

    first_token = True
    ttft_ms = 0.0

    for idx, token in enumerate(tokens):
        await asyncio.sleep(0.015)  # Simulate token streaming delay
        if first_token:
            ttft_s = time.monotonic() - start_time
            ttft_ms = ttft_s * 1000.0
            voiceai_llm_ttft_seconds.observe(ttft_s)
            first_token = False

        chunk = {
            "id": completion_id,
            "object": "chat.completion.chunk",
            "created": created_ts,
            "model": req.model,
            "choices": [
                {
                    "index": 0,
                    "delta": {"content": token},
                    "finish_reason": None
                }
            ]
        }
        yield f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n"

    # Final chunk carrying Section 5.2 decision record
    decision = create_decision_record(
        model=req.model,
        profile=profile,
        risk_tier=risk_tier,
        ttft_ms=ttft_ms,
        tokens_in=len(last_user_msg),
        tokens_out=len("".join(tokens))
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
                "finish_reason": "stop"
            }
        ],
        "x_voiceai": decision
    }
    yield f"data: {json.dumps(final_chunk, ensure_ascii=False)}\n\n"
    yield "data: [DONE]\n\n"

    voiceai_llm_requests_total.labels(
        backend="ollama_local",
        model=req.model,
        tier=decision["tier"],
        status="success"
    ).inc()


@router.post("/chat/completions")
async def chat_completions(
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

    logger.info(f"Incoming chat completion: model={req.model}, stream={req.stream}, risk_tier={risk_tier}")

    if req.stream:
        return StreamingResponse(
            stream_chat_generator(req, session_id, turn_id, profile, risk_tier),
            media_type="text/event-stream"
        )

    # Non-streaming execution
    start_time = time.monotonic()
    await asyncio.sleep(0.02)  # Simulate fast-path processing
    ttft_s = time.monotonic() - start_time
    ttft_ms = ttft_s * 1000.0
    voiceai_llm_ttft_seconds.observe(ttft_s)

    last_user_msg = req.messages[-1].content if req.messages else ""
    assistant_content = "お電話ありがとうございます。ご用件を承ります。"
    completion_id = f"chatcmpl-{uuid.uuid4().hex[:12]}"
    created_ts = int(time.time())

    tokens_in = len(last_user_msg)
    tokens_out = len(assistant_content)

    decision = create_decision_record(
        model=req.model,
        profile=profile,
        risk_tier=risk_tier,
        ttft_ms=ttft_ms,
        tokens_in=tokens_in,
        tokens_out=tokens_out
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
                    "content": assistant_content
                },
                "finish_reason": "stop"
            }
        ],
        "usage": {
            "prompt_tokens": tokens_in,
            "completion_tokens": tokens_out,
            "total_tokens": tokens_in + tokens_out
        },
        "x_voiceai": decision
    }

    voiceai_llm_requests_total.labels(
        backend="ollama_local",
        model=req.model,
        tier=decision["tier"],
        status="success"
    ).inc()

    return JSONResponse(content=response_body)
