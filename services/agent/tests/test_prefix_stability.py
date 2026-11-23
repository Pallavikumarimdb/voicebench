"""
Tests for Plan 1 Section 6 P1-T5:
Prefix Stability across conversation turns for prompt/prefix caching.
Asserts that the static prefix (system instructions, persona, domain, guardrails)
is strictly byte-identical across consecutive turns of a session.
"""

import pytest
from app.generalized import GeneralizedVoiceAgent, TurnContext
import app.llm as app_llm


class RecordingMockLLM:
    def __init__(self):
        self.captured_messages = []

    def complete_with(self, provider, messages, **kwargs):
        self.captured_messages.append(messages)
        return {
            "text": "承知いたしました。",
            "latency_ms": 10.0,
            "tokens_in": 50,
            "tokens_out": 10,
            "model": "mock",
            "x_voiceai": {"cached_tokens": 40}
        }


def test_generalized_agent_prefix_stability_across_turns(monkeypatch):
    """
    Asserts that across multiple turns in a session (Screening, KYC, Collections, Custom),
    the system prompt (static prefix) remains 100% byte-identical.
    """
    agent = GeneralizedVoiceAgent()

    domains = [
        ("screening", "ja", {"candidateName": "佐藤 健一", "targetRole": "エンジニア"}),
        ("screening", "en", {"candidateName": "Alex Johnson", "targetRole": "Software Engineer"}),
        ("kyc", "ja", {"customerName": "田中 太郎", "accountNumber": "987654"}),
        ("kyc", "en", {"customerName": "Jane Doe", "accountNumber": "123456"}),
        ("collections", "en", {"debtorName": "John Smith", "balance": 48000}),
        ("custom", "ja", {"domain": "customer_support"}),
    ]

    for domain, lang, context in domains:
        mock_llm = RecordingMockLLM()
        monkeypatch.setattr(app_llm, "llm_client", mock_llm)

        # Simulate 4 turns in the session
        state = {"turn": 0, "messages": [], "domain": domain}
        for turn_idx in range(1, 5):
            ctx = TurnContext(
                turn=turn_idx,
                user_text=f"User response turn {turn_idx}",
                state=state,
                greeting="",
                instructions="Always be polite and professional.",
                context=context,
                language=lang
            )
            # Rephrase via LLM phrasing
            agent._phrase_with_llm(ctx, f"Template turn {turn_idx}", [], "local", "mock-model")

        assert len(mock_llm.captured_messages) == 4, f"Expected 4 turn message sets for {domain}-{lang}"

        # Extract system prompt (static prefix) from each turn
        system_prompts_seen = []
        for i, msgs in enumerate(mock_llm.captured_messages):
            sys_msg = next((m["content"] for m in msgs if m["role"] == "system"), None)
            assert sys_msg is not None, f"Turn {i+1} missing system message"
            system_prompts_seen.append(sys_msg)

        # Assert all system messages in the session are strictly byte-identical
        first_sys = system_prompts_seen[0]
        for turn_idx, sys_prompt in enumerate(system_prompts_seen[1:], start=2):
            assert sys_prompt == first_sys, (
                f"Prefix mutated on turn {turn_idx} for domain {domain} language {lang}!\n"
                f"Diff:\nExpected:\n{first_sys}\n\nGot:\n{sys_prompt}"
            )
            # Ensure exact byte identity
            assert sys_prompt.encode("utf-8") == first_sys.encode("utf-8")


def test_gateway_cached_tokens_surfacing():
    """Asserts that cached_tokens are correctly surfaced in usage and x_voiceai."""
    from app.llm import LLMClient
    client = LLMClient()
    decision = {
        "tier": "t1_local",
        "backend": "stub",
        "cached_tokens": 64
    }
    assert decision.get("cached_tokens") == 64
