"""
Conversation Simulator for Collections Voice Agent Evaluation.
Drives agent <-> simulated debtor across diverse personas in text mode.
Supports seeds, noise layer, and max-turn caps.
"""

import os
import yaml
import time
from typing import Dict, Any, List, Optional
from datetime import datetime

from services.agent.app.graph import CollectionsGraphAgent
from services.agent.app.baseline import BaselineCollectionsAgent
from services.agent.app.compliance.clock import FakeClock, TOKYO_TZ
from services.agent.app.compliance.guard import ComplianceGuard
from services.agent.app.audit import AuditLogger
from services.agent.app.mock_crm.crm import crm
from .noise import ASRNoiseGenerator

PERSONAS_DIR = os.path.join(os.path.dirname(__file__), "personas")

class ConversationSimulator:
    def __init__(self, personas_dir: Optional[str] = None):
        self.personas_dir = personas_dir or PERSONAS_DIR

    def load_persona(self, persona_id: str) -> Dict[str, Any]:
        path = os.path.join(self.personas_dir, f"{persona_id}.yaml")
        if not os.path.exists(path):
            raise FileNotFoundError(f"Persona file not found: {path}")
        with open(path, "r", encoding="utf-8") as f:
            return yaml.safe_load(f)

    def run_simulation(
        self,
        variant: str,
        persona_id: str,
        seed: int = 42,
        max_turns: int = 10,
        apply_asr_noise: bool = False
    ) -> Dict[str, Any]:
        """Runs a complete simulation call and returns transcript, audit log, and outcome."""
        persona = self.load_persona(persona_id)
        debtor_id = persona.get("debtor_id", "deb_001")
        session_id = f"sim_{variant}_{persona_id}_{seed}_{int(time.time()*1000)}"

        # Deterministic daytime clock (14:00 Tokyo)
        fake_clock = FakeClock(datetime(2026, 10, 2, 14, 0, tzinfo=TOKYO_TZ))
        guard = ComplianceGuard(clock=fake_clock)
        audit_logger = AuditLogger(session_id)

        noise_gen = ASRNoiseGenerator(seed=seed, error_rate=0.20) if apply_asr_noise else None

        class NoOpGuard:
            def check_pre_turn(self, state): return None
            def check_post_llm(self, proposed_text, state): return None

        from .stub_llm import ScriptableStubLLM
        stub_llm = ScriptableStubLLM(violation_rate=0.45, seed=seed)

        class StubAblationAgent:
            def __init__(self, base_agent, guard_obj):
                self.base_agent = base_agent
                self.guard = guard_obj

            def process_turn(self, sess_id, u_text, s_state, a_logger=None):
                base_out = self.base_agent.process_turn(sess_id, u_text, s_state, audit_logger=None)
                proposed = stub_llm.generate_candidate_reply(
                    s_state.get("phase", "greet"),
                    s_state,
                    base_out["text"]
                )
                block = self.guard.check_post_llm(proposed, s_state)
                if block:
                    rule_code, fallback = block
                    final_text = fallback
                    if a_logger:
                        a_logger.append("compliance_block", {
                            "rule": rule_code,
                            "attempted": proposed,
                            "final": fallback
                        })
                else:
                    final_text = proposed

                if a_logger:
                    a_logger.append("agent_utterance", {
                        "attempted": proposed,
                        "final": final_text,
                        "phase": s_state.get("phase"),
                        "turn": s_state.get("turn_count", 1)
                    })

                base_out["text"] = final_text
                return base_out

        if variant == "v1_no_guard":
            agent = StubAblationAgent(BaselineCollectionsAgent(guard=NoOpGuard()), NoOpGuard())
        elif variant == "v1_baseline":
            agent = StubAblationAgent(BaselineCollectionsAgent(guard=guard), guard)
        elif variant == "v2_graph_no_slow_path":
            agent = CollectionsGraphAgent(guard=guard, enable_slow_path=False)
        else:
            agent = CollectionsGraphAgent(guard=guard, enable_slow_path=True)

        state: Dict[str, Any] = {
            "session_id": session_id,
            "debtor_id": debtor_id,
            "messages": [],
            "phase": "greet",
            "identity_verified": False,
            "verification_attempts": 0,
            "disclosure_done": False,
            "balance": None,
            "approved_terms": {},
            "offers_made": [],
            "promise_to_pay": None,
            "stop_contact": False,
            "third_party_detected": False,
            "escalation_reason": None,
            "turn_count": 0,
            "flags": {}
        }

        transcript: List[Dict[str, str]] = []
        turn_latencies: List[float] = []

        # Turn 0: Agent initiates call
        turn_res = agent.process_turn(session_id, "", state, audit_logger)
        transcript.append({"role": "assistant", "content": turn_res["text"]})
        turn_latencies.append(turn_res["metrics"].get("llmMs", 10.0))

        # Replay scripted debtor responses from persona
        scripted_turns = persona.get("scripted_turns", [])
        for user_utt in scripted_turns:
            if state.get("phase") == "close" or state.get("turn_count", 0) >= max_turns:
                break

            # Apply noise if enabled
            effective_user_text = noise_gen.apply_noise(user_utt) if noise_gen else user_utt
            transcript.append({"role": "user", "content": effective_user_text})

            turn_res = agent.process_turn(session_id, effective_user_text, state, audit_logger)
            transcript.append({"role": "assistant", "content": turn_res["text"]})
            turn_latencies.append(turn_res["metrics"].get("llmMs", 15.0))

        # Read back audit log
        with open(audit_logger.log_path, "r", encoding="utf-8") as f:
            audit_records = [yaml.safe_load(line) for line in f if line.strip()]

        crm_record = crm.get_by_id(debtor_id) or {}

        return {
            "session_id": session_id,
            "variant": variant,
            "persona_id": persona_id,
            "persona": persona,
            "transcript": transcript,
            "audit_log": audit_records,
            "final_state": state,
            "crm_record": crm_record,
            "turn_latencies": turn_latencies,
            "total_turns": state.get("turn_count", 0),
            "audit_log_path": audit_logger.log_path
        }

simulator = ConversationSimulator()
