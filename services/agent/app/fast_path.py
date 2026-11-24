"""
Tier 0 Fast Path Router and Dispatcher (Plan 1 Section 6 P4-T2).
Deterministic regex and canonical phrase matcher for high-confidence intents:
  - Greetings (もしもし, こんにちは, etc.)
  - Clarification / repeat requests (え？, もう一度言って, 聞こえません, etc.)
  - Acknowledgment (わかりました, 了解です, 承知しました, etc.)
  - Hangup / closing (失礼します, 切ります, さようなら, etc.)
Guarantees response in < 5 ms, bypassing the LLM entirely with tier: t0_fast_path.
"""

import re
import time
from dataclasses import dataclass, field
from typing import Dict, Any, List, Optional, Tuple

from .protocol import BrainTurnV1, BrainTurnIntent, BrainTurnNextState


@dataclass
class FastPathMatch:
    intent: BrainTurnIntent
    next_state: BrainTurnNextState
    text: str
    events: List[Dict[str, Any]] = field(default_factory=list)
    decision_ms: float = 0.0

    def to_turn_result(self) -> Dict[str, Any]:
        return {
            "text": self.text,
            "events": self.events,
            "metrics": {
                "llmMs": 0.0,
                "ttftMs": 0.0,
                "tokensIn": 0,
                "tokensOut": len(self.text),
                "model": "t0_fast_path"
            },
            "x_voiceai": {
                "tier": "t0_fast_path",
                "backend": "deterministic",
                "model": "scripted",
                "reason_code": "RULE_MATCH"
            }
        }


# Japanese canonical intent patterns
JA_GREET_PATTERN = re.compile(r'^(もしもし|はい[、\s]*もしもし|おはようございます|こんにちは|こんばんは|はい[、\s]*田中です|はい[、\s]*山田です)$', re.IGNORECASE)
JA_REPEAT_PATTERN = re.compile(r'^(えっ?|何ですか?|聞こえません?|もう一度(言って|お願いします|お伺いできますか)?|聞き取れませんでした|えーと?)$', re.IGNORECASE)
JA_ACK_PATTERN = re.compile(r'^(わかりました|了解(しました|です)?|承知(いたしました|しました)?|かしこまりました)$', re.IGNORECASE)
JA_HANGUP_PATTERN = re.compile(r'^(失礼(します|いたします)|切ります(ね)?|さようなら|バイバイ|電話を切ります)$', re.IGNORECASE)

# English canonical intent patterns
EN_GREET_PATTERN = re.compile(r'^(hello|hi|good\s+morning|good\s+afternoon|good\s+evening|yes\s+hello)$', re.IGNORECASE)
EN_REPEAT_PATTERN = re.compile(r'^(pardon(\s+me)?|what\s+did\s+you\s+say|could\s+you\s+repeat\s+that|can\s+you\s+repeat|repeat\s+please|i\s+can(\')?t\s+hear\s+you)$', re.IGNORECASE)
EN_ACK_PATTERN = re.compile(r'^(understood|i\s+see|got\s+it|okay|ok|alright)$', re.IGNORECASE)
EN_HANGUP_PATTERN = re.compile(r'^(goodbye|bye|bye\s+bye|have\s+a\s+good\s+day|i(\')?m\s+hanging\s+up)$', re.IGNORECASE)


def match_fast_path(
    user_text: str,
    state: Dict[str, Any],
    domain: str = "collections",
    language: str = "ja"
) -> Optional[FastPathMatch]:
    """
    Evaluates incoming caller utterance against Tier 0 deterministic fast-path patterns.
    Returns FastPathMatch if high-confidence canonical match, None otherwise.
    Decision latency is guaranteed < 2 ms.
    """
    t0 = time.perf_counter()
    clean_text = user_text.strip().replace("。", "").replace("！", "").replace("？", "").replace(".", "").replace("!", "").replace("?", "")
    if not clean_text:
        return None

    verified = state.get("identity_verified", False)
    current_phase = state.get("phase", "greet")
    lang = (language or "ja").lower()

    if lang == "ja":
        # 1. Greeting
        if JA_GREET_PATTERN.match(clean_text) and current_phase == "greet":
            t_elapsed = (time.perf_counter() - t0) * 1000.0
            return FastPathMatch(
                intent="greet",
                next_state="verify_identity",
                text="お電話ありがとうございます。担当窓口でございます。ご本人様確認のため、生年月日をお伺いできますでしょうか。",
                events=[{"type": "state_change", "payload": {"phase": "verify_identity"}}],
                decision_ms=round(t_elapsed, 3)
            )

        # 2. Clarification / repeat request
        if JA_REPEAT_PATTERN.match(clean_text):
            t_elapsed = (time.perf_counter() - t0) * 1000.0
            if not verified:
                reply_text = "恐れ入ります。ご本人様確認のため、生年月日をお伺いできますでしょうか。"
                next_st = "verify_identity"
            else:
                reply_text = "恐れ入ります。もう一度ご案内いたします。少々お待ちいただけますでしょうか。"
                next_st = current_phase
            return FastPathMatch(
                intent="clarification",
                next_state=next_st,
                text=reply_text,
                events=[],
                decision_ms=round(t_elapsed, 3)
            )

        # 3. Acknowledgment
        if JA_ACK_PATTERN.match(clean_text):
            t_elapsed = (time.perf_counter() - t0) * 1000.0
            return FastPathMatch(
                intent="confirm",
                next_state=current_phase,
                text="ありがとうございます。承知いたしました。",
                events=[],
                decision_ms=round(t_elapsed, 3)
            )

        # 4. Hangup / close call
        if JA_HANGUP_PATTERN.match(clean_text):
            t_elapsed = (time.perf_counter() - t0) * 1000.0
            return FastPathMatch(
                intent="close_call",
                next_state="close",
                text="お時間をいただきありがとうございました。失礼いたします。",
                events=[{"type": "end_call", "payload": {"reason": "caller_hangup"}}],
                decision_ms=round(t_elapsed, 3)
            )

    else:
        # English patterns
        if EN_GREET_PATTERN.match(clean_text) and current_phase == "greet":
            t_elapsed = (time.perf_counter() - t0) * 1000.0
            return FastPathMatch(
                intent="greet",
                next_state="verify_identity",
                text="Thank you for taking our call. To protect your security, could you please confirm your date of birth?",
                events=[{"type": "state_change", "payload": {"phase": "verify_identity"}}],
                decision_ms=round(t_elapsed, 3)
            )

        if EN_REPEAT_PATTERN.match(clean_text):
            t_elapsed = (time.perf_counter() - t0) * 1000.0
            reply_text = "I apologize. Could you please confirm your date of birth for verification?" if not verified else "I apologize. Let me repeat that for you."
            return FastPathMatch(
                intent="clarification",
                next_state="verify_identity" if not verified else current_phase,
                text=reply_text,
                events=[],
                decision_ms=round(t_elapsed, 3)
            )

        if EN_ACK_PATTERN.match(clean_text):
            t_elapsed = (time.perf_counter() - t0) * 1000.0
            return FastPathMatch(
                intent="confirm",
                next_state=current_phase,
                text="Thank you. Understood.",
                events=[],
                decision_ms=round(t_elapsed, 3)
            )

        if EN_HANGUP_PATTERN.match(clean_text):
            t_elapsed = (time.perf_counter() - t0) * 1000.0
            return FastPathMatch(
                intent="close_call",
                next_state="close",
                text="Thank you for your time. Have a good day. Goodbye.",
                events=[{"type": "end_call", "payload": {"reason": "caller_hangup"}}],
                decision_ms=round(t_elapsed, 3)
            )

    return None
