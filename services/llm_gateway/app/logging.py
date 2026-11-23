"""
Structured JSON Logger with Trace ID / Session ID Context.
"""

import sys
import json
import logging
import datetime
from typing import Any, Dict, Optional
from contextvars import ContextVar

# Context variables for tracing across async tasks
trace_context: ContextVar[Dict[str, str]] = ContextVar("trace_context", default={})


class JSONFormatter(logging.Formatter):
    """Formats log records as single-line canonical JSON objects."""
    def format(self, record: logging.LogRecord) -> str:
        ctx = trace_context.get()
        log_entry: Dict[str, Any] = {
            "ts": datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z"),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "trace_id": ctx.get("trace_id", "-"),
            "session_id": ctx.get("session_id", "-"),
            "turn_id": ctx.get("turn_id", "-"),
        }
        if record.exc_info:
            log_entry["exception"] = self.formatException(record.exc_info)
        return json.dumps(log_entry, ensure_ascii=False)


def setup_logger(name: str = "llm_gateway", level: int = logging.INFO) -> logging.Logger:
    logger = logging.getLogger(name)
    logger.setLevel(level)
    logger.propagate = False

    if not logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(JSONFormatter())
        logger.addHandler(handler)

    return logger


logger = setup_logger()
