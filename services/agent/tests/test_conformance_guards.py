"""
P7-T2 Cross-Language Guard Conformance Test (Python)
Verifies that the Python ComplianceGuard and parse_japanese_amount exactly pass
the shared packages/guards-spec/conformance.json vectors identically to TypeScript.
"""

import os
import json
import pytest
from app.compliance.guard import ComplianceGuard, parse_japanese_amount

# Path to shared single source of truth conformance vectors
SPEC_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "packages", "guards-spec"))
CONFORMANCE_PATH = os.path.join(SPEC_DIR, "conformance.json")


@pytest.fixture(scope="module")
def conformance_data():
    with open(CONFORMANCE_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def test_amount_parsing_conformance_vectors(conformance_data):
    """Assert Python parses all Japanese amount vectors identically to TS."""
    for vector in conformance_data["amount_parsing_vectors"]:
        parsed = parse_japanese_amount(vector["input"])
        sorted_actual = sorted(parsed)
        sorted_expected = sorted(vector["expected_amounts"])
        assert sorted_actual == sorted_expected, (
            f"Failed on vector: {vector['description']} -> {vector['input']}. "
            f"Expected {sorted_expected}, got {sorted_actual}"
        )


def test_post_llm_guard_conformance_vectors(conformance_data):
    """Assert Python guard checks produce identical violation codes to TS."""
    guard = ComplianceGuard()
    for vector in conformance_data["post_llm_guard_vectors"]:
        result = guard.check_post_llm(vector["input_text"], vector["state"])
        if vector["expected_violation"] is None:
            assert result is None, f"Expected compliant pass for vector: {vector['description']}"
        else:
            assert result is not None, f"Expected violation for vector: {vector['description']}"
            violation_code, _ = result
            assert violation_code == vector["expected_violation"], (
                f"Violation mismatch for: {vector['description']}. "
                f"Expected {vector['expected_violation']}, got {violation_code}"
            )
