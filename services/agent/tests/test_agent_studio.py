import pytest
from app.agent_studio import AgentStudioManager, StudioPersona, VoiceSettings, LLMSettings

@pytest.fixture
def manager():
    return AgentStudioManager()

def test_default_personas_seeded(manager):
    personas = manager.list_personas()
    assert len(personas) >= 3
    ids = {p["id"] for p in personas}
    assert "mirai_collections_ja" in ids
    assert "apex_collections_en" in ids
    assert "talent_screener_en" in ids

def test_persona_crud(manager):
    new_data = {
        "id": "test_agent_kyc",
        "name": "KYC FastPass AI",
        "description": "2-factor authentication specialist",
        "domain": "kyc",
        "language": "en",
        "system_prompt": "Authenticate callers using SSN last 4 digits and zip code.",
        "greeting": "Hello, thank you for calling verify desk.",
        "voice_settings": {
            "provider": "openai",
            "voice_id": "shimmer",
            "speed": 1.1,
            "barge_in_sensitivity": "high",
            "pause_threshold_ms": 400
        },
        "llm_settings": {
            "provider": "openai",
            "model": "gpt-4o-mini",
            "temperature": 0.2,
            "max_tokens": 200
        },
        "assigned_tools": ["lookup_account", "send_sms_confirmation"]
    }

    saved = manager.save_persona(new_data)
    assert saved.id == "test_agent_kyc"
    assert saved.voice_settings.speed == 1.1

    retrieved = manager.get_persona("test_agent_kyc")
    assert retrieved is not None
    assert retrieved.name == "KYC FastPass AI"

    # Delete
    deleted = manager.delete_persona("test_agent_kyc")
    assert deleted is True
    assert manager.get_persona("test_agent_kyc") is None

def test_persona_turn_simulation_ja(manager):
    res = manager.simulate_turn("mirai_collections_ja", "1985年4月12日です。")
    assert res["success"] is True
    assert "48,000円" in res["agent_response"]
    assert "lookup_account" in res["triggered_tools"]
    assert res["latency_ms"] > 0

def test_persona_turn_simulation_en(manager):
    res = manager.simulate_turn("apex_collections_en", "I was born on 1988-04-15.")
    assert res["success"] is True
    assert "$350.00" in res["agent_response"]
    assert "lookup_account" in res["triggered_tools"]
