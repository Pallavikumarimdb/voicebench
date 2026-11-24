"""
Deterministic Compliance Guard for Japanese Collections Voice Agent.
Enforces regulations outside the prompt.
"""

import os
import re
import yaml
from typing import Dict, Any, Optional, List, Tuple
from datetime import datetime, time

from .clock import Clock

RULES_FILE = os.path.join(os.path.dirname(__file__), "rules.yaml")

# Japanese Full-Width to Half-Width translation
ZENKAKU_DIGITS = str.maketrans("０１２３４５６７８９，", "0123456789,")

KANJI_NUMS = {
    '〇': 0, '一': 1, '二': 2, '三': 3, '四': 4,
    '五': 5, '六': 6, '七': 7, '八': 8, '九': 9,
    '十': 10, '百': 100, '千': 1000, '万': 10000
}

def normalize_japanese_numbers(text: str) -> str:
    """Normalize full-width digits and extract numerical equivalents."""
    return text.translate(ZENKAKU_DIGITS)

def parse_japanese_amount(text: str) -> List[int]:
    """
    Extracts all monetary amounts (in Yen) found in text, handling Arabic numerals,
    commas, and Japanese kanji units (万, 千, 百, 円).
    Returns list of extracted amounts as integers.
    """
    norm_text = normalize_japanese_numbers(text)
    amounts = []

    # 1. Mixed numerals like 4万8千円, 4万8000円, or 4万円
    for m in re.finditer(r'([0-9]+)\s*万\s*(?:([0-9]+)\s*千|([0-9]+))?\s*円?', norm_text):
        man = int(m.group(1)) * 10000
        sen = 0
        if m.group(2):
            sen = int(m.group(2)) * 1000
        elif m.group(3):
            sen = int(m.group(3))
        total = man + sen
        if total > 0:
            amounts.append(total)

    # 2. Pure kanji amounts like 一万二千円 or 四万八千円
    kanji_pattern = r'([一二三四五六七八九十百千万]+)\s*円'
    for m in re.finditer(kanji_pattern, norm_text):
        raw_kanji = m.group(1)
        val = 0
        temp = 0
        section = 0
        for char in raw_kanji:
            if char in '一二三四五六七八九':
                temp = KANJI_NUMS[char]
            elif char in '十百千':
                unit = KANJI_NUMS[char]
                section += (temp if temp > 0 else 1) * unit
                temp = 0
            elif char == '万':
                section += temp
                val += (section if section > 0 else 1) * 10000
                section = 0
                temp = 0
        val += section + temp
        if val > 0:
            amounts.append(val)

    # 3. Arabic numerals directly before '円': e.g., 48,000円 or 48000円 (not preceded by 万)
    # Mask out already processed '万...円' spans to avoid re-matching trailing digits
    text_without_man = re.sub(r'[0-9]+\s*万\s*(?:[0-9]+\s*千|[0-9]+)?\s*円?', ' ', norm_text)
    for m in re.finditer(r'([0-9]{1,3}(?:,[0-9]{3})+|[0-9]+)\s*円', text_without_man):
        num_str = m.group(1).replace(",", "")
        num = int(num_str)
        if num > 0:
            amounts.append(num)

    # 4. Bare large numbers with context of payment (e.g. "48000でお支払い")
    for m in re.finditer(r'(?:お支払い|金額|残高|ご請求|合計|頭金)\D{0,6}([0-9]{1,3}(?:,[0-9]{3})+|[0-9]{4,7})', text_without_man):
        num_str = m.group(1).replace(",", "")
        num = int(num_str)
        if num > 0:
            amounts.append(num)

    return list(set(amounts))

