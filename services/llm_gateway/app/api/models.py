"""
OpenAI-compatible GET /v1/models endpoint.
"""

import time
from fastapi import APIRouter
from typing import Dict, Any, List
from ..config import config

router = APIRouter()


@router.get("/models")
async def list_models() -> Dict[str, Any]:
    current_ts = int(time.time())
    policy = config.get_policy()
    tiers = policy.get("tiers", {})

    models: List[Dict[str, Any]] = [
        {
            "id": "stub-model",
            "object": "model",
            "created": current_ts,
            "owned_by": "voiceai-stub"
        }
    ]

    for tier_name, tier_cfg in tiers.items():
        if isinstance(tier_cfg, dict) and "model" in tier_cfg:
            models.append({
                "id": tier_cfg["model"],
                "object": "model",
                "created": current_ts,
                "owned_by": tier_cfg.get("backend", "voiceai"),
                "tier": tier_name
            })

    return {
        "object": "list",
        "data": models
    }
