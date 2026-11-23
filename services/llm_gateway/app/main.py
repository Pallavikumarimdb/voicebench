"""
VoiceAI Infra LLM Gateway — Main FastAPI Application (Port 8005).
OpenAI-compatible serving layer with routing, streaming, and cancellation.
"""

import time
import uuid
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from .api import api_router
from .config import config
from .logging import logger, trace_context


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(
        f"Starting VoiceAI LLM Gateway on {config.host}:{config.port} "
        f"(profile={config.default_profile}, loaded_policies={len(config.policies)})"
    )
    yield
    logger.info("Shutting down VoiceAI LLM Gateway.")


app = FastAPI(
    title="VoiceAI Infra LLM Gateway",
    version="0.1.0",
    description="OpenAI-compatible LLM Gateway with dynamic routing, streaming, and real cancellation.",
    lifespan=lifespan
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)


@app.middleware("http")
async def trace_id_middleware(request: Request, call_next):
    trace_id = request.headers.get("x-voiceai-trace-id", str(uuid.uuid4())[:8])
    session_id = request.headers.get("x-voiceai-session-id", "-")
    turn_id = request.headers.get("x-voiceai-turn-id", "-")

    trace_context.set({
        "trace_id": trace_id,
        "session_id": session_id,
        "turn_id": turn_id
    })

    start_time = time.monotonic()
    response = await call_next(request)
    duration_ms = (time.monotonic() - start_time) * 1000.0

    response.headers["x-voiceai-trace-id"] = trace_id
    response.headers["x-voiceai-latency-ms"] = f"{duration_ms:.2f}"
    return response


# Include API routes
app.include_router(api_router)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host=config.host, port=config.port, reload=True)
