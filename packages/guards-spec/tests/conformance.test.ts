import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GuardEngine, parseJapaneseAmount, normalizeJapaneseNumbers } from '../src/index.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const conformancePath = path.resolve(__dirname, '../conformance.json');
const conformanceData = JSON.parse(fs.readFileSync(conformancePath, 'utf-8'));

describe('P7-T2 Guard Conformance Vectors (TypeScript)', () => {
  const engine = new GuardEngine();

  it('passes all amount parsing conformance vectors (Kanji, Zenkaku, Arabic)', () => {
    for (const vector of conformanceData.amount_parsing_vectors) {
      const parsed = parseJapaneseAmount(vector.input);
      // Sort both for comparison
      const sortedActual = [...parsed].sort((a, b) => a - b);
      const sortedExpected = [...vector.expected_amounts].sort((a, b) => a - b);
      assert.deepStrictEqual(
        sortedActual,
        sortedExpected,
        `Failed amount parsing on vector: "${vector.description}" -> ${vector.input}`
      );
    }
  });

  it('passes all post-LLM guard conformance vectors', () => {
    for (const vector of conformanceData.post_llm_guard_vectors) {
      const result = engine.checkPostLLM(vector.input_text, vector.state);
      if (vector.expected_violation === null) {
        assert.strictEqual(
          result.allowed,
          true,
          `Expected compliant pass for vector: "${vector.description}"`
        );
      } else {
        assert.strictEqual(
          result.allowed,
          false,
          `Expected violation for vector: "${vector.description}"`
        );
        assert.strictEqual(
          result.violationCode,
          vector.expected_violation,
          `Violation code mismatch for: "${vector.description}"`
        );
      }
    }
  });
});