class ComplianceGuard:
    def __init__(self, rules_path: Optional[str] = None, clock: Optional[Clock] = None):
        self.rules_path = rules_path or RULES_FILE
        self.clock = clock or Clock()
        self.rules = self._load_rules()

        # Compile forbidden patterns (threats, shaming, false urgency, unauthorized legal action)
        self.forbidden_patterns = [
            # Japanese: Threats / Aggressive language
            (re.compile(r'(警察|逮捕|訴訟|差し押さえ|強制執行|裁判沙汰)', re.IGNORECASE), "threats_legal_force"),
            (re.compile(r'(会社|職場|家族|親族|近所|周囲).*(連絡|知らせ|バラす|払わせ|請求)', re.IGNORECASE), "shaming_third_party_threat"),
            # Japanese: Shaming / Insults
            (re.compile(r'(恥ずかしくない|無責任|常識がない|逃げるのか|いい加減にしろ)', re.IGNORECASE), "shaming_insult"),
            # Japanese: False urgency
            (re.compile(r'(今すぐ払え|今日中じゃないと許さない|猶予は一切ない)', re.IGNORECASE), "false_urgency"),

            # English: FDCPA Threats / Unlawful legal force
            (re.compile(r'(police|arrest|jail|prosecut|foreclose|garnish|lawsuit|sheriff|sue you)', re.IGNORECASE), "threats_legal_force"),
            # English: Third-party shaming / employer contact threats
            (re.compile(r'(employer|workplace|boss|coworker|family|neighbor|relative).*(contact|tell|call|notify|expose|shame)|(contact|tell|call|notify|expose|shame).*(employer|workplace|boss|coworker|family|neighbor|relative)', re.IGNORECASE), "shaming_third_party_threat"),
            # English: Shaming / Profanity / Insults
            (re.compile(r'(shameless|irresponsible|deadbeat|liar|scammer|pathetic|loser)', re.IGNORECASE), "shaming_insult"),
            # English: False urgency / Coercion
            (re.compile(r'(pay right now or else|immediate arrest|zero tolerance|today or we send)', re.IGNORECASE), "false_urgency")
        ]

    def _load_rules(self) -> Dict[str, Any]:
        if os.path.exists(self.rules_path):
            with open(self.rules_path, "r", encoding="utf-8") as f:
                return yaml.safe_load(f) or {}
        return {}

    def check_pre_turn(self, state: Dict[str, Any]) -> Optional[Tuple[str, str]]:
        """
        Pre-call / pre-turn validation.
        Returns None if allowed, or (violation_code, fallback_utterance) if blocked.
        """
        # 1. Calling hours check
        hours_cfg = self.rules.get("calling_hours", {})
        start_str = hours_cfg.get("start", "08:00")
        end_str = hours_cfg.get("end", "21:00")

        now_dt = self.clock.now()
        current_time = now_dt.time()
        start_time = time.fromisoformat(start_str)
        end_time = time.fromisoformat(end_str)

        if not (start_time <= current_time <= end_time):
            return (
                "calling_hours_exceeded",
                "大変恐れ入ります。本日の受付時間は21時までとなっておりますので、改めてお電話させていただきます。失礼いたします。"
            )

        # 2. Stop contact flag
        if state.get("stop_contact"):
            return (
                "stop_contact_active",
                "ご連絡停止のご要望を承っておりますので、本件に関するご案内を終了いたします。失礼いたします。"
            )

        # 3. Third-party call termination
        if state.get("third_party_detected"):
            return (
                "third_party_protection",
                "恐れ入りますが、ご本人様より折り返しのお電話をいただけますようお伝えいただけますでしょうか。失礼いたします。"
            )

        return None

    def check_post_llm(self, proposed_text: str, state: Dict[str, Any]) -> Optional[Tuple[str, str]]:
        """
        Post-LLM validation before sending text to debtor.
        Returns None if compliant, or (violation_code, fallback_utterance) if blocked.
        """
        # [H6] Guard against excessively large LLM outputs that would hang regex engine
        MAX_TEXT_LEN = 4000
        if len(proposed_text) > MAX_TEXT_LEN:
            proposed_text = proposed_text[:MAX_TEXT_LEN]

        # 1. Forbidden content check
        for pattern, rule_code in self.forbidden_patterns:
            if pattern.search(proposed_text):
                return (
                    rule_code,
                    "誠に恐れ入ります。お客様のご都合に合わせて、無理のない解決方法を一緒にご検討できればと存じます。"
                )

        # 2. Amount / Creditor disclosure check
        extracted_amounts = parse_japanese_amount(proposed_text)
        creditor_name = state.get("debtor_profile", {}).get("creditor") or state.get("creditor", "")
        
        has_creditor_leak = bool(creditor_name and creditor_name in proposed_text)
        has_amount_leak = len(extracted_amounts) > 0

        verified = bool(state.get("identity_verified", False))
        disclosed = bool(state.get("disclosure_done", False))

        if (has_amount_leak or has_creditor_leak) and not (verified and disclosed):
            violation = "amount_disclosed_before_verification" if has_amount_leak else "creditor_disclosed_before_verification"
            return (
                violation,
                "個人情報保護のため、詳しいご案内の前にご本人様確認をお願いしております。生年月日をお伺いできますでしょうか。"
            )

        # 3. Terms limits check (if negotiation offer detected)
        negotiation_cfg = self.rules.get("negotiation", {})
        max_installments = state.get("approved_terms", {}).get("max_installments") or negotiation_cfg.get("max_installments", 12)
        
        # Check if agent offered more installments than allowed
        inst_matches = re.findall(r'([0-9]+)\s*回(?:払い|分割)', proposed_text)
        for im in inst_matches:
            if int(im) > max_installments:
                return (
                    "terms_exceeded_installments",
                    f"分割でのお支払いにつきましては、規定により最大{max_installments}回までご案内可能となっております。"
                )

        # 4. Continuing collection after stop-contact requested in this turn
        if state.get("stop_contact") and any(w in proposed_text for w in ["お支払い", "ご請求", "返済", "振込", "金額"]):
            return (
                "collection_after_stop_contact",
                "ご連絡停止のご要望を承知いたしました。今後の連絡を控えさせていただきます。失礼いたします。"
            )

        return None
