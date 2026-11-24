"""
Token-Level Compliance Mask (Plan 1 Section 6 P3-T3).
Constrains utterance tokens before identity verification (unverified_identity).
Forbids:
  - ASCII digits (0-9)
  - Full-width digits (０-９, \uFF10-\uFF19)
  - Currency symbols (円, ¥, ￥, \u00A5, \uFFE5)
CRITICAL INVARIANT:
  Do NOT blanket-ban kanji numerals (一, 十, 万, ...):
  they appear in ordinary words such as 一度, 十分, 一緒, 万一, 第一, 一般, 統一.
  Amount patterns written in kanji remain the defense-in-depth job of the post-guard.
"""

import re
from typing import Optional, Tuple, Dict, Any, List

# Forbidden character pattern while identity is unverified
UNVERIFIED_FORBIDDEN_CHARS_PATTERN = re.compile(r'([0-9\uFF10-\uFF19円¥￥\u00A5\uFFE5])')

# GBNF character class expression for llama.cpp / grammar engines
UNVERIFIED_GBNF_CHAR_CLASS = r'[^0-9\uFF10-\uFF19円¥￥\u00A5\uFFE5]*'

# Regex pattern for guided_regex (vLLM / Outlines / SGLang)
UNVERIFIED_GUIDED_REGEX = r'^[^0-9\uFF10-\uFF19円¥￥\u00A5\uFFE5]*$'


def get_unverified_utterance_regex() -> str:
    """Returns regex pattern for guided decoding during unverified identity state."""
    return UNVERIFIED_GUIDED_REGEX


def get_unverified_gbnf_grammar() -> str:
    """Returns GBNF grammar specification for llama.cpp during unverified identity state."""
    return f'root ::= "{UNVERIFIED_GBNF_CHAR_CLASS}"'


def check_token_mask(text: str, identity_verified: bool) -> Optional[Tuple[str, str]]:
    """
    Checks if text violates the unverified token mask.
    Returns (rule_code, violating_char) if blocked, None if clean.
    """
    if identity_verified:
        return None

    match = UNVERIFIED_FORBIDDEN_CHARS_PATTERN.search(text)
    if match:
        violating_char = match.group(1)
        return ("TOKEN_MASK_UNVERIFIED_CHAR", violating_char)

    return None


def sanitize_with_token_mask(text: str, identity_verified: bool, fallback_text: Optional[str] = None) -> str:
    """
    Applies token mask filtering.
    If identity is unverified and violating digits/currency symbols are found,
    replaces them with a safe conversational fallback.
    """
    if identity_verified:
        return text

    match = UNVERIFIED_FORBIDDEN_CHARS_PATTERN.search(text)
    if not match:
        return text

    # If fallback is provided, use it; otherwise scrub digits/currency symbols
    if fallback_text:
        return fallback_text

    # Default scrubbing: remove forbidden digits and symbols
    sanitized = UNVERIFIED_FORBIDDEN_CHARS_PATTERN.sub("", text)
    return sanitized.strip()
