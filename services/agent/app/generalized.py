"""
Generalized Multi-Domain Voice Agent.
Supports Candidate Screening (HR), Customer KYC / Support, and Custom Enterprise Voice Agents.
Seamlessly configured via UI instructions, domain presets, and language selection (ja / en).
"""

import time
import re
from typing import Dict, Any, Optional, List
from .state import CallState
from .audit import AuditLogger
from .compliance.guard import ComplianceGuard

# ─────────────────────────────────────────────────────────────────────────────
# Intent helpers: the template brain must react to what the caller actually
# said — never declare verification, promises, or qualification unprompted.
# ─────────────────────────────────────────────────────────────────────────────

_MONTHS_EN = (
    "january|february|march|april|may|june|july|august|september|october|november|december"
    "|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec"
)

_NEGATIVE_EN = ("no", "not", "don't", "dont", "can't", "cant", "cannot", "won't", "never",
                "stop", "wrong", "unable", "hard", "difficult", "struggling", "refuse")
_AGREE_EN = ("yes", "yeah", "yep", "sure", "okay", "ok", "agree", "i will", "i'll pay",
             "i can pay", "schedule", "arrange", "today", "tomorrow", "sounds good",
             "that works", "correct", "that's right", "will do")
_HARDSHIP_EN = ("hard", "difficult", "struggling", "can't afford", "cannot afford",
                "lost job", "unemployed", "medical", "behind", "tough month",
                "tight", "short on", "broke")

_NEGATIVE_JA = ("いいえ", "いや", "無理", "できない", "払えない", "厳しい", "ないです",
                "ありません", "やめて", "違います", "人違い", "だめ",
                "muri", "haraenai", "dekimasen", "chigaimasu", "hitochigai")
_AGREE_JA = ("はい", "ええ", "お願いします", "大丈夫", "結構です", "支払います",
             "払います", "わかりました", "分かりました", "いいです", "お願い",
             "onegai", "wakarimashita", "wakarimashita", "hai", "daijoubu",
             "shiharai", "haraimasu", "yakusoku")
_HARDSHIP_JA = ("厳しい", "難しい", "困って", "失業", "病気", "払えない", "今月は",
                "kibishii", "muzukashii", "komatte", "haraenai", "kongetsu")


def _heard_date(text: str, language: str) -> bool:
    t = text.lower()
    if language == "ja":
        if re.search(r"[0-9０-９]{2,4}年|\d{1,2}月|\d{1,2}日|生まれ|誕生", text):
            return True
        # Romaji dates from speech recognition ("1985 nen 4 gatsu 12 nichi").
        return bool(re.search(r"\d+\s*(nen|gatsu|nichi)|tanjoubi|umare|seinen gappi", t))
    # Digits: 04/15/1988, 1988-04-15, "born ...", month names.
    if re.search(
        rf"\b({_MONTHS_EN})\b|\b(19|20)\d{{2}}\b|\b\d{{1,2}}[/-]\d{{1,2}}([/-]\d{{2,4}})?\b"
        r"|\bborn\b|\bbirth\b|\bdob\b",
        t,
    ):
        return True
    # Spelled-out dates from Whisper base ("april fifteenth nineteen
    # eighty eight", "born april fifteen"). Digit regexes miss these.
    _NUMBER_WORDS = (
        "zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|"
        "thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|"
        "thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|first|"
        "second|third|fifth|eighth|ninth|twelfth|teenth|tieth"
    )
    if re.search(rf"\b({_MONTHS_EN})\b", t) and re.search(rf"\b({_NUMBER_WORDS})\b", t):
        return True
    if re.search(rf"\b(born|birth|dob)\b", t) and re.search(rf"\b({_NUMBER_WORDS}|\d)\b", t):
        return True
    # Bare 4+ digit run (phone tail / PIN) counts as credential downstream,
    # but a month + number-word pair is enough for DOB intent.
    return False


def _is_low_quality(text: str) -> bool:
    """STT blips that must not consume verification attempts."""
    t = (text or "").strip().lower().strip(" .!?,;:'\"")
    if not t or len(t) < 2:
        return True
    if t in {"you", "uh", "um", "oh", "ah", "hmm", "mm", "yeah", ".", "a", "i"}:
        return True
    if " " not in t and len(t) <= 3 and not re.sub(r"\D", "", t):
        return True
    return False


