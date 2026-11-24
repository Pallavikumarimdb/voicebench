"""
Test to verify that Python Pydantic models in protocol.py stay in sync with packages/protocol/src/index.ts
"""

import os
import re
import pytest
from pydantic import BaseModel

protocol_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
import sys
sys.path.insert(0, protocol_dir)

from protocol import (
    BrainRequest,
    BrainResponse,
    BrainEvent,
    BrainMetrics,
    BrainEventType,
    BrainTurnV1,
    BrainTurnIntent,
    BrainTurnNextState,
    BrainToolCall,
    BRAIN_TURN_V1_SCHEMA
)

def test_brain_event_types_sync():
    ts_file = os.path.join(protocol_dir, "src", "index.ts")
    with open(ts_file, "r", encoding="utf-8") as f:
        content = f.read()

    # Extract TS BrainEventType
    match = re.search(r"export type BrainEventType\s*=\s*([^;]+);", content)
    assert match, "Could not find BrainEventType in index.ts"
    raw_types = match.group(1)
    ts_types = set(re.findall(r"'([^']+)'", raw_types))

    # Python BrainEventType literal values
    py_types = set(BrainEventType.__args__)
    assert ts_types == py_types, f"BrainEventType mismatch: TS={ts_types} vs PY={py_types}"


def test_brain_turn_v1_sync():
    """Validates that BrainTurnIntent and BrainTurnNextState stay strictly identical between TS and PY."""
    ts_file = os.path.join(protocol_dir, "src", "index.ts")
    with open(ts_file, "r", encoding="utf-8") as f:
        content = f.read()

    # 1. Intent sync
    match_intent = re.search(r"export type BrainTurnIntent\s*=\s*([^;]+);", content)
    assert match_intent, "Could not find BrainTurnIntent in index.ts"
    ts_intents = set(re.findall(r"'([^']+)'", match_intent.group(1)))
    py_intents = set(BrainTurnIntent.__args__)
    assert ts_intents == py_intents, f"BrainTurnIntent mismatch: TS={ts_intents} vs PY={py_intents}"

    # 2. NextState sync
    match_state = re.search(r"export type BrainTurnNextState\s*=\s*([^;]+);", content)
    assert match_state, "Could not find BrainTurnNextState in index.ts"
    ts_states = set(re.findall(r"'([^']+)'", match_state.group(1)))
    py_states = set(BrainTurnNextState.__args__)
    assert ts_states == py_states, f"BrainTurnNextState mismatch: TS={ts_states} vs PY={py_states}"


def test_brain_turn_v1_schema_validation():
    """Validates serialization and validation rules of BrainTurnV1."""
    turn = BrainTurnV1(
        intent="verify_identity" if "verify_identity" in BrainTurnIntent.__args__ else "confirm_identity",
        next_state="disclose",
        utterance="生年月日を確認いたしました。ご用件をお伝えします。",
        tool_calls=[BrainToolCall(name="verify_dob", arguments={"dob": "1985-04-12"})]
    )
    dumped_json = turn.model_dump_json()
    reloaded = BrainTurnV1.model_validate_json(dumped_json)
    assert reloaded.intent == turn.intent
    assert reloaded.next_state == "disclose"
    assert reloaded.utterance == turn.utterance
    assert len(reloaded.tool_calls) == 1
    assert reloaded.tool_calls[0].name == "verify_dob"

    # Validate JSON Schema generation
    assert "properties" in BRAIN_TURN_V1_SCHEMA
    assert "intent" in BRAIN_TURN_V1_SCHEMA["properties"]
    assert "next_state" in BRAIN_TURN_V1_SCHEMA["properties"]
    assert "utterance" in BRAIN_TURN_V1_SCHEMA["properties"]

def test_pydantic_schema_validation():
    req = BrainRequest(
        sessionId="s_test",
        uttId=1,
        text="こんにちは",
        tCaptureMs=1000,
        config={"key": "val"},
        context=["prev utterance"]
    )
    assert req.sessionId == "s_test"
    assert req.uttId == 1
    assert req.text == "こんにちは"

    resp = BrainResponse(
        text="ご用件をお伺いします。",
        events=[
            BrainEvent(
                type="state_change",
                payload={"phase": "verify_identity"},
                ts=1050
            )
        ],
        metrics=BrainMetrics(
            llmMs=45.2,
            ttftMs=12.0,
            tokensIn=15,
            tokensOut=10,
            model="gpt-4o-mini"
        )
    )
    assert resp.text == "ご用件をお伺いします。"
    assert len(resp.events) == 1
    assert resp.events[0].type == "state_change"
    assert resp.metrics.tokensIn == 15
