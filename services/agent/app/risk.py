"""
Deterministic Risk Tier Derivation (Plan 1 Section 6 P2-T2).
Derives risk_tier ('high', 'medium', 'low') deterministically from graph state
per domain (Collections, Screening, KYC, Custom).
Documented in docs/policy_reference.md.
"""

from typing import Dict, Any, Optional


def derive_risk_tier(state: Dict[str, Any], domain: str = "collections") -> str:
    """
    Deterministically computes risk tier from domain graph state.
    Returns: 'high', 'medium', or 'low'.
    """
    domain = (domain or "collections").lower()

    if domain == "collections":
        # Rule 1: Unverified identity is HIGH risk (third-party disclosure hazard)
        verified = state.get("identity_verified", False)
        if not verified:
            return "high"

        # Rule 2: Negotiation and promise capture are MEDIUM risk (binding commitments)
        phase = state.get("phase", "greet")
        if phase in ("negotiate", "capture_promise"):
            return "medium"

        # Rule 3: Greet, disclose, dispute, close when identity verified are LOW risk
        return "low"

    elif domain == "screening":
        # Candidate screening: evaluation & hiring decision stages are HIGH risk
        stage = state.get("stage", "experience_inquiry")
        if stage in ("evaluation", "decision"):
            return "high"
        if stage in ("pre_screen", "identity"):
            return "medium"
        return "low"

    elif domain == "kyc":
        # Identity verification: unverified state is HIGH risk
        auth_ok = state.get("verified", False) or state.get("identity_verified", False)
        if not auth_ok:
            return "high"
        stage = state.get("stage", "active")
        if stage in ("auth", "security_check"):
            return "high"
        return "low"

    else:
        # Custom domain: explicit flags or sensitive stages
        if state.get("is_high_risk", False):
            return "high"
        stage = state.get("stage", "default")
        if stage in ("sensitive", "auth", "financial", "payment"):
            return "high"
        if stage in ("triage", "inquiry"):
            return "medium"
        return "low"