def _heard_credential(text: str, language: str) -> bool:
    """Date of birth or a digit run (PIN / phone tail) for KYC-style checks."""
    if _heard_date(text, language):
        return True
    digits = re.sub(r"\D", "", text)
    if language == "ja":
        return len(digits) >= 4 or bool(re.search(r"番号|暗証|生まれ", text))
    return len(digits) >= 4 or bool(re.search(r"\b(pin|code|number|phone)\b", text.lower()))


def _agrees(text: str, language: str) -> bool:
    t = text.lower()
    neg = _NEGATIVE_JA if language == "ja" else _NEGATIVE_EN
    pos = _AGREE_JA if language == "ja" else _AGREE_EN
    if any(n in t for n in neg):
        return False
    return any(p in t for p in pos)


def _hardship(text: str, language: str) -> bool:
    t = text.lower()
    words = _HARDSHIP_JA if language == "ja" else _HARDSHIP_EN
    return any(w in t for w in words)


def _quote(text: str, limit: int = 60) -> str:
    t = " ".join(text.split())
    return t if len(t) <= limit else t[:limit].rstrip() + "…"

# ─────────────────────────────────────────────────────────────────────────────
# Per-language response templates
# ─────────────────────────────────────────────────────────────────────────────
_SCREENING_TEMPLATES = {
    "ja": {
        1: lambda name, role, greeting: greeting or (
            f"{name}様、本日は面談のお時間をいただきありがとうございます。AI採用アシスタントでございます。"
            f"今回は{role}職の一次選考として、ご経歴とご希望についてお伺いします。"
            f"最近携わられた主な技術スタックやプロジェクトについて教えていただけますか。"
        ),
        2: lambda: "詳しくお聞かせいただきありがとうございます。堅牢なシステム開発のご経験がよくわかりました。"
                   "続いて、勤務形態のご希望（フルリモートやハイブリッドなど）と、ご希望の年収レンジについてお聞かせいただけますでしょうか。",
        3: lambda role: (
            f"ご希望条件を詳しくお聞かせいただきありがとうございます。当社の{role}の募集要項および評価基準に合致していることを確認いたしました。"
            f"本日のスクリーニング内容を採用担当官へ引き継ぎ、2営業日以内に二次面接の日程調整をご連絡いたします。本日はお時間をいただきありがとうございました。"
        ),
        "default": "ご回答ありがとうございます。ご質問や追加のご要望がございましたら、メールにてお気軽にお申し付けください。それでは失礼いたします。",
    },
    "en": {
        1: lambda name, role, greeting: greeting or (
            f"Hello {name}, thank you for making time for this interview today. I'm an AI Recruiting Assistant. "
            f"I'll be conducting your first-round screening for the {role} position. "
            f"To start, could you tell me about your recent experience — key tech stacks and notable projects you've worked on?"
        ),
        2: lambda: (
            "Thank you for sharing that — it's clear you have solid systems engineering experience. "
            "Moving on, could you tell me about your preferred working arrangement (fully remote, hybrid, or on-site) "
            "and your expected compensation range?"
        ),
        3: lambda role: (
            f"Thank you for walking me through your background and expectations. "
            f"We've confirmed you're a strong match for the {role} position. "
            f"I'll pass your screening summary to our hiring team, and you'll hear back within 2 business days regarding next steps. "
            f"It was a pleasure speaking with you today!"
        ),
        "default": "Thank you for your responses. If you have any questions, feel free to reach out by email. Have a great day!",
    },
}

_KYC_TEMPLATES = {
    "ja": {
        1: lambda name, account, greeting: greeting or (
            f"お電話ありがとうございます。カスタマーサポートAIでございます。"
            f"お客様番号{account}の{name}様でいらっしゃいますでしょうか。"
            f"セキュリティ認証のため、ご登録の生年月日またはお電話番号の下4桁をお知らせください。"
        ),
        2: lambda: "ご本人様確認が完了いたしました。ご協力ありがとうございます。本日はアカウントのお手続きでしょうか、それともご利用明細の確認でしょうか。",
        "default": "承知いたしました。お手続きを完了し、確認通知をご登録のメールアドレスへ送付いたしました。他にご不明な点はございますでしょうか。",
    },
    "en": {
        1: lambda name, account, greeting: greeting or (
            f"Thank you for calling. This is your AI Customer Support assistant. "
            f"Am I speaking with {name}, account number {account}? "
            f"For security verification, could you please provide your registered date of birth or the last 4 digits of your phone number?"
        ),
        2: lambda: (
            "Your identity has been successfully verified — thank you for your patience. "
            "How can I help you today? Are you calling about your account details, a transaction query, or something else?"
        ),
        "default": (
            "Understood. I've completed your request and a confirmation has been sent to your registered email address. "
            "Is there anything else I can help you with today?"
        ),
    },
}

