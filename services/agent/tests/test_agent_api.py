import os
import sys
import pytest
from fastapi.testclient import TestClient

agent_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if agent_dir not in sys.path:
    sys.path.insert(0, agent_dir)

from datetime import datetime
import app.main as agent_main
from app.compliance.clock import FakeClock, TOKYO_TZ

# Inject daytime clock (14:00 Tokyo) for deterministic test execution
test_clock = FakeClock(datetime(2026, 10, 2, 14, 0, tzinfo=TOKYO_TZ))
agent_main.guard.clock = test_clock
agent_main.graph_agent.guard.clock = test_clock
agent_main.baseline_agent.guard.clock = test_clock

client = TestClient(agent_main.app)

def test_healthz():
    resp = client.get("/healthz")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert data["service"] == "agent"

def test_turn_interaction():
    session_id = "s_test_api_123"
    # Start session
    start_resp = client.post("/session/start", json={"sessionId": session_id, "debtorId": "deb_001"})
    assert start_resp.status_code == 200

    req_payload = {
        "sessionId": session_id,
        "uttId": 1,
        "text": "もしもし",
        "tCaptureMs": 1700000000000,
        "context": []
    }
    resp = client.post("/turn", json=req_payload)
    assert resp.status_code == 200
    data = resp.json()
    assert "text" in data
    assert "events" in data
    assert len(data["events"]) > 0
    assert "metrics" in data
    assert data["metrics"]["tokensIn"] > 0

def test_session_lifecycle():
    # Start session
    start_resp = client.post("/session/start", json={"sessionId": "s_lifecycle", "debtorId": "deb_002"})
    assert start_resp.status_code == 200
    assert start_resp.json()["status"] == "started"

    # End session
    end_resp = client.post("/session/end", json={"sessionId": "s_lifecycle"})
    assert end_resp.status_code == 200
    assert end_resp.json()["status"] == "ended"

def test_screening_turn_interaction():
    session_id = "s_screening_001"
    req_payload = {
        "sessionId": session_id,
        "uttId": 1,
        "text": "はい、佐藤です。よろしくお願いします。",
        "tCaptureMs": 1700000000000,
        "config": {
            "domain": "screening",
            "instructions": "Screen candidate for senior backend role",
            "context": {"candidateName": "佐藤 健一", "targetRole": "リードエンジニア"}
        },
        "context": []
    }
    resp = client.post("/turn", json=req_payload)
    assert resp.status_code == 200
    data = resp.json()
    # Turn 1 is the reply to the already-spoken greeting: it must advance
    # (acknowledge background + ask next slot), never re-greet verbatim.
    assert "勤務形態" in data["text"] or "年収" in data["text"] or "ご経験" in data["text"]
    assert "events" in data
    assert any(e["payload"].get("domain") == "screening" for e in data["events"])

def test_english_screening_turn_interaction():
    session_id = "s_screening_en_001"
    req_payload = {
        "sessionId": session_id,
        "uttId": 1,
        "text": "Hello, I am ready for the interview.",
        "tCaptureMs": 1700000000000,
        "config": {
            "domain": "screening",
            "language": "en",
            "instructions": "Screen candidate for Senior Engineer",
            "context": {"candidateName": "Alex Johnson", "targetRole": "Senior Engineer"}
        },
        "context": []
    }
    resp = client.post("/turn", json=req_payload)
    assert resp.status_code == 200
    data = resp.json()
    assert "working arrangement" in data["text"] or "compensation" in data["text"]
    assert any(e["payload"].get("language") == "en" for e in data["events"])

def test_english_collections_turn_interaction():
    session_id = "s_collections_en_001"
    req_payload = {
        "sessionId": session_id,
        "uttId": 1,
        "text": "Hello, speaking.",
        "tCaptureMs": 1700000000000,
        "config": {
            "domain": "collections",
            "language": "en",
            "context": {"debtorName": "Alex Johnson"}
        },
        "context": []
    }
    resp = client.post("/turn", json=req_payload)
    assert resp.status_code == 200
    data = resp.json()
    # Gateway already greeted (utt 0): turn 1 must ask for DOB, not re-greet.
    assert "date of birth" in data["text"].lower()
    assert any(e["payload"].get("language") == "en" for e in data["events"])

