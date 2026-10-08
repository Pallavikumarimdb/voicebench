import { describe, it } from 'node:test';
import assert from 'node:assert';
import { isPathSafe, isValidId } from '../src/routes/dataApi.ts';

describe('Data API Security & Path Traversal Guards', () => {
  it('allows valid call and persona session IDs', () => {
    assert.strictEqual(isValidId('sim_v2_graph_cooperative_1000_1790946563380'), true);
    assert.strictEqual(isValidId('cli_1790945208'), true);
    assert.strictEqual(isValidId('cooperative'), true);
    assert.strictEqual(isValidId('call-001'), true);
  });

  it('rejects path traversal attempts in IDs', () => {
    assert.strictEqual(isValidId('../../../etc/passwd'), false);
    assert.strictEqual(isValidId('sim_..\\..\\secret'), false);
    assert.strictEqual(isValidId('id;cat /etc/shadow'), false);
    assert.strictEqual(isValidId('sim/../../something'), false);
    assert.strictEqual(isValidId(''), false);
    assert.strictEqual(isValidId('hello world'), false);
  });

  it('validates whitelisted path safety', () => {
    // Dangerous paths
    assert.strictEqual(isPathSafe('../../package.json'), false);
    assert.strictEqual(isPathSafe('C:\\Windows\\System32\\cmd.exe'), false);
    assert.strictEqual(isPathSafe('/etc/passwd'), false);

    // Prefix-collision attack (same prefix directory name bypass)
    assert.strictEqual(isPathSafe('services/agent/audit_logs_fake/leak.jsonl'), false);
    assert.strictEqual(isPathSafe('eval/agent/personas_malicious/leak.yaml'), false);
  });
});
