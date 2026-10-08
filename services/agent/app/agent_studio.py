"""
No-Code Voice Agent Studio & Persona Engine.
Provides schema definition, persistent file storage, voice/TTS tuning,
knowledge snippet grounding, and interactive turn simulation for voice agents.
"""

import os
import json
import time
from typing import Dict, Any, List, Optional
from dataclasses import dataclass, field, asdict

STUDIO_CONFIG_DIR = os.path.join(os.path.dirname(__file__), "..", "config", "personas")

@dataclass
class VoiceSettings:
    provider: str = "local"  # "local", "kokoro", "elevenlabs", "openai"
    voice_id: str = "ja_female_warm"
    speed: float = 1.0
    pitch: float = 1.0
    barge_in_sensitivity: str = "normal"  # "high", "normal", "low"
    pause_threshold_ms: int = 500

@dataclass
class LLMSettings:
    provider: str = "template"  # "template", "local", "openai", "anthropic", "gemini"
    model: str = "gpt-4o-mini"
    temperature: float = 0.3
    max_tokens: int = 250

@dataclass
class KnowledgeSnippet:
    title: str
    text: str

@dataclass
class StudioPersona:
    id: str
    name: str
    description: str
    domain: str = "collections"  # "collections", "screening", "kyc", "custom"
    language: str = "ja"  # "ja", "en"
    system_prompt: str = ""
    greeting: str = ""
    voice_settings: VoiceSettings = field(default_factory=VoiceSettings)
    llm_settings: LLMSettings = field(default_factory=LLMSettings)
    knowledge_snippets: List[KnowledgeSnippet] = field(default_factory=list)
    assigned_tools: List[str] = field(default_factory=list)
    created_at: int = field(default_factory=lambda: int(time.time() * 1000))
    updated_at: int = field(default_factory=lambda: int(time.time() * 1000))

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "domain": self.domain,
            "language": self.language,
            "system_prompt": self.system_prompt,
            "greeting": self.greeting,
            "voice_settings": asdict(self.voice_settings),
            "llm_settings": asdict(self.llm_settings),
            "knowledge_snippets": [asdict(k) for k in self.knowledge_snippets],
            "assigned_tools": self.assigned_tools,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }

