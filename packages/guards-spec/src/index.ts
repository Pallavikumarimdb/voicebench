/**
 * Shared Browser and Gateway Compliance Guard Engine
 * Loads unified rule specs and executes deterministic Japanese debt collection compliance.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rulesPath = path.resolve(__dirname, '../rules.json');
const rulesData = JSON.parse(fs.readFileSync(rulesPath, 'utf-8'));

export interface GuardRuleConfig {
  calling_hours: {
    start: string;
    end: string;
    timezone: string;
  };
  negotiation: {
    max_discount_pct: number;
    min_down_payment_pct: number;
    max_installments: number;
    max_duration_days: number;
  };
  forbidden_patterns: Array<{
    pattern: string;
    rule_code: string;
    flags: string;
  }>;
}

export const RULES: GuardRuleConfig = rulesData as GuardRuleConfig;

const ZENKAKU_DIGITS: Record<string, string> = {
  '０': '0', '１': '1', '２': '2', '３': '3', '４': '4',
  '５': '5', '６': '6', '７': '7', '８': '8', '９': '9',
  '，': ','
};

const KANJI_NUMS: Record<string, number> = {
  '〇': 0, '一': 1, '二': 2, '三': 3, '四': 4,
  '五': 5, '六': 6, '七': 7, '八': 8, '九': 9,
  '十': 10, '百': 100, '千': 1000, '万': 10000
};

export function normalizeJapaneseNumbers(text: string): string {
  return text.replace(/[０-９，]/g, (ch) => ZENKAKU_DIGITS[ch] || ch);
}

export function parseJapaneseAmount(text: string): number[] {
  const normText = normalizeJapaneseNumbers(text);
  const amounts: number[] = [];

  // 1. Mixed numerals like 4万8千円, 4万8000円, or 4万円
  const mixedRegex = /([0-9]+)\s*万\s*(?:([0-9]+)\s*千|([0-9]+))?\s*円?/g;
  let match: RegExpExecArray | null;
  while ((match = mixedRegex.exec(normText)) !== null) {
    const man = parseInt(match[1], 10) * 10000;
    let sen = 0;
    if (match[2]) {
      sen = parseInt(match[2], 10) * 1000;
    } else if (match[3]) {
      sen = parseInt(match[3], 10);
    }
    const total = man + sen;
    if (total > 0) amounts.push(total);
  }

  // 2. Pure kanji amounts like 一万二千円 or 四万八千円
  const kanjiRegex = /([一二三四五六七八九十百千万]+)\s*円/g;
  while ((match = kanjiRegex.exec(normText)) !== null) {
    const rawKanji = match[1];
    let val = 0;
    let temp = 0;
    let section = 0;
    for (const char of rawKanji) {
      if ('一二三四五六七八九'.includes(char)) {
        temp = KANJI_NUMS[char];
      } else if ('十百千'.includes(char)) {
        const unit = KANJI_NUMS[char];
        section += (temp > 0 ? temp : 1) * unit;
        temp = 0;
      } else if (char === '万') {
        section += temp;
        val += (section > 0 ? section : 1) * 10000;
        section = 0;
        temp = 0;
      }
    }
    val += section + temp;
    if (val > 0) amounts.push(val);
  }

  // Mask out already processed '万...円' spans to avoid re-matching trailing digits
  const textWithoutMan = normText.replace(/[0-9]+\s*万\s*(?:[0-9]+\s*千|[0-9]+)?\s*円?/g, ' ');

  // 3. Arabic numerals directly before '円': e.g., 48,000円 or 48000円
  const arabicRegex = /([0-9]{1,3}(?:,[0-9]{3})+|[0-9]+)\s*円/g;
  while ((match = arabicRegex.exec(textWithoutMan)) !== null) {
    const num = parseInt(match[1].replace(/,/g, ''), 10);
    if (!isNaN(num) && num > 0) amounts.push(num);
  }

  // 4. Bare numbers with payment context
  const bareRegex = /(?:お支払い|金額|残高|ご請求|合計|頭金)\D{0,6}([0-9]{1,3}(?:,[0-9]{3})+|[0-9]{4,7})/g;
  while ((match = bareRegex.exec(textWithoutMan)) !== null) {
    const num = parseInt(match[1].replace(/,/g, ''), 10);
    if (!isNaN(num) && num > 0) amounts.push(num);
  }

  return Array.from(new Set(amounts));
}

export interface TurnState {
  identity_verified?: boolean;
  disclosure_done?: boolean;
  stop_contact?: boolean;
  debtor_profile?: { creditor?: string };
  creditor?: string;
  approved_terms?: { max_installments?: number };
}

export interface GuardCheckResult {
  allowed: boolean;
  violationCode?: string;
  fallbackUtterance?: string;
}

export class GuardEngine {
  private rules: GuardRuleConfig;
  private compiledPatterns: Array<{ regex: RegExp; code: string }>;

  constructor(rules: GuardRuleConfig = RULES) {
    this.rules = rules;
    this.compiledPatterns = rules.forbidden_patterns.map((fp) => ({
      regex: new RegExp(fp.pattern, fp.flags),
      code: fp.rule_code
    }));
  }

  checkPostLLM(proposedText: string, state: TurnState): GuardCheckResult {
    // 1. Forbidden pattern checks
    for (const p of this.compiledPatterns) {
      if (p.regex.test(proposedText)) {
        return {
          allowed: false,
          violationCode: p.code,
          fallbackUtterance: '誠に恐れ入ります。お客様のご都合に合わせて、無理のない解決方法を一緒にご検討できればと存じます。'
        };
      }
    }

    // 2. Pre-verification disclosure of amounts or creditor
    const extractedAmounts = parseJapaneseAmount(proposedText);
    const creditor = state.debtor_profile?.creditor || state.creditor || '';
    const hasCreditorLeak = creditor.length > 0 && proposedText.includes(creditor);
    const hasAmountLeak = extractedAmounts.length > 0;

    const verified = Boolean(state.identity_verified);
    const disclosed = Boolean(state.disclosure_done);

    if ((hasAmountLeak || hasCreditorLeak) && !(verified && disclosed)) {
      return {
        allowed: false,
        violationCode: hasAmountLeak ? 'amount_disclosed_before_verification' : 'creditor_disclosed_before_verification',
        fallbackUtterance: '個人情報保護のため、詳しいご案内の前にご本人様確認をお願いしております。生年月日をお伺いできますでしょうか。'
      };
    }

    // 3. Negotiation installment bounds
    const maxInstallments = state.approved_terms?.max_installments || this.rules.negotiation.max_installments;
    const instMatches = proposedText.matchAll(/([0-9]+)\s*回(?:払い|分割)/g);
    for (const im of instMatches) {
      if (parseInt(im[1], 10) > maxInstallments) {
        return {
          allowed: false,
          violationCode: 'terms_exceeded_installments',
          fallbackUtterance: `分割でのお支払いにつきましては、規定により最大${maxInstallments}回までご案内可能となっております。`
        };
      }
    }

    // 4. Continued collections after stop contact requested
    if (state.stop_contact && ['お支払い', 'ご請求', '返済', '振込', '金額'].some((w) => proposedText.includes(w))) {
      return {
        allowed: false,
        violationCode: 'collection_after_stop_contact',
        fallbackUtterance: 'ご連絡停止のご要望を承知いたしました。今後の連絡を控えさせていただきます。失礼いたします。'
      };
    }

    return { allowed: true };
  }
}
