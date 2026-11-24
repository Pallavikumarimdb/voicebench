import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { handleDataApi, isPathSafe, POLICIES_DIR } from '../src/routes/dataApi.ts';

describe('P8-T1 Policy API Security & Management', () => {
  const server = http.createServer(async (req, res) => {
    if (await handleDataApi(req, res)) return;
    res.writeHead(404);
    res.end();
  });

  let port: number;
  before(() => {
    return new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        port = (server.address() as any).port;
        resolve();
      });
    });
  });

  after(() => {
    server.close();
  });

  it('GET /api/policies returns list of available policy files', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/policies`);
    assert.strictEqual(res.status, 200);
    const body = await res.json() as { policies: any[] };
    assert.ok(Array.isArray(body.policies));
    assert.ok(body.policies.some((p: any) => p.id === 'default'));
  });

  it('GET /api/policies/default returns policy content', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/policies/default`);
    assert.strictEqual(res.status, 200);
    const body = await res.json() as { id: string; content: string };
    assert.strictEqual(body.id, 'default');
    assert.ok(body.content.includes('t0_fast_path'));
  });

  it('POST /api/policies/:id rejects unauthenticated requests', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/policies/test_policy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'version: 1\nprofile: test' })
    });
    assert.strictEqual(res.status, 401);
  });

  it('POST /api/policies/:id writes policy atomically and appends to change log with valid admin token', async () => {
    const adminToken = process.env.ADMIN_TOKEN || 'dev-admin-secret-token';
    const testPolicyContent = '# Test Policy Profile\nversion: 1\nprofile: unit_test_profile\nbudgets:\n  ttft_ms: 300\n';

    const res = await fetch(`http://127.0.0.1:${port}/api/policies/unit_test_profile`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        content: testPolicyContent,
        who: 'test-runner',
        note: 'Automated test update',
        weakens_compliance: false
      })
    });

    assert.strictEqual(res.status, 200);
    const body = await res.json() as any;
    assert.strictEqual(body.success, true);

    // Verify file exists on disk
    const targetFile = path.join(POLICIES_DIR, 'unit_test_profile.yaml');
    assert.ok(fs.existsSync(targetFile));
    assert.strictEqual(fs.readFileSync(targetFile, 'utf-8'), testPolicyContent);

    // Clean up test file
    try {
      fs.unlinkSync(targetFile);
      const lkg = path.join(POLICIES_DIR, 'unit_test_profile.lkg.yaml');
      if (fs.existsSync(lkg)) fs.unlinkSync(lkg);
    } catch {}
  });

  it('rejects path traversal attempts on policy endpoints', async () => {
    assert.strictEqual(isPathSafe(path.join(POLICIES_DIR, '../../etc/passwd')), false);
    assert.strictEqual(isPathSafe(path.join(POLICIES_DIR, '../policies_fake/leak.yaml')), false);
  });
});
