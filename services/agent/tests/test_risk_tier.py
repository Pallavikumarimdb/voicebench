"""
Tests for Plan 1 Section 6 P2-T2:
Deterministic Risk Tier Derivation from Graph State.
Tests each domain (Collections, Screening, KYC, Custom) against policy criteria.
"""

import pytest
from app.risk import derive_risk_tier


def test_collections_risk_tier_derivation():
    """
    Collections domain:
    - Unverified identity -> 'high' (hazard: third-party debt disclosure)
    - Negotiation or promise capture -> 'medium' (binding financial commitments)
    - Verified identity in greeting, disclosure, or close -> 'low'
    """
    # 1. Unverified identity in any phase must be HIGH risk
    assert derive_risk_tier({"identity_verified": False, "phase": "greet"}, "collections") == "high"
    assert derive_risk_tier({"identity_verified": False, "phase": "disclose"}, "collections") == "high"
    assert derive_risk_tier({"identity_verified": False, "phase": "negotiate"}, "collections") == "high"

    # 2. Verified identity in negotiation / promise capture must be MEDIUM risk
    assert derive_risk_tier({"identity_verified": True, "phase": "negotiate"}, "collections") == "medium"
    assert derive_risk_tier({"identity_verified": True, "phase": "capture_promise"}, "collections") == "medium"

    # 3. Verified identity in greet / disclose / close must be LOW risk
    assert derive_risk_tier({"identity_verified": True, "phase": "greet"}, "collections") == "low"
    assert derive_risk_tier({"identity_verified": True, "phase": "disclose"}, "collections") == "low"
    assert derive_risk_tier({"identity_verified": True, "phase": "close"}, "collections") == "low"


def test_screening_risk_tier_derivation():
    """
    Screening domain:
    - Evaluation or decision -> 'high'
    - Pre-screen or identity -> 'medium'
    - Experience inquiry or closing -> 'low'
    """
    assert derive_risk_tier({"stage": "evaluation"}, "screening") == "high"
    assert derive_risk_tier({"stage": "decision"}, "screening") == "high"

    assert derive_risk_tier({"stage": "pre_screen"}, "screening") == "medium"
    assert derive_risk_tier({"stage": "identity"}, "screening") == "medium"

    assert derive_risk_tier({"stage": "experience_inquiry"}, "screening") == "low"
    assert derive_risk_tier({"stage": "closing"}, "screening") == "low"


def test_kyc_risk_tier_derivation():
    """
    KYC domain:
    - Unverified customer or auth stage -> 'high'
    - Verified customer -> 'low'
    """
    assert derive_risk_tier({"verified": False, "stage": "auth"}, "kyc") == "high"
    assert derive_risk_tier({"verified": False, "stage": "greeting"}, "kyc") == "high"
    assert derive_risk_tier({"verified": True, "stage": "auth"}, "kyc") == "high"

    assert derive_risk_tier({"verified": True, "stage": "service_inquiry"}, "kyc") == "low"


def test_custom_domain_risk_tier_derivation():
    """
    Custom domain:
    - Explicit is_high_risk flag -> 'high'
    - Sensitive / payment stages -> 'high'
    - Triage / inquiry stages -> 'medium'
    - Default conversational stage -> 'low'
    """
    assert derive_risk_tier({"is_high_risk": True}, "custom") == "high"
    assert derive_risk_tier({"stage": "payment"}, "custom") == "high"
    assert derive_risk_tier({"stage": "sensitive"}, "custom") == "high"

    assert derive_risk_tier({"stage": "triage"}, "custom") == "medium"
    assert derive_risk_tier({"stage": "inquiry"}, "custom") == "medium"

    assert derive_risk_tier({"stage": "general_info"}, "custom") == "low"