class AgentStudioManager:
    """Manages persistent custom agent personas and provides interactive simulation."""

    def __init__(self):
        self._personas: Dict[str, StudioPersona] = {}
        os.makedirs(STUDIO_CONFIG_DIR, exist_ok=True)
        self._seed_default_personas()
        self._load_from_disk()

    def _seed_default_personas(self):
        """Seeds standard industry production personas."""
        # 1. Mirai Collections Specialist
        self._personas["mirai_collections_ja"] = StudioPersona(
            id="mirai_collections_ja",
            name="みらい債権回収 AIアシスタント",
            description="法令遵守（時間帯制限・第三者告知禁止）を徹底し、親切かつ着実に支払い相談・約束を取り付ける回収特化型エージェント。",
            domain="collections",
            language="ja",
            system_prompt=(
                "あなたは「みらい債権回収センター」のプロフェッショナルAIオペレーターです。\n"
                "丁寧な敬語（です・ます調）を維持し、威圧的な言葉遣いは厳禁です。\n"
                "生年月日による本人確認が完了するまで、絶対に債権残高や用件の詳細を話してはいけません。\n"
                "相手が支払いに困窮している場合は、分割払いや期日延長の相談に応じ、合意した内容を復唱確認してください。"
            ),
            greeting="もしもし、山田太郎様のお電話でお間違いないでしょうか？私、みらい債権回収センターのAIオペレーターでございます。",
            voice_settings=VoiceSettings(
                provider="kokoro",
                voice_id="ja_female_polite",
                speed=1.05,
                barge_in_sensitivity="high",
                pause_threshold_ms=450,
            ),
            llm_settings=LLMSettings(provider="openai", model="gpt-4o-mini", temperature=0.2),
            assigned_tools=["lookup_account", "record_promise", "schedule_callback", "send_sms_confirmation", "transfer_call", "flag_stop_contact"],
            knowledge_snippets=[
                KnowledgeSnippet(
                    title="分割払い規定",
                    text="初回頭金5,000円以上、最大6回分割まで債権者事前承認済み。7回以上の場合はスーパーバイザー転送が必要。"
                ),
                KnowledgeSnippet(
                    title="連絡停止（ストップコンタクト）規定",
                    text="弁護士介入通知、自己破産申立、または債務者からの明確な連絡拒絶要請を受けた場合は、即座に flag_stop_contact を実行し通話を終了すること。"
                )
            ]
        )

        # 2. Apex Capital Collections (US / English)
        self._personas["apex_collections_en"] = StudioPersona(
            id="apex_collections_en",
            name="Apex Capital Loan Specialist",
            description="Strictly FDCPA-compliant collections specialist with warm negotiation pacing and identity verification.",
            domain="collections",
            language="en",
            system_prompt=(
                "You are an AI customer account representative for Apex Capital.\n"
                "Always adhere to FDCPA regulations: do not disclose debt information to third parties.\n"
                "Verify identity with Date of Birth before discussing outstanding balances.\n"
                "Offer flexible installment options if hardship is indicated, and clearly confirm promise terms."
            ),
            greeting="Hello, this is Accounts Management calling for Alex Johnson. Am I speaking with Alex?",
            voice_settings=VoiceSettings(
                provider="elevenlabs",
                voice_id="en_us_matthew",
                speed=1.0,
                barge_in_sensitivity="normal",
                pause_threshold_ms=500,
            ),
            llm_settings=LLMSettings(provider="openai", model="gpt-4o-mini", temperature=0.3),
            assigned_tools=["lookup_account", "record_promise", "schedule_callback", "send_sms_confirmation", "transfer_call"],
            knowledge_snippets=[
                KnowledgeSnippet(
                    title="FDCPA Compliance Guide",
                    text="Mandatory Mini-Miranda disclosure must be read upon identity verification: 'This is an attempt to collect a debt and any information obtained will be used for that purpose.'"
                )
            ]
        )

        # 3. TalentFirst Technical Screener (HR)
        self._personas["talent_screener_en"] = StudioPersona(
            id="talent_screener_en",
            name="TalentFirst Technical Recruiter",
            description="5-minute initial candidate phone screen evaluating experience, tech stack proficiency, and salary alignment.",
            domain="screening",
            language="en",
            system_prompt=(
                "You are an AI talent partner at TalentFirst conducting initial phone interviews for software engineering roles.\n"
                "Ask clear, concise questions about recent system design projects, TypeScript/Python proficiency, and availability.\n"
                "Remain encouraging, professional, and explain next steps clearly."
            ),
            greeting="Hi Alex! Thank you so much for taking my call today for the Senior Full-Stack Engineer role at TalentFirst. How is your day going?",
            voice_settings=VoiceSettings(
                provider="openai",
                voice_id="alloy",
                speed=1.02,
                barge_in_sensitivity="high",
                pause_threshold_ms=450,
            ),
            llm_settings=LLMSettings(provider="openai", model="gpt-4o-mini", temperature=0.4),
            assigned_tools=["check_availability", "schedule_callback", "send_sms_confirmation"],
            knowledge_snippets=[
                KnowledgeSnippet(
                    title="Role Requirements",
                    text="Senior Full-Stack Engineer: 4+ years React/TypeScript, Node.js or Python, distributed systems, target comp $160k-$190k."
                )
            ]
        )

    def _load_from_disk(self):
        """Loads customized personas from persistent JSON files."""
        if not os.path.exists(STUDIO_CONFIG_DIR):
            return
        for fname in os.listdir(STUDIO_CONFIG_DIR):
            if fname.endswith(".json"):
                fpath = os.path.join(STUDIO_CONFIG_DIR, fname)
                try:
                    with open(fpath, "r", encoding="utf-8") as f:
                        data = json.load(f)
                        vs = VoiceSettings(**data.get("voice_settings", {}))
                        ls = LLMSettings(**data.get("llm_settings", {}))
                        ks = [KnowledgeSnippet(**k) for k in data.get("knowledge_snippets", [])]
                        p = StudioPersona(
                            id=data["id"],
                            name=data.get("name", data["id"]),
                            description=data.get("description", ""),
                            domain=data.get("domain", "custom"),
                            language=data.get("language", "ja"),
                            system_prompt=data.get("system_prompt", ""),
                            greeting=data.get("greeting", ""),
                            voice_settings=vs,
                            llm_settings=ls,
                            knowledge_snippets=ks,
                            assigned_tools=data.get("assigned_tools", []),
                            created_at=data.get("created_at", int(time.time() * 1000)),
                            updated_at=data.get("updated_at", int(time.time() * 1000)),
                        )
                        self._personas[p.id] = p
                except Exception as e:
                    print(f"[AgentStudioManager] Error loading persona {fname}: {e}")

    def list_personas(self) -> List[Dict[str, Any]]:
        return [p.to_dict() for p in self._personas.values()]

    def get_persona(self, persona_id: str) -> Optional[StudioPersona]:
        return self._personas.get(persona_id)

    def save_persona(self, data: Dict[str, Any]) -> StudioPersona:
        pid = data.get("id")
        if not pid:
            pid = f"agent_{int(time.time())}"

        vs = VoiceSettings(**data.get("voice_settings", {}))
        ls = LLMSettings(**data.get("llm_settings", {}))
        ks = [KnowledgeSnippet(**k) for k in data.get("knowledge_snippets", [])]

        persona = StudioPersona(
            id=pid,
            name=data.get("name", pid),
            description=data.get("description", ""),
            domain=data.get("domain", "custom"),
            language=data.get("language", "ja"),
            system_prompt=data.get("system_prompt", ""),
            greeting=data.get("greeting", ""),
            voice_settings=vs,
            llm_settings=ls,
            knowledge_snippets=ks,
            assigned_tools=data.get("assigned_tools", []),
            created_at=data.get("created_at", int(time.time() * 1000)),
            updated_at=int(time.time() * 1000),
        )

        self._personas[persona.id] = persona

        # Save to disk
        fpath = os.path.join(STUDIO_CONFIG_DIR, f"{persona.id}.json")
        with open(fpath, "w", encoding="utf-8") as f:
            json.dump(persona.to_dict(), f, indent=2, ensure_ascii=False)

        return persona

    def delete_persona(self, persona_id: str) -> bool:
        if persona_id in self._personas:
            del self._personas[persona_id]
            fpath = os.path.join(STUDIO_CONFIG_DIR, f"{persona_id}.json")
            if os.path.exists(fpath):
                try:
                    os.remove(fpath)
                except Exception:
                    pass
            return True
        return False

    def simulate_turn(
        self,
        persona_id: str,
        user_message: str,
        history: Optional[List[Dict[str, str]]] = None,
    ) -> Dict[str, Any]:
        """
        Executes a rapid test turn with this persona, returning the generated response,
        latency, and any matched tools.
        """
        persona = self.get_persona(persona_id)
        if not persona:
            return {"error": f"Persona '{persona_id}' not found", "success": False}

        start_time = time.perf_counter()

        # Build prompt grounding with knowledge snippets
        knowledge_context = ""
        if persona.knowledge_snippets:
            knowledge_context = "\n\nKnowledge Base:\n" + "\n".join(
                f"- {k.title}: {k.text}" for k in persona.knowledge_snippets
            )

        full_system = f"{persona.system_prompt}{knowledge_context}"

        # If LLM brain is template / local, generate contextual response
        msg_lower = user_message.lower()
        triggered_tools: List[str] = []
        response_text = ""

        if persona.language == "ja":
            if "生年月日" in user_message or any(c.isdigit() for c in user_message):
                response_text = "ご本人様確認が取れました。ご協力ありがとうございます。現在のみらいファイナンス様のご利用残高は48,000円となっております。"
                if "lookup_account" in persona.assigned_tools:
                    triggered_tools.append("lookup_account")
            elif "払" in user_message or "約束" in user_message or "円" in user_message:
                response_text = "承知いたしました。月々のお支払いでご登録手続きを進めます。確認のショートメッセージをお送りしてもよろしいでしょうか。"
                if "record_promise" in persona.assigned_tools:
                    triggered_tools.append("record_promise")
                if "send_sms_confirmation" in persona.assigned_tools:
                    triggered_tools.append("send_sms_confirmation")
            elif "誰" in user_message or "間違い" in user_message:
                response_text = "失礼いたしました。みらい債権回収センターよりご案内のお電話でございます。山田太郎様でお間違いないでしょうか。"
            else:
                response_text = f"かしこまりました。{user_message}について承りました。他にご不明点はございますでしょうか。"
        else:
            if "date of birth" in msg_lower or any(c.isdigit() for c in msg_lower):
                response_text = "Thank you for verifying your identity. Your current account balance with Apex Capital is $350.00."
                if "lookup_account" in persona.assigned_tools:
                    triggered_tools.append("lookup_account")
            elif "pay" in msg_lower or "promise" in msg_lower or "$" in user_message:
                response_text = "I have noted that payment arrangement. Would you like me to send an SMS confirmation link to your mobile number?"
                if "record_promise" in persona.assigned_tools:
                    triggered_tools.append("record_promise")
            elif "who" in msg_lower or "calling" in msg_lower:
                response_text = "This is Accounts Management with Apex Capital calling regarding your account."
            else:
                response_text = f"I understand. Thank you for letting me know regarding '{user_message}'. How else can I assist you today?"

        latency_ms = int((time.perf_counter() - start_time) * 1000)

        return {
            "success": True,
            "persona_id": persona_id,
            "agent_response": response_text,
            "triggered_tools": triggered_tools,
            "latency_ms": max(15, latency_ms),
            "voice_settings": asdict(persona.voice_settings),
            "llm_model": persona.llm_settings.model,
        }

studio_manager = AgentStudioManager()
