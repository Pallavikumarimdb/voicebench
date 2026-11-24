"""
Health, Readiness, and Prometheus Metrics endpoints.
"""

from fastapi import APIRouter, Response
from ..metrics import generate_latest, CONTENT_TYPE_LATEST
from ..config import config

router = APIRouter()


@router.get("/healthz")
async def healthz():
    return {
        "status": "ok",
        "service": "voice-llm-gateway",
        "version": "0.1.0"
    }


@router.get("/readyz")
async def readyz():
    # Verify policy files loaded
    policies_loaded = len(config.policies) > 0
    return {
        "ready": policies_loaded,
        "default_profile": config.default_profile,
        "loaded_policies": list(config.policies.keys())
    }


@router.post("/reload")
async def reload_policies():
    """Reloads all policy YAML files from disk dynamically without restarting gateway."""
    config.reload_all()
    return {
        "status": "reloaded",
        "loaded_policies": list(config.policies.keys()),
        "policy_hashes": config.policy_hashes
    }


@router.get("/metrics")
async def metrics():
    data = generate_latest()
    return Response(content=data, media_type=CONTENT_TYPE_LATEST)