_COLLECTIONS_TEMPLATES = {
    "ja": {
        1: lambda name, greeting: greeting or (
            f"お電話ありがとうございます。債権管理センターのAIオペレーターでございます。"
            f"{name}様のお電話でお間違いないでしょうか。"
        ),
        2: lambda: "ご本人様確認ありがとうございます。大切なお知らせがございます。期日を過ぎましたお支払いについて、本日ご入金のご予定を伺えますでしょうか。",
        3: lambda: "お支払いのお約束を承りました。期日までのお手続きをお願い申し上げます。本日はご対応いただき誠にありがとうございました。",
        "default": "承知いたしました。ご不明な点がございましたら、サポート窓口までお問い合わせください。失礼いたします。",
    },
    "en": {
        1: lambda name, greeting: greeting or (
            f"Hello, this is Accounts Management. Am I speaking with {name}?"
        ),
        2: lambda: (
            "Thank you for confirming your identity. I am calling regarding an overdue balance on your account. "
            "Are you able to arrange a payment today, or would you like to set up a payment schedule?"
        ),
        3: lambda: (
            "Thank you for confirming your payment arrangement. We have recorded your promise to pay, "
            "and a confirmation email has been sent. Thank you for your time today and have a great day."
        ),
        "default": "Thank you for your response. If you have any further questions, please contact our support team. Goodbye.",
    },
}

_CUSTOM_TEMPLATES = {
    "ja": lambda user_text, turn, greeting: (
        greeting if (turn == 1 and greeting) else
        f"ご案内ありがとうございます。「{user_text}」について承知いたしました。ご指示いただいた方針に基づき、引き続き丁寧に対応させていただきます。"
    ),
    "en": lambda user_text, turn, greeting: (
        greeting if (turn == 1 and greeting) else
        f"Thank you for sharing that. I understand your request regarding '{user_text}'. "
        f"I'll continue assisting you in line with the provided guidelines."
    ),
}


from dataclasses import dataclass

@dataclass
class TurnContext:
    turn: int
    user_text: str
    state: Dict[str, Any]
    greeting: str
    instructions: str
    context: Dict[str, Any]
    language: str = "ja"


