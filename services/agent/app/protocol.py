"""
Brain contract protocol definitions for services/agent.
Matches packages/protocol/src/index.ts and packages/protocol/protocol.py.
"""

import re
from typing import Literal, Optional, Any, Dict, List
from pydantic import BaseModel, Field, field_validator

BrainEventType = Literal[
    "state_change",
    "tool_call",
    "compliance_block",
    "escalate",
    "identity_verified",
    "promise_to_pay",
    "stop_contact",
    "end_call",
    "candidate_qualified",
    "kyc_verified",
    "rubric_scored"
]

class BrainEvent(BaseModel):
    type: BrainEventType
    payload: Dict[str, Any] = Field(default_factory=dict)
    ts: int

class BrainMetrics(BaseModel):
    llmMs: float
    ttftMs: Optional[float] = None
    tokensIn: int = 0
    tokensOut: int = 0
    model: str = "default"

class BrainRequest(BaseModel):
    sessionId: str
    uttId: int
    text: str = Field(..., max_length=2000)  # [H2] Prevent oversized payloads from exhausting LLM budget
    tCaptureMs: Optional[int] = None
    config: Optional[Dict[str, Any]] = None
    context: Optional[List[str]] = None

    @field_validator('sessionId')
    @classmethod
    def validate_session_id(cls, v: str) -> str:
        """[H3] Enforce safe session ID format to prevent path traversal downstream."""
        if not re.match(r'^[a-zA-Z0-9_\-]{1,128}$', v):
            raise ValueError('sessionId must match ^[a-zA-Z0-9_\\-]{1,128}$')
        return v

    @field_validator('context')
    @classmethod
    def validate_context(cls, v: Optional[List[str]]) -> Optional[List[str]]:
        """[H2] Limit context window to prevent prompt stuffing."""
        if v is not None:
            return [item[:500] for item in v[:10]]
        return v

class BrainResponse(BaseModel):
    text: str
    events: List[BrainEvent] = Field(default_factory=list)
    metrics: BrainMetrics

# Plan 1 Section 6 P3-T2: Constrained Decoding Brain Turn Schema v1
BrainTurnIntent = Literal[
    # Generic & Shared
    "greet",
    "confirm_identity",
    "deny_identity",
    "provide_dob",
    "request_agent_handoff",
    "close_call",
    "clarification",
    # Collections
    "disclose_balance",
    "inquire_situation",
    "propose_payment_plan",
    "accept_terms",
    "request_installments",
    "claim_hardship",
    "claim_already_paid",
    "request_stop_contact",
    "third_party_notice",
    # Screening
    "describe_experience",
    "confirm_qualification",
    "provide_availability",
    "agree_schedule",
    # KYC
    "submit_document",
    "confirm_address",
    "provide_info",
    # Custom
    "inquire",
    "confirm",
    "escalate",
]

BrainTurnNextState = Literal[
    # Collections states
    "greet",
    "verify_identity",
    "disclose",
    "discover",
    "negotiate",
    "capture_promise",
    "close",
    "third_party",
    "stop_contact",
    "escalate_human",
    "dispute_or_paid",
    # Screening states
    "experience_inquiry",
    "qualification_check",
    "availability_check",
    "schedule_interview",
    # KYC states
    "document_verification",
    "address_confirmation",
    "risk_assessment",
    "kyc_approved",
    # Custom states
    "inquiry",
    "action",
    "resolve",
]

class BrainToolCall(BaseModel):
    name: str
    arguments: Dict[str, Any] = Field(default_factory=dict)

class BrainTurnV1(BaseModel):
    intent: BrainTurnIntent
    next_state: BrainTurnNextState
    utterance: str
    tool_calls: Optional[List[BrainToolCall]] = None

BRAIN_TURN_V1_SCHEMA = BrainTurnV1.model_json_schema()

class TurnCancelRequest(BaseModel):
    sessionId: str
    uttId: Optional[int] = None

class SessionStartRequest(BaseModel):
    sessionId: Optional[str] = Field(None, pattern=r"^[a-zA-Z0-9_\-]{1,128}$")
    debtorId: str = Field("deb_001", pattern=r"^[a-zA-Z0-9_\-]{1,64}$")
    variant: str = Field("v2_graph", pattern=r"^[a-zA-Z0-9_\-]{1,32}$")
    config: Optional[Dict[str, Any]] = None

class SessionEndRequest(BaseModel):
    sessionId: str = Field(..., pattern=r"^[a-zA-Z0-9_\-]{1,128}$")

