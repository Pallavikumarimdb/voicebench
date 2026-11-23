"""
Structured Classifier Step for Voice Agent.
Extracts intent, sentiment, and flags from caller utterances to drive conditional edge routing.
"""

import re
from typing import Dict, Any

class UtteranceClassifier:
    def classify(self, user_text: str, current_phase: str) -> Dict[str, Any]:
        text = user_text.strip().lower()

        # Flags detection (avoid false positive on 大丈夫 or 工夫)
        third_party_words = [
            "家族", "妻", "母", "父", "息子", "娘", "同居人", "本人ではありません", "留守", "不在", "違う人", "別人", "旦那", "主人"
        ]
        is_third_party = any(w in text for w in third_party_words) or bool(re.search(r'(?<!大丈)(?<!工)夫', text))

        is_stop_contact = any(w in text for w in [
            "連絡しないで", "電話しないで", "かけてこないで", "連絡を止め", "迷惑", "二度とかけないで", "着信拒否"
        ])

        is_dispute_or_paid = any(w in text for w in [
            "もう払った", "振込済み", "支払い済み", "身に覚えがない", "違う", "間違っている", "架空請求", "詐欺"
        ])

        is_hardship = any(w in text for w in [
            "お金がない", "生活苦", "失業", "無職", "入院", "病気", "給料日前", "苦しい", "払えない", "厳しい"
        ])

        is_hostile_or_escalate = any(w in text for w in [
            "弁護士", "警察", "人間と話したい", "担当者を出せ", "上司", "怒鳴る", "ふざけるな", "バカ", "訴える"
        ])

        is_affirmative = any(w in text for w in [
            "はい", "そうです", "わかりました", "了解", "大丈夫です", "支払います", "払います", "合意", "問題ありません"
        ])

        is_negative = any(w in text for w in [
            "いいえ", "違います", "無理", "できません", "断る", "嫌です"
        ])

        # Date of birth pattern (e.g. 1985年4月12日, 1985-04-12, 昭和60年, 4月12日)
        dob_match = re.search(r'([0-9]{4}|昭和[0-9]{1,2}|平成[0-9]{1,2})?年?([0-9]{1,2})月([0-9]{1,2})日?', text)
        has_dob = bool(dob_match)

        return {
            "is_third_party": is_third_party,
            "is_stop_contact": is_stop_contact,
            "is_dispute_or_paid": is_dispute_or_paid,
            "is_hardship": is_hardship,
            "is_hostile_or_escalate": is_hostile_or_escalate,
            "is_affirmative": is_affirmative,
            "is_negative": is_negative,
            "has_dob": has_dob,
            "raw_text": user_text
        }

classifier = UtteranceClassifier()
