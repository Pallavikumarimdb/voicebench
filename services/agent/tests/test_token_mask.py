"""
Tests for Plan 1 Section 6 P3-T3:
Token-Level Compliance Mask and Benign Japanese Corpus False-Positive Evaluation.
Asserts that ASCII/full-width digits and currency symbols are strictly blocked while unverified,
while kanji numerals in benign idioms (一度, 十分, 一緒, 万一, 第一, 一般, etc.) are 100% preserved.
"""

import pytest
from app.compliance.token_mask import (
    check_token_mask,
    sanitize_with_token_mask,
    get_unverified_utterance_regex,
    get_unverified_gbnf_grammar
)
from app.compliance.guard import ComplianceGuard

# 1. Benign Japanese corpus containing kanji numerals and everyday idioms
BENIGN_KANJI_NUMERAL_CORPUS = [
    "一度、現在の状況についてご相談いただけますでしょうか。",
    "十分にご説明させていただきますので、ご安心ください。",
    "一緒に無理のない解決策を考えさせていただけますか。",
    "万一、ご都合が合わない場合はお知らせください。",
    "第一にお客様のご意向をお伺いしたいと存じます。",
    "一般的な手続きの流れについてご案内いたします。",
    "統一された窓口にて担当オペレーターが対応いたします。",
    "万全の体制でお客様のサポートを行っております。",
    "一括でのお支払い以外にも、分割でのご相談が可能です。",
    "十人十色のご事情に合わせて丁寧に対応いたします。",
    "一度ご確認いただけますと幸いでございます。",
    "万全を期してお電話を差し上げております。"
]

# 2. General benign conversational phrases (no numbers)
BENIGN_GENERAL_CORPUS = [
    "お電話ありがとうございます。担当窓口でございます。",
    "ご本人様確認のため、生年月日をお伺いできますでしょうか。",
    "恐れ入りますが、お名前をお伺いできますでしょうか。",
    "少々お待ちいただけますでしょうか。確認いたします。",
    "電波状況が不安定なようでございます。声は届いておりますでしょうか。",
    "本日中にお電話をいただけますと幸いでございます。",
    "ご丁寧にご対応いただき、誠にありがとうございます。"
]

# 3. Violating utterances that MUST be caught when identity is unverified
VIOLATING_CORPUS = [
    ("ASCII digit leak", "山田様、現在の残高は98000円でございます。"),
    ("ASCII with comma", "未払い金48,000円のお支払いが確認できておりません。"),
    ("Full-width digit leak", "残高は９８０００円となっております。"),
    ("Currency yen mark", "ご請求額は¥98000でございます。"),
    ("Full-width yen mark", "￥48,000のお振込みをお願いいたします。"),
    ("Bare digit leak", "未納金額は48000です。"),
    ("Yen symbol", "残高が5000円残っております。")
]


def test_benign_corpus_zero_false_positives():
    """
    Asserts 0.0% false-positive rate on benign Japanese utterances.
    Ordinary words containing kanji numerals (一度, 十分, 一緒, 万一, etc.) MUST NOT be blocked.
    """
    combined_benign = BENIGN_KANJI_NUMERAL_CORPUS + BENIGN_GENERAL_CORPUS
    false_positives = []

    for phrase in combined_benign:
        # Check while unverified
        block = check_token_mask(phrase, identity_verified=False)
        if block is not None:
            false_positives.append((phrase, block))

    fp_rate = (len(false_positives) / len(combined_benign)) * 100.0
    assert len(false_positives) == 0, f"False positives detected ({fp_rate}%): {false_positives}"


def test_violating_corpus_100_percent_true_positives():
    """
    Asserts 100% detection rate on unverified utterances containing forbidden digits/currency.
    """
    for label, violating_text in VIOLATING_CORPUS:
        block = check_token_mask(violating_text, identity_verified=False)
        assert block is not None, f"Token mask failed to catch violation '{label}': {violating_text}"
        rule_code, char = block
        assert rule_code == "TOKEN_MASK_UNVERIFIED_CHAR"
        assert char in "0123456789０１２３４５６７８９円¥￥"


def test_verified_identity_bypasses_token_mask():
    """
    When identity is verified, token mask allows digits/currency.
    """
    verified_text = "残高は98,000円でございます。"
    block = check_token_mask(verified_text, identity_verified=True)
    assert block is None, "Token mask should not block text when identity is verified"


def test_sanitize_with_token_mask():
    """
    Validates sanitization: forbidden tokens are removed or replaced with safe fallback.
    """
    dirty_text = "ご請求額は98,000円です。"
    sanitized = sanitize_with_token_mask(dirty_text, identity_verified=False)
    assert "98" not in sanitized
    assert "円" not in sanitized

    # With fallback text
    fallback = sanitize_with_token_mask(dirty_text, identity_verified=False, fallback_text="ご請求の件でございます。")
    assert fallback == "ご請求の件でございます。"


def test_guard_override_rate_on_benign_corpus():
    """
    Evaluates guard override rate on benign corpus before and after token mask.
    Confirms post-guard does not rewrite benign kanji idioms.
    """
    guard = ComplianceGuard()
    state = {
        "identity_verified": False,
        "debtor_name": "田中 健一",
        "original_balance": 48000
    }

    override_count = 0
    total = len(BENIGN_KANJI_NUMERAL_CORPUS)

    for phrase in BENIGN_KANJI_NUMERAL_CORPUS:
        # Pre-check with token mask
        token_block = check_token_mask(phrase, identity_verified=False)
        assert token_block is None

        # Post-guard check
        post_block = guard.check_post_llm(phrase, state)
        if post_block:
            override_count += 1

    override_rate = (override_count / total) * 100.0
    assert override_count == 0, f"Post-guard falsely overrode benign kanji idioms: {override_count}/{total} ({override_rate}%)"


def test_grammar_and_regex_helpers():
    """Validates regex and GBNF grammar generators for constrained decoding engines."""
    regex_pattern = get_unverified_utterance_regex()
    assert "^" in regex_pattern and "$" in regex_pattern
    assert "円" in regex_pattern

    gbnf = get_unverified_gbnf_grammar()
    assert "root ::=" in gbnf
    assert "0-9" in gbnf
