"""
Tests for Plan 1 Section 6 P3-T2:
brain_turn_v1 schema validation, serialization, and Agent Brain consumption.
"""

import json
import pytest
from pydantic import ValidationError

from app.protocol import (
    BrainTurnV1,
    BrainTurnIntent,
    BrainTurnNextState,
    BrainToolCall,
    BRAIN_TURN_V1_SCHEMA
)


def test_brain_turn_v1_valid_instantiation():
    """Validates full brain_turn_v1 object across valid domain intents and states."""
    turn = BrainTurnV1(
        intent="disclose_balance",
        next_state="discover",
        utterance="現在の残高は98,000円でございます。一括でのお支払いは可能でしょうか。",
        tool_calls=[BrainToolCall(name="get_balance", arguments={"account_id": "acc_001"})]
    )
    assert turn.intent == "disclose_balance"
    assert turn.next_state == "discover"
    assert "98,000" in turn.utterance
    assert len(turn.tool_calls) == 1
    assert turn.tool_calls[0].name == "get_balance"


def test_brain_turn_v1_json_roundtrip():
    """Validates JSON serialization and parsing roundtrip."""
    original_dict = {
        "intent": "propose_payment_plan",
        "next_state": "negotiate",
        "utterance": "月々8,000円の分割払いをご提案できますが、いかがでしょうか。",
        "tool_calls": []
    }
    raw_json = json.dumps(original_dict, ensure_ascii=False)
    parsed = BrainTurnV1.model_validate_json(raw_json)
    assert parsed.intent == "propose_payment_plan"
    assert parsed.next_state == "negotiate"
    assert "8,000" in parsed.utterance
    assert parsed.tool_calls == []


def test_brain_turn_v1_strict_enum_rejection():
    """Validates that arbitrary / hallucinated intents or states are rejected."""
    # Invalid intent
    with pytest.raises(ValidationError):
        BrainTurnV1(
            intent="hallucinated_intent",  # not in enum
            next_state="negotiate",
            utterance="test"
        )

    # Invalid state
    with pytest.raises(ValidationError):
        BrainTurnV1(
            intent="greet",
            next_state="unregistered_wildcard_state",  # not in enum
            utterance="test"
        )


def test_brain_turn_v1_agent_state_consumption():
    """Asserts that agent state cleanly consumes structured brain_turn_v1 output."""
    raw_payload = json.dumps({
        "intent": "accept_terms",
        "next_state": "capture_promise",
        "utterance": "ご承諾ありがとうございます。お支払い期日を確定いたします。",
        "tool_calls": [{"name": "record_ptp", "arguments": {"amount": 8000, "date": "2026-11-30"}}]
    }, ensure_ascii=False)

    turn = BrainTurnV1.model_validate_json(raw_payload)

    # Simulate agent state ingestion
    state = {"phase": "negotiate", "messages": []}
    state["phase"] = turn.next_state
    state["last_intent"] = turn.intent
    state["agent_proposed_text"] = turn.utterance
    if turn.tool_calls:
        state["pending_tools"] = [t.model_dump() for t in turn.tool_calls]

    assert state["phase"] == "capture_promise"
    assert state["last_intent"] == "accept_terms"
    assert state["agent_proposed_text"] == turn.utterance
    assert state["pending_tools"][0]["name"] == "record_ptp"


def test_brain_turn_v1_schema_export():
    """Validates JSON schema definition export for constrained decoding engines."""
    assert "properties" in BRAIN_TURN_V1_SCHEMA
    props = BRAIN_TURN_V1_SCHEMA["properties"]
    assert "intent" in props
    assert "next_state" in props
    assert "utterance" in props
    assert "tool_calls" in props
    assert BRAIN_TURN_V1_SCHEMA.get("required") == ["intent", "next_state", "utterance"]
