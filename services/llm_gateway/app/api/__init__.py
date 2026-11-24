"""
API Routers for LLM Gateway.
"""
from fastapi import APIRouter
from .health import router as health_router
from .models import router as models_router
from .chat import router as chat_router

api_router = APIRouter()
api_router.include_router(health_router, tags=["Health"])
api_router.include_router(models_router, prefix="/v1", tags=["Models"])
api_router.include_router(chat_router, prefix="/v1", tags=["Chat"])
