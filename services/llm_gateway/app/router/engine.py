"""
Pure Function Rule Engine for LLM Gateway (Plan 1 Section 6 P2-T1).
Evaluates policy routing.rules with Section 5.2 metadata inputs.
First match wins. Decision time p95 <= 2 ms.
"""

import time
from dataclasses import dataclass, field
from typing import Dict, Any, List, Optional, Set


@dataclass(frozen=True)
class RoutingInput:
    profile: str = "default"
    session_id: str = "sess_default"
    turn_id: str = "0"
    dialogue_state: Optional[str] = None
    risk_tier: str = "low"
    asr_confidence: Optional[float] = None
    utterance_tokens: int = 0
    circuit_open_tiers: Set[str] = field(default_factory=frozenset)
    disabled_tiers: Set[str] = field(default_factory=frozenset)
    custom_attrs: Dict[str, Any] = field(default_factory=dict)


@dataclass
class RoutingDecision:
    rule_id: str
    tier: str
    backend: str
    model: str
    reason_code: str  # "RULE_MATCH", "DEFAULT", "CIRCUIT_OPEN", "TIER_DISABLED"
    fallback_chain: List[str]
    constraint_mode: str  # "strict", "schema+mask", "none"
    decision_time_us: float


def match_condition(key: str, target_val: Any, actual_inputs: Dict[str, Any]) -> bool:
    """Matches a single condition predicate against actual input values."""
    if key.endswith("_gt"):
        field_name = key[:-3]
        actual = actual_inputs.get(field_name)
        if actual is None:
            return False
        return float(actual) > float(target_val)

    if key.endswith("_gte"):
        field_name = key[:-4]
        actual = actual_inputs.get(field_name)
        if actual is None:
            return False
        return float(actual) >= float(target_val)

    if key.endswith("_lt"):
        field_name = key[:-3]
        actual = actual_inputs.get(field_name)
        if actual is None:
            return False
        return float(actual) < float(target_val)

    if key.endswith("_lte"):
        field_name = key[:-4]
        actual = actual_inputs.get(field_name)
        if actual is None:
            return False
        return float(actual) <= float(target_val)

    if key.endswith("_in"):
        field_name = key[:-3]
        actual = actual_inputs.get(field_name)
        return actual in target_val

    actual = actual_inputs.get(key)
    return actual == target_val


def evaluate_routing_rule(
    policy: Dict[str, Any],
    r_input: RoutingInput
) -> RoutingDecision:
    """
    Pure evaluation function. First matching rule wins.
    Traverses fallback ladder if preferred tier is circuit-open or disabled.
    Guarantees decision time p95 <= 2 ms (typically < 0.05 ms).
    """
    t0 = time.perf_counter()

    tiers_config = policy.get("tiers", {})
    rules = policy.get("rules", [])

    input_map = {
        "profile": r_input.profile,
        "dialogue_state": r_input.dialogue_state,
        "risk_tier": r_input.risk_tier,
        "asr_confidence": r_input.asr_confidence,
        "utterance_tokens": r_input.utterance_tokens,
    }
    input_map.update(r_input.custom_attrs)

    matched_rule = None
    reason_code = "DEFAULT"

    for rule in rules:
        if rule.get("default", False):
            matched_rule = rule
            reason_code = "DEFAULT"
            break

        when = rule.get("when", {})
        if not when:
            matched_rule = rule
            reason_code = "RULE_MATCH"
            break

        # Check all predicates in `when`
        all_matched = True
        for cond_key, cond_val in when.items():
            if not match_condition(cond_key, cond_val, input_map):
                all_matched = False
                break

        if all_matched:
            matched_rule = rule
            reason_code = "RULE_MATCH"
            break

    # If no rule matched, synthesize a default fallback
    if not matched_rule:
        matched_rule = {
            "id": "r_default",
            "use": "t1_local",
            "fallback": ["t3_safe_mode"],
            "constrain": "none"
        }
        reason_code = "DEFAULT"

    rule_id = matched_rule.get("id", "r_default")
    primary_tier = matched_rule.get("use") or matched_rule.get("route", "t1_local")
    configured_fallbacks = matched_rule.get("fallback", ["t3_safe_mode"])
    constrain = matched_rule.get("constrain", "none")

    # Tier candidate ladder starting with primary tier
    candidates = [primary_tier] + [f for f in configured_fallbacks if f != primary_tier]

    selected_tier = None
    fallback_chain = []

    for tier_cand in candidates:
        tier_cfg = tiers_config.get(tier_cand, {})
        # Check if tier is disabled in policy
        if tier_cfg.get("enabled") is False or tier_cand in r_input.disabled_tiers:
            fallback_chain.append(tier_cand)
            continue
        # Check if tier circuit is open
        if tier_cand in r_input.circuit_open_tiers:
            fallback_chain.append(tier_cand)
            continue

        selected_tier = tier_cand
        break

    if selected_tier is None:
        # All tiers unavailable -> degrade to t3_safe_mode
        selected_tier = "t3_safe_mode"
        reason_code = "ALL_BACKENDS_FAILED"

    tier_cfg = tiers_config.get(selected_tier, {})
    backend = tier_cfg.get("backend", "deterministic" if selected_tier in ("t0_fast_path", "t3_safe_mode") else "ollama_local")
    model = tier_cfg.get("model", "scripted" if selected_tier in ("t0_fast_path", "t3_safe_mode") else "qwen3:1.7b")

    t1 = time.perf_counter()
    decision_time_us = (t1 - t0) * 1_000_000.0

    return RoutingDecision(
        rule_id=rule_id,
        tier=selected_tier,
        backend=backend,
        model=model,
        reason_code=reason_code,
        fallback_chain=fallback_chain,
        constraint_mode=constrain,
        decision_time_us=round(decision_time_us, 2)
    )