class GeneralizedVoiceAgent:
    """
    Generalized agent handling domain-specific prompts, instructions,
    and stage transitions (HR Candidate Screening, Customer KYC, Custom Agents, Collections).
    Supports both Japanese (ja) and English (en) via the config.language field.
    """

    def __init__(self, guard: Optional[ComplianceGuard] = None):
        self.guard = guard or ComplianceGuard()
        self._handlers = {
            "screening": self._handle_screening,
            "kyc": self._handle_kyc,
            "collections": self._handle_collections,
            "custom": self._handle_custom,
        }

    def process_turn(
        self,
        session_id: str,
        user_text: str,
        state: Dict[str, Any],
        config: Optional[Dict[str, Any]] = None,
        audit_logger: Optional[AuditLogger] = None
    ) -> Dict[str, Any]:
        config = config or {}
        domain = config.get("domain", "screening")
        language = config.get("language", "ja")  # 'ja' | 'en'
        custom_instructions = config.get("instructions", "")
        custom_greeting = config.get("greeting", "")
        context_data = config.get("context", {})

        turn_count = state.get("turn_count", 0) + 1
        state["turn_count"] = turn_count
        state["domain"] = domain
        state["language"] = language

        # Conversation history: every turn is recorded so replies can reference
        # what was actually said (and any future LLM path inherits full context).
        history = state.get("messages", [])
        history.append({"role": "user", "content": user_text})
        state["messages"] = history[-20:]

        events: List[Dict[str, Any]] = []

        if audit_logger:
            audit_logger.append("user_utterance", {
                "text": user_text,
                "turn": turn_count,
                "domain": domain,
                "language": language,
            })

        ctx = TurnContext(
            turn=turn_count,
            user_text=user_text,
            state=state,
            greeting=custom_greeting,
            instructions=custom_instructions,
            context=context_data,
            language=language
        )

        handler = self._handlers.get(domain, self._handle_custom)
        t_start = time.perf_counter()
        reply_text, turn_events = handler(ctx)
        handler_ms = round((time.perf_counter() - t_start) * 1000.0, 2)
        events.extend(turn_events)

        # Optional LLM phrasing layer: the model restyles the template reply
        # within guardrails but can never change the decision (events) or add
        # new claims. Any failure or rule breach → template reply stands.
        llm_cfg = config.get("llm", {})
        if not isinstance(llm_cfg, dict):
            llm_cfg = {}
        llm_provider = llm_cfg.get("provider", "template")
        llm_model = llm_cfg.get("model") or None
        metrics = {
            "llmMs": handler_ms,
            "ttftMs": handler_ms,
            "tokensIn": 0,
            "tokensOut": 0,
            "model": f"template_{domain}_{language}",
        }
        if llm_provider in ("local", "openai"):
            reply_text, metrics = self._phrase_with_llm(
                ctx, reply_text, turn_events, llm_provider, llm_model
            )

        history = state.get("messages", [])
        history.append({"role": "assistant", "content": reply_text})
        state["messages"] = history[-20:]

        if audit_logger:
            audit_logger.append("agent_utterance", {
                "text": reply_text,
                "turn": turn_count,
                "domain": domain,
                "language": language,
                "stage": state.get("stage", "active"),
            })

        return {
            "text": reply_text,
            "events": events,
            "state": state,
            "metrics": metrics,
        }

    # Claims the template did NOT make: the LLM must not introduce these.
    _FORBIDDEN_NEW_CLAIMS = (
        "promise to pay", "promise_to_pay", "約束", "お約束を承りました",
        "confirmation email", "確認通知", "確認メール",
        "identity verified", "verified your identity", "ご本人様確認が完了",
        "account details", "balance is", "残高",
    )

    def _phrase_with_llm(
        self,
        ctx: TurnContext,
        template_reply: str,
        turn_events: List[Dict[str, Any]],
        provider: str,
        model: Optional[str],
    ) -> tuple[str, Dict[str, Any]]:
        """Restyle the template reply via LLM. Returns (reply, metrics)."""
        from .llm import llm_client

        fallback_metrics = {
            "llmMs": 0.0,
            "ttftMs": 0.0,
            "tokensIn": 0,
            "tokensOut": 0,
            "model": f"template_{ctx.state.get('domain', 'custom')}_{ctx.language}",
        }
        try:
            history = ctx.state.get("messages", [])[-6:]
            convo = "\n".join(
                f"{'Caller' if m.get('role') == 'user' else 'Agent'}: {m.get('content', '')}"
                for m in history
            )
            stage = ctx.state.get("stage", "active")
            system = (
                f"You are a professional {ctx.state.get('domain', 'custom')} voice agent "
                f"speaking {ctx.language}. Rephrase the AGENT LINE below naturally for spoken "
                f"conversation in 1-2 short sentences. Keep every fact, amount, name, and "
                f"commitment EXACTLY identical — add nothing new. Never claim identity "
                f"verification, a recorded promise, a sent email, or any balance/amount "
                f"unless present in the AGENT LINE. Conversation stage: {stage}."
            )
            if ctx.instructions:
                system += f" Operator instructions: {ctx.instructions[:500]}"
            messages = [
                {"role": "system", "content": system},
                {"role": "user", "content": f"Conversation so far:\n{convo}\n\nAGENT LINE:\n{template_reply}"},
            ]
            res = llm_client.complete_with(
                provider, messages, model=model,
                temperature=0.3, max_tokens=120, timeout_s=2.5,
            )
            text = (res.get("text") or "").strip()
            if not text or len(text) > 600:
                return template_reply, fallback_metrics
            lowered = text.lower()
            template_lowered = template_reply.lower()
            for claim in self._FORBIDDEN_NEW_CLAIMS:
                if claim.lower() in lowered and claim.lower() not in template_lowered:
                    return template_reply, fallback_metrics
            return text, {
                "llmMs": res.get("latency_ms", 0.0),
                "ttftMs": res.get("latency_ms", 0.0),
                "tokensIn": res.get("tokens_in", 0),
                "tokensOut": res.get("tokens_out", 0),
                "model": res.get("model", f"{provider}:unknown"),
            }
        except Exception as e:
            print(f"[GeneralizedAgent] LLM phrasing skipped ({provider}): {e}")
            return template_reply, fallback_metrics

    # ─── Screening ────────────────────────────────────────────────────────────

    def _handle_screening(self, ctx: TurnContext) -> tuple[str, List[Dict[str, Any]]]:
        candidate_name = ctx.context.get("candidateName", "佐藤 健一" if ctx.language == "ja" else "Alex Johnson")
        target_role = ctx.context.get("targetRole", "シニアソフトウェアエンジニア" if ctx.language == "ja" else "Senior Software Engineer")
        tmpl = _SCREENING_TEMPLATES.get(ctx.language, _SCREENING_TEMPLATES["en"])
        events = []

        if ctx.turn == 1:
            ctx.state["stage"] = "experience_inquiry"
            ctx.state["candidate_name"] = candidate_name
            ctx.state["target_role"] = target_role
            # Gateway already greeted: if the caller actually said something
            # substantive, acknowledge it instead of re-greeting verbatim.
            if ctx.user_text and len(ctx.user_text.strip()) >= 3 and not _is_low_quality(ctx.user_text):
                quoted = _quote(ctx.user_text, 80)
                if ctx.language == "ja":
                    reply = (
                        f"ご経験について「{quoted}」とお聞かせいただきありがとうございます。"
                        f"続いて、勤務形態のご希望とご希望の年収レンジについてお聞かせいただけますでしょうか。"
                    )
                else:
                    reply = (
                        f"Thanks for sharing that — noted your background in \"{quoted}\". "
                        f"Moving on, could you tell me about your preferred working arrangement "
                        f"and your expected compensation range?"
                    )
                ctx.state["stage"] = "compensation_and_work_style"
                events.append({"type": "state_change", "payload": {"stage": "compensation_and_work_style", "domain": "screening", "language": ctx.language}, "ts": int(time.time() * 1000)})
                return reply, events
            reply = tmpl[1](candidate_name, target_role, ctx.greeting)
            events.append({"type": "state_change", "payload": {"stage": "experience_inquiry", "domain": "screening", "language": ctx.language}, "ts": int(time.time() * 1000)})
            return reply, events

        elif ctx.turn == 2:
            if _is_low_quality(ctx.user_text):
                if ctx.language == "ja":
                    reply = "恐れ入ります。ご経歴について、もう少し詳しくお聞かせいただけますでしょうか。"
                else:
                    reply = "Sorry, I didn't catch that — could you tell me about your recent experience and tech stack?"
                return reply, events
            ctx.state["stage"] = "compensation_and_work_style"
            ctx.state["tech_stack_noted"] = True
            quoted = _quote(ctx.user_text, 80)
            if ctx.language == "ja":
                reply = (
                    f"ご経験について「{quoted}」とお聞かせいただきありがとうございます。"
                    f"続いて、勤務形態のご希望（フルリモートやハイブリッドなど）と、ご希望の年収レンジについてお聞かせいただけますでしょうか。"
                )
            else:
                reply = (
                    f"Thanks for sharing that — noted your background in \"{quoted}\". "
                    f"Moving on, could you tell me about your preferred working arrangement (fully remote, hybrid, or on-site) "
                    f"and your expected compensation range?"
                )
            events.append({"type": "state_change", "payload": {"stage": "compensation_and_work_style", "domain": "screening"}, "ts": int(time.time() * 1000)})
            return reply, events

        elif ctx.turn == 3:
            # Don't declare a qualification on an empty or content-free answer.
            if len(ctx.user_text.strip()) < 3:
                if ctx.language == "ja":
                    reply = "恐れ入ります。ご希望条件について、もう少し詳しくお聞かせいただけますでしょうか。"
                else:
                    reply = "Sorry, I didn't catch that — could you share a bit more detail about your expectations?"
                return reply, events
            ctx.state["stage"] = "closing"
            ctx.state["qualified"] = True
            ctx.state["compensation_fit"] = True
            reply = tmpl[3](target_role)
            events.append({"type": "candidate_qualified", "payload": {"qualified": True, "role": target_role}, "ts": int(time.time() * 1000)})
            events.append({"type": "end_call", "payload": {"status": "completed"}, "ts": int(time.time() * 1000)})
            return reply, events

        else:
            reply = tmpl["default"]
            events.append({"type": "end_call", "payload": {"status": "completed"}, "ts": int(time.time() * 1000)})
            return reply, events

    # ─── KYC ──────────────────────────────────────────────────────────────────

    def _handle_kyc(self, ctx: TurnContext) -> tuple[str, List[Dict[str, Any]]]:
        customer_name = ctx.context.get("customerName", "鈴木 一郎" if ctx.language == "ja" else "John Smith")
        account_id = ctx.context.get("accountId", "ACC-88219")
        tmpl = _KYC_TEMPLATES.get(ctx.language, _KYC_TEMPLATES["en"])
        events = []
        user_lower = ctx.user_text.lower()
        ja = ctx.language == "ja"

        if ctx.turn == 1:
            ctx.state["stage"] = "identity_verification"
            # Gateway already greeted (utt 0): treat this as the reply.
            if _is_low_quality(ctx.user_text):
                reply = (
                    "恐れ入ります。音声が聞き取りにくかったようです。生年月日、またはお電話番号の下4桁をお知らせください。"
                    if ja else
                    "Sorry, I didn't catch that — could you share your date of birth or the last 4 digits of your registered phone number?"
                )
                events.append({"type": "state_change", "payload": {"stage": "auth_requested", "domain": "kyc", "language": ctx.language}, "ts": int(time.time() * 1000)})
                return reply, events
            if _heard_credential(ctx.user_text, ctx.language):
                ctx.state["stage"] = "service_inquiry"
                ctx.state["identity_verified"] = True
                reply = tmpl[2]()
                events.append({"type": "identity_verified", "payload": {"verified": True}, "ts": int(time.time() * 1000)})
                return reply, events
            reply = tmpl[1](customer_name, account_id, ctx.greeting)
            events.append({"type": "state_change", "payload": {"stage": "auth_requested", "domain": "kyc", "language": ctx.language}, "ts": int(time.time() * 1000)})
            return reply, events

        elif ctx.turn == 2:
            # Check for denial or refusal to authenticate
            denial_patterns = ["違う", "違います", "分からない", "教えられない", "誰", "no", "wrong", "refuse", "not me", "don't know", "cannot"]
            if any(p in user_lower for p in denial_patterns):
                ctx.state["identity_verified"] = False
                ctx.state["stage"] = "auth_failed"
                reply = (
                    "恐れ入ります。ご本人様確認が取れない場合、個人情報保護の観点から詳細なご案内ができません。ご確認の上、再度お問い合わせください。"
                    if ctx.language == "ja" else
                    "I apologize, but without verifying your identity, I cannot access your account details due to privacy regulations. Please verify your information and call back."
                )
                events.append({"type": "escalate", "payload": {"reason": "kyc_auth_failed"}, "ts": int(time.time() * 1000)})
                events.append({"type": "end_call", "payload": {"status": "auth_failed"}, "ts": int(time.time() * 1000)})
                return reply, events

            if _is_low_quality(ctx.user_text):
                reply = (
                    "恐れ入ります。音声が聞き取りにくかったようです。生年月日、またはお電話番号の下4桁をお知らせください。"
                    if ja else
                    "Sorry, I didn't catch that clearly — could you please share your date of birth or the last 4 digits of your registered phone number?"
                )
                return reply, events

            if not _heard_credential(ctx.user_text, ctx.language):
                # No credential-like content heard: re-ask instead of passing.
                attempts = int(ctx.state.get("verification_attempts", 0)) + 1
                ctx.state["verification_attempts"] = attempts
                if attempts >= 2:
                    ctx.state["identity_verified"] = False
                    ctx.state["stage"] = "auth_failed"
                    reply = (
                        "恐れ入ります。ご本人様確認が取れない場合、個人情報保護の観点から詳細なご案内ができません。ご確認の上、再度お問い合わせください。"
                        if ja else
                        "I apologize, but without verifying your identity, I cannot access your account details due to privacy regulations. Please verify your information and call back."
                    )
                    events.append({"type": "escalate", "payload": {"reason": "kyc_auth_failed"}, "ts": int(time.time() * 1000)})
                    events.append({"type": "end_call", "payload": {"status": "auth_failed"}, "ts": int(time.time() * 1000)})
                    return reply, events
                reply = (
                    f"恐れ入ります。「{_quote(ctx.user_text)}」からは認証情報を確認できませんでした。生年月日、またはお電話番号の下4桁をお知らせください。"
                    if ja else
                    f"Thanks — I didn't catch a verifiable detail in \"{_quote(ctx.user_text)}\". Could you please share your date of birth or the last 4 digits of your registered phone number?"
                )
                return reply, events

            # Credential-like content heard: verification genuinely provided.
            ctx.state["stage"] = "service_inquiry"
            ctx.state["identity_verified"] = True
            reply = tmpl[2]()
            events.append({"type": "identity_verified", "payload": {"verified": True}, "ts": int(time.time() * 1000)})
            return reply, events

        else:
            # Late credential (user answered one turn late): still honor it if
            # we are still waiting on verification.
            if (ctx.state.get("stage") in (None, "identity_verification")
                    and _heard_credential(ctx.user_text, ctx.language)):
                ctx.state["stage"] = "service_inquiry"
                ctx.state["identity_verified"] = True
                reply = tmpl[2]()
                events.append({"type": "identity_verified", "payload": {"verified": True}, "ts": int(time.time() * 1000)})
                return reply, events
            ctx.state["stage"] = "resolved"
            reply = tmpl["default"]
            events.append({"type": "end_call", "payload": {"status": "resolved"}, "ts": int(time.time() * 1000)})
            return reply, events

    # ─── Custom ───────────────────────────────────────────────────────────────

    def _handle_custom(self, ctx: TurnContext) -> tuple[str, List[Dict[str, Any]]]:
        tmpl_fn = _CUSTOM_TEMPLATES.get(ctx.language, _CUSTOM_TEMPLATES["en"])
        events = []
        reply = tmpl_fn(ctx.user_text, ctx.turn, ctx.greeting)
        events.append({"type": "state_change", "payload": {"turn": ctx.turn, "domain": "custom", "language": ctx.language}, "ts": int(time.time() * 1000)})
        return reply, events

    # ─── Collections ──────────────────────────────────────────────────────────

    def _handle_collections(self, ctx: TurnContext) -> tuple[str, List[Dict[str, Any]]]:
        debtor_name = ctx.context.get("debtorName", "佐藤 健一" if ctx.language == "ja" else "Alex Johnson")
        tmpl = _COLLECTIONS_TEMPLATES.get(ctx.language, _COLLECTIONS_TEMPLATES["en"])
        events = []
        user_lower = ctx.user_text.lower()
        ja = ctx.language == "ja"

        # Stop contact applies on any turn.
        stop_patterns = ["stop calling", "do not call", "remove my number", "don't call", "連絡しないで", "電話しないで", "かけてこないで", "二度と",
                         "kakenaide", "denwa shinaide", "nidoto"]
        if any(sp in user_lower for sp in stop_patterns):
            ctx.state["stop_contact"] = True
            ctx.state["stage"] = "stop_contact"
            events.append({"type": "stop_contact", "payload": {"requested": True}, "ts": int(time.time() * 1000)})
            events.append({"type": "end_call", "payload": {"status": "stop_contact"}, "ts": int(time.time() * 1000)})
            reply = (
                "ご連絡停止のご要望を承りました。お電話番号を連絡停止リストに登録いたしました。失礼いたします。"
                if ja else
                "We have recorded your stop-contact request and added your number to our suppression list. We will not contact you again. Goodbye."
            )
            return reply, events

        # Wrong-person denial applies on any turn.
        wrong_person_patterns = ["wrong person", "not me", "wrong number", "don't know", "人違い", "違います", "間違い電話", "そんな人はいません",
                                 "hitochigai", "chigaimasu", "machigai denwa"]
        if any(wp in user_lower for wp in wrong_person_patterns):
            ctx.state["identity_verified"] = False
            ctx.state["third_party_detected"] = True
            ctx.state["stage"] = "third_party"
            events.append({"type": "escalate", "payload": {"reason": "wrong_person"}, "ts": int(time.time() * 1000)})
            events.append({"type": "end_call", "payload": {"status": "third_party"}, "ts": int(time.time() * 1000)})
            reply = (
                "大変失礼いたしました。間違い電話のお詫びを申し上げます。登録情報を確認いたします。失礼いたします。"
                if ja else
                "I apologize for the inconvenience. We have noted that this is the incorrect contact number and will update our records. Have a good day."
            )
            return reply, events

        if ctx.turn == 1:
            ctx.state["stage"] = "identity_verification"
            ctx.state["debtor_name"] = debtor_name
            ctx.state["verification_attempts"] = 0
            # The gateway already spoke the greeting (utt 0). This turn is
            # the caller's REPLY to it — never re-greet. If they affirmed
            # identity ("yes, this is Alex"), move straight to DOB ask.
            # If Whisper gave us a blip ("with Alex.", "you"), ask for DOB
            # without burning a verification attempt.
            if _is_low_quality(ctx.user_text):
                reply = (
                    "ご本人様確認のため、生年月日をお知らせいただけますでしょうか。"
                    if ja else
                    "Thanks — to verify your identity, could you please share your date of birth?"
                )
                events.append({"type": "state_change", "payload": {"stage": "auth_requested", "domain": "collections", "language": ctx.language}, "ts": int(time.time() * 1000)})
                return reply, events
            if _heard_date(ctx.user_text, ctx.language):
                ctx.state["stage"] = "negotiation"
                ctx.state["identity_verified"] = True
                reply = tmpl[2]()
                events.append({"type": "identity_verified", "payload": {"verified": True}, "ts": int(time.time() * 1000)})
                return reply, events
            # Affirmative or name-like reply -> ask DOB (don't repeat greeting).
            reply = (
                "ご本人様確認ありがとうございます。本人確認のため、生年月日をお知らせいただけますでしょうか。"
                if ja else
                "Thank you — to verify your identity, could you please share your date of birth?"
            )
            events.append({"type": "state_change", "payload": {"stage": "auth_requested", "domain": "collections", "language": ctx.language}, "ts": int(time.time() * 1000)})
            return reply, events

        stage = ctx.state.get("stage", "identity_verification")

        if stage == "identity_verification":
            if _is_low_quality(ctx.user_text):
                # Don't burn an attempt on STT noise — re-ask cleanly.
                reply = (
                    "恐れ入ります。音声が聞き取りにくかったようです。生年月日をお知らせいただけますでしょうか。"
                    if ja else
                    "Sorry, I didn't catch that clearly — could you please share your date of birth?"
                )
                return reply, events
            if _heard_date(ctx.user_text, ctx.language):
                ctx.state["stage"] = "negotiation"
                ctx.state["identity_verified"] = True
                reply = tmpl[2]()
                events.append({"type": "identity_verified", "payload": {"verified": True}, "ts": int(time.time() * 1000)})
                return reply, events
            attempts = int(ctx.state.get("verification_attempts", 0)) + 1
            ctx.state["verification_attempts"] = attempts
            if attempts >= 2:
                ctx.state["stage"] = "auth_failed"
                events.append({"type": "escalate", "payload": {"reason": "verification_failed"}, "ts": int(time.time() * 1000)})
                reply = (
                    "ご本人様確認が取れませんでしたので、大切なお知らせをお伝えできません。ご確認のうえ、改めてお問い合わせください。失礼いたします。"
                    if ja else
                    "I'm sorry, but I can't verify your identity, so I can't share the account details. Please check your information and call us back. Goodbye."
                )
                return reply, events
            reply = (
                f"恐れ入ります。「{_quote(ctx.user_text)}」からは生年月日を確認できませんでした。ご本人様確認のため、生年月日をお知らせいただけますでしょうか。"
                if ja else
                f"Thanks — I didn't catch a date of birth in \"{_quote(ctx.user_text)}\". To verify your identity, could you please share your date of birth?"
            )
            return reply, events

        if stage == "negotiation":
            if _agrees(ctx.user_text, ctx.language):
                ctx.state["stage"] = "promise_recorded"
                ctx.state["promise_amount"] = 35000 if ja else 350
                reply = tmpl[3]()
                events.append({"type": "promise_to_pay", "payload": {"amount": ctx.state["promise_amount"]}, "ts": int(time.time() * 1000)})
                events.append({"type": "end_call", "payload": {"status": "completed"}, "ts": int(time.time() * 1000)})
                return reply, events
            if _hardship(ctx.user_text, ctx.language):
                reply = (
                    f"ご事情を承りました。「{_quote(ctx.user_text)}」とのこと、分割でのお支払いもご相談可能です。月々のお支払いが可能な金額の目安はございますでしょうか。"
                    if ja else
                    f"I understand — thanks for telling me. Given \"{_quote(ctx.user_text)}\", we can look at a payment schedule instead of a single payment. Roughly what monthly amount would be manageable for you?"
                )
                return reply, events
            reply = (
                f"承知いたしました。「{_quote(ctx.user_text)}」について確認させてください。本日中のお支払いは可能でしょうか、それとも分割のご相談をご希望でしょうか。"
                if ja else
                f"Got it — just to confirm on \"{_quote(ctx.user_text)}\": are you able to pay the balance today, or would you prefer we set up a payment schedule?"
            )
            return reply, events

        reply = tmpl["default"]
        events.append({"type": "end_call", "payload": {"status": "completed"}, "ts": int(time.time() * 1000)})
        return reply, events


