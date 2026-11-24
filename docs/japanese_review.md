# Japanese Language & Keigo Review Checklist

> **Status**: Internal synthetic draft completed. **Formal native-speaker review is pending.**
> In accordance with Hard Rule 7 of the project specification, no claims of certified native review are made until human review is conducted and signed off below.

---

## 1. Keigo & Register Guidelines Applied

- **Register**: Polite formal Japanese (丁寧語 / です・ます調) throughout all agent nodes.
- **Honorifics**: Proper caller honorifics (`{debtor_name}様`, `ご本人様`, `お電話口の方`).
- **Humbler forms (謙譲語)**: Self-referential modesty (`私ども`, `ご案内いたします`, `お伺いできますでしょうか`).
- **Non-threatening phrasing**: Avoidance of imperative / aggressive debt collection tropes. Replaced coercive demands with neutral, solution-oriented inquiries (`ご事情をお聞かせいただけますでしょうか`).

---

## 2. Review Checklist for Native Speaker

| Section | Target File | Checks Needed | Sign-off Status |
|---|---|---|---|
| Caller Greet & ID Verification | `services/agent/app/prompts/ja/greet.txt`, `verify.txt` | Natural flow, courteous inquiry of DOB | [ ] Pending |
| Legal Disclosures | `services/agent/app/prompts/ja/disclose.txt` | Clear pronunciation when spoken by TTS, standard call recording phrasing | [ ] Pending |
| Financial Discovery | `services/agent/app/prompts/ja/discover.txt` | Empathetic tone, avoiding shaming | [ ] Pending |
| Installment Negotiation | `services/agent/app/prompts/ja/negotiate.txt` | Clear statement of installment counts and monthly amounts | [ ] Pending |
| Promise Read-back | `services/agent/app/prompts/ja/capture_promise.txt` | Read-back clarity (Yen amounts, dates) | [ ] Pending |
| Third-Party Protection | `services/agent/app/prompts/ja/close.txt`, `nodes.py` | Discreet handling when family member answers | [ ] Pending |
| Stop-Contact Exit | `services/agent/app/compliance/guard.py` | Immediate polite cessation of contact | [ ] Pending |

---

## 3. Notes for Reviewer

1. Please check if any phrases sound translated or unnatural when read aloud.
2. Verify that numerals (`48,000円` vs `四万八千円`) and calendar dates sound natural across text-to-speech engines.
3. Suggest any keigo refinements that enhance debtor cooperation without reducing clarity.

---

## 4. Tier 3 Safe-Mode Fallback Scripts (P2-T4)

> **Review Status**: `needs human review`
> These deterministic responses are triggered when all LLM backends fail (`ALL_BACKENDS_FAILED`).
> They must remain polite, empathetic, non-leaking, and clearly offer a human handoff.

| Domain | Language | Script Content | Handoff Action | Review Flag |
|---|---|---|---|---|
| **Collections** | **JA** | 大変恐れ入ります。現在システム通信が混み合っております。担当のオペレーターへお繋ぎいたしますので、少々お待ちいただけますでしょうか。 | Transfer to human representative | `needs human review` |
| **Collections** | **EN** | I apologize, but our system is currently experiencing technical difficulties. Let me transfer you directly to a representative. Please stay on the line. | Transfer to human representative | Verified |
| **Screening** | **JA** | 恐れ入ります。現在通信状況が不安定なため、採用担当者より改めてメールにて面接日程をご案内させていただきます。本日はお時間をいただきありがとうございました。 | Async email follow-up | `needs human review` |
| **Screening** | **EN** | I apologize, but our automated system is experiencing technical issues. A hiring coordinator will follow up with you directly by email within one business day. | Async email follow-up | Verified |
| **KYC** | **JA** | 大変恐れ入ります。セキュリティ認証システムが混み合っているため、専門窓口のオペレーターへ転送いたします。そのままお待ちください。 | Transfer to KYC specialist | `needs human review` |
| **KYC** | **EN** | I apologize, but we cannot complete verification at this time. I am transferring your call to a customer verification specialist. Please hold. | Transfer to KYC specialist | Verified |
| **Custom** | **JA** | 大変恐れ入ります。現在システムが混み合っております。担当のオペレーターにお繋ぎいたします。 | Transfer to general operator | `needs human review` |
| **Custom** | **EN** | I apologize, but we are currently experiencing technical difficulties. Let me transfer you to a specialist. | Transfer to general operator | Verified |

