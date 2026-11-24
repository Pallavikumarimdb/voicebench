"""
Shared Python Pydantic models for the Brain contract and streaming messages.
Kept in sync with packages/protocol/src/index.ts.
"""

from typing import Literal, Optional, Any, Dict, List
from pydantic import BaseModel, Field

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
    text: str
    tCaptureMs: Optional[int] = None
    config: Optional[Dict[str, Any]] = None
    context: Optional[List[str]] = None

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
