/**
 * Cryptographic Hash Chain Verifier.
 * Direct TypeScript port of services/agent/app/verify_audit.py and audit.py.
 * Computes canonical JSON SHA-256 digests and validates append-only tamper evidence.
 */

import type { AuditRecord, AuditVerifyResult } from './types.ts';

/**
 * Standard pure-JavaScript SHA-256 implementation (FIPS 180-4).
 * Runs synchronously across all Node.js and Browser environments.
 */
export function sha256(str: string): string {
  function rightRotate(value: number, amount: number) {
    return (value >>> amount) | (value << (32 - amount));
  }

  let i: number, j: number;
  let result = '';

  const words: number[] = [];

  let hash = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
  ];

  const k = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];

  // UTF-8 encode
  const utf8Bytes: number[] = [];
  for (let c = 0; c < str.length; c++) {
    let charCode = str.charCodeAt(c);
    if (charCode < 0x80) {
      utf8Bytes.push(charCode);
    } else if (charCode < 0x800) {
      utf8Bytes.push(0xc0 | (charCode >> 6), 0x80 | (charCode & 0x3f));
    } else if (charCode < 0xd800 || charCode >= 0xe000) {
      utf8Bytes.push(0xe0 | (charCode >> 12), 0x80 | ((charCode >> 6) & 0x3f), 0x80 | (charCode & 0x3f));
    } else {
      // surrogate pair
      c++;
      charCode = 0x10000 + (((charCode & 0x3ff) << 10) | (str.charCodeAt(c) & 0x3ff));
      utf8Bytes.push(
        0xf0 | (charCode >> 18),
        0x80 | ((charCode >> 12) & 0x3f),
        0x80 | ((charCode >> 6) & 0x3f),
        0x80 | (charCode & 0x3f)
      );
    }
  }

  for (i = 0; i < utf8Bytes.length; i++) {
    words[i >> 2] |= utf8Bytes[i] << ((3 - (i % 4)) * 8);
  }

  const bitLength = utf8Bytes.length * 8;
  words[bitLength >> 5] |= 0x80 << (24 - (bitLength % 32));
  words[(((bitLength + 64) >> 9) << 4) + 15] = bitLength;

  for (i = 0; i < words.length; i += 16) {
    const w: number[] = [];
    for (j = 0; j < 16; j++) w[j] = words[i + j] | 0;
    for (j = 16; j < 64; j++) {
      const s0 = rightRotate(w[j - 15], 7) ^ rightRotate(w[j - 15], 18) ^ (w[j - 15] >>> 3);
      const s1 = rightRotate(w[j - 2], 17) ^ rightRotate(w[j - 2], 19) ^ (w[j - 2] >>> 10);
      w[j] = (w[j - 16] + s0 + w[j - 7] + s1) | 0;
    }

    let a = hash[0], b = hash[1], c = hash[2], d = hash[3];
    let e = hash[4], f = hash[5], g = hash[6], h = hash[7];

    for (j = 0; j < 64; j++) {
      const s1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + ch + k[j] + w[j]) | 0;
      const s0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + maj) | 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) | 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) | 0;
    }

    hash[0] = (hash[0] + a) | 0;
    hash[1] = (hash[1] + b) | 0;
    hash[2] = (hash[2] + c) | 0;
    hash[3] = (hash[3] + d) | 0;
    hash[4] = (hash[4] + e) | 0;
    hash[5] = (hash[5] + f) | 0;
    hash[6] = (hash[6] + g) | 0;
    hash[7] = (hash[7] + h) | 0;
  }

  for (i = 0; i < 8; i++) {
    for (j = 3; j >= 0; j--) {
      const byte = (hash[i] >> (j * 8)) & 255;
      result += (byte < 16 ? '0' : '') + byte.toString(16);
    }
  }

  return result;
}

/**
 * Serializes an object to canonical JSON (sorted keys recursively, compact delimiters),
 * matching Python's `json.dumps(obj, sort_keys=True, ensure_ascii=False)`.
 */
export function canonicalJsonStringify(obj: any): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalJsonStringify).join(',') + ']';
  }
  const sortedKeys = Object.keys(obj).sort();
  const pairs = sortedKeys.map((k) => `${JSON.stringify(k)}:${canonicalJsonStringify(obj[k])}`);
  return '{' + pairs.join(',') + '}';
}

/**
 * Computes the SHA-256 hash of an audit record matching the backend `compute_hash`.
 */
export function computeRecordHash(record: Record<string, any>): string {
  const withoutHash: Record<string, any> = {};
  for (const k of Object.keys(record)) {
    if (k !== 'hash') {
      withoutHash[k] = record[k];
    }
  }
  const canonical = canonicalJsonStringify(withoutHash);
  return sha256(canonical);
}

/**
 * Verifies cryptographic integrity of an array of audit records.
 * Exactly matches `services/agent/app/audit.py`'s `verify_audit_file`.
 */
export function verifyHashChain(records: AuditRecord[]): AuditVerifyResult {
  if (!records || records.length === 0) {
    return { valid: true, verifiedCount: 0 };
  }

  let expectedPrev = 'GENESIS';

  for (let idx = 0; idx < records.length; idx++) {
    const entry = records[idx];
    if ((entry as any).type === 'chain_head') {
      if (idx !== records.length - 1) {
        return {
          valid: false,
          error: `chain_head record must be the final entry, found at index ${idx}`,
          verifiedCount: idx,
        };
      }
      if ((entry as any).head_hash !== expectedPrev) {
        return {
          valid: false,
          error: `chain_head hash mismatch: head_hash '${(entry as any).head_hash}' != chain tail '${expectedPrev}'`,
          verifiedCount: idx,
        };
      }
      continue;
    }

    const seq = entry.seq ?? idx + 1;
    const storedHash = entry.hash;
    const entryPrev = entry.prev_hash;

    if (entryPrev !== expectedPrev) {
      return {
        valid: false,
        error: `Broken chain at seq ${seq}: prev_hash '${entryPrev}' != expected '${expectedPrev}'`,
        verifiedCount: idx,
        brokenSeq: seq,
      };
    }

    const recomputed = computeRecordHash(entry);
    if (recomputed !== storedHash) {
      return {
        valid: false,
        error: `Hash mismatch at seq ${seq}: stored '${storedHash}' != recomputed '${recomputed}'`,
        verifiedCount: idx,
        brokenSeq: seq,
      };
    }

    expectedPrev = storedHash;
  }

  return {
    valid: true,
    verifiedCount: records.length,
  };
}
