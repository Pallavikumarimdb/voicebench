"""
Tests for LLM Gateway Rule Engine (Plan 1 Section 6 P2-T1).
Validates first-match-wins routing, predicate operators, fallback ladders,
circuit open degradation, and decision time budget (p95 <= 2 ms).
"""

import sys
import os
import yaml
import pytest
import numpy as np

service_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if sys.path[0] != service_root:
    sys.path.insert(0, service_root)

from app.router.engine import (
    RoutingInput,
    RoutingDecision,
    evaluate_routing_rule,
    match_condition
)


@pytest.fixture
def policy():
    policy_path = os.path.join(service_root, "..", "..", "config", "policies", "default.yaml")
    with open(policy_path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def test_match_condition_operators():
    """Validates predicate operator matching: equality, gt, gte, lt, lte, in."""
    inputs = {"tokens": 30, "conf": 0.85, "state": "negotiation"}

    assert match_condition("state", "negotiation", inputs) is True
    assert match_condition("state", "greeting", inputs) is False

    assert match_condition("tokens_gt", 25, inputs) is True
    assert match_condition("tokens_gt", 35, inputs) is False

    assert match_condition("conf_lt", 0.9, inputs) is True
    assert match_condition("conf_lt", 0.8, inputs) is False

    assert match_condition("state_in", ["negotiation", "close"], inputs) is True
    assert match_condition("state_in", ["greeting", "verify"], inputs) is False


def test_routing_table_of_cases(policy):
    """
    Validates canonical routing test cases from Plan 1 Section 5.1 & 5.2.
    """
    # Case 1: High risk -> r_high_risk, t1_local, strict constraint
    r_high = RoutingInput(risk_tier="high", dialogue_state="greeting", utterance_tokens=10)
    dec_high = evaluate_routing_rule(policy, r_high)
    assert dec_high.rule_id == "r_high_risk"
    assert dec_high.tier == "t1_local"
    assert dec_high.constraint_mode == "strict"
    assert dec_high.reason_code == "RULE_MATCH"

    # Case 2: Hard turn (negotiation + tokens > 25), with t2_large disabled by default
    # Fallback ladder must advance from t2_large to t1_local
    r_hard = RoutingInput(risk_tier="low", dialogue_state="negotiation", utterance_tokens=35)
    dec_hard = evaluate_routing_rule(policy, r_hard)
    assert dec_hard.rule_id == "r_hard_turn"
    assert dec_hard.tier == "t1_local"
    assert "t2_large" in dec_hard.fallback_chain

    # Case 3: Hard turn with t2_large enabled in policy
    policy_t2_enabled = dict(policy)
    policy_t2_enabled["tiers"] = dict(policy["tiers"])
    policy_t2_enabled["tiers"]["t2_large"] = dict(policy["tiers"]["t2_large"])
    policy_t2_enabled["tiers"]["t2_large"]["enabled"] = True

    dec_hard_t2 = evaluate_routing_rule(policy_t2_enabled, r_hard)
    assert dec_hard_t2.rule_id == "r_hard_turn"
    assert dec_hard_t2.tier == "t2_large"
    assert dec_hard_t2.backend == "remote_large"

    # Case 4: Default low risk turn -> r_default, t1_local
    r_default = RoutingInput(risk_tier="low", dialogue_state="greeting", utterance_tokens=5)
    dec_default = evaluate_routing_rule(policy, r_default)
    assert dec_default.rule_id == "r_default"
    assert dec_default.tier == "t1_local"
    assert dec_default.reason_code == "DEFAULT"

    # Case 5: Circuit open on t1_local -> degrades to t3_safe_mode
    r_circuit_open = RoutingInput(
        risk_tier="low",
        circuit_open_tiers={"t1_local"}
    )
    dec_co = evaluate_routing_rule(policy, r_circuit_open)
    assert dec_co.tier == "t3_safe_mode"
    assert "t1_local" in dec_co.fallback_chain

    # Case 6: All backends failed / disabled
    r_all_down = RoutingInput(
        risk_tier="high",
        circuit_open_tiers={"t1_local", "t2_large", "t3_safe_mode"}
    )
    dec_all = evaluate_routing_rule(policy, r_all_down)
    assert dec_all.tier == "t3_safe_mode"
    assert dec_all.reason_code == "ALL_BACKENDS_FAILED"


def test_decision_time_budget_p95(policy):
    """
    Asserts router decision time p95 <= 2 ms over 1,000 evaluations.
    Budget from Plan 1 Section 5.5: Router decision time p95 <= 2 ms.
    """
    inputs = [
        RoutingInput(risk_tier="high", dialogue_state="greeting", utterance_tokens=10),
        RoutingInput(risk_tier="low", dialogue_state="negotiation", utterance_tokens=30),
        RoutingInput(risk_tier="low", dialogue_state="discover", utterance_tokens=15),
        RoutingInput(risk_tier="low", circuit_open_tiers={"t1_local"}),
    ]

    durations_ms = []
    # Warmup
    for inp in inputs:
        evaluate_routing_rule(policy, inp)

    # 1000 iterations
    for i in range(1000):
        inp = inputs[i % len(inputs)]
        dec = evaluate_routing_rule(policy, inp)
        durations_ms.append(dec.decision_time_us / 1000.0)

    p50 = float(np.percentile(durations_ms, 50))
    p95 = float(np.percentile(durations_ms, 95))
    p99 = float(np.percentile(durations_ms, 99))

    print(f"\nRouter decision time: p50={p50:.4f}ms, p95={p95:.4f}ms, p99={p99:.4f}ms")
    assert p95 <= 2.0, f"Router decision time p95 exceeded 2ms budget: {p95}ms"
    assert p50 < 0.5, f"Expected sub-millisecond p50 decision time, got {p50}ms"
