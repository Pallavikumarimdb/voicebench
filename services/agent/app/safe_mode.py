"""
Deterministic Safe-Mode (T3) Fallback Scripts (Plan 1 Section 6 P2-T4).
When all LLM backends fail (ALL_BACKENDS_FAILED / total outage),
the agent produces a compliant, deterministic scripted response with human handoff.
Documented in docs/japanese_review.md (flagged: needs human review).
"""

from typing import Dict, Any, Tuple

SAFE_MODE_SCRIPTS: Dict[str, Dict[str, str]] = {
    "collections": {
        "ja": "大変恐れ入ります。現在システム通信が混み合っております。担当のオペレーターへお繋ぎいたしますので、少々お待ちいただけますでしょうか。",
        "en": "I apologize, but our system is currently experiencing technical difficulties. Let me transfer you directly to a representative. Please stay on the line."
    },
    "screening": {
        "ja": "恐れ入ります。現在通信状況が不安定なため、採用担当者より改めてメールにて面接日程をご案内させていただきます。本日はお時間をいただきありがとうございました。",
        "en": "I apologize, but our automated system is experiencing technical issues. A hiring coordinator will follow up with you directly by email within one business day."
    },
    "kyc": {
        "ja": "大変恐れ入ります。セキュリティ認証システムが混み合っているため、専門窓口のオペレーターへ転送いたします。そのままお待ちください。",
        "en": "I apologize, but we cannot complete verification at this time. I am transferring your call to a customer verification specialist. Please hold."
    },
    "custom": {
        "ja": "大変恐れ入ります。現在システムが混み合っております。担当のオペレーターにお繋ぎいたします。",
        "en": "I apologize, but we are currently experiencing technical difficulties. Let me transfer you to a specialist."
    }
}


def get_safe_mode_response(domain: str = "collections", language: str = "ja") -> Tuple[str, str]:
    """
    Returns (script_text, reason_code) for Tier 3 Safe-Mode degradation.
    """
    domain_key = (domain or "collections").lower()
    lang_key = (language or "ja").lower()
    if lang_key not in ("ja", "en"):
        lang_key = "ja"

    domain_scripts = SAFE_MODE_SCRIPTS.get(domain_key, SAFE_MODE_SCRIPTS["custom"])
    script_text = domain_scripts.get(lang_key, domain_scripts["ja"])
    return script_text, "ALL_BACKENDS_FAILED"
