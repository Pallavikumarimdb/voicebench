import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'http';
import { handleDataApi } from '../src/routes/dataApi.ts';

describe('Tools & Webhook Data API Integration', () => {
  let server: http.Server;
  let port: number;

  before(async () => {
    server = http.createServer(async (req, res) => {
      const handled = await handleDataApi(req, res);
      if (!handled) {
        res.writeHead(404);
        res.end('Not Found');
      }
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as any;
        port = addr.port;
        resolve();
      });
    });
  });

  after(() => {
    server.close();
  });

  it('GET /api/tools returns available tools schema list', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/tools`);
    assert.strictEqual(res.status, 200);
    const body: any = await res.json();
    assert.ok(Array.isArray(body.tools));
    assert.ok(body.tools.length >= 6);
    const toolNames = body.tools.map((t: any) => t.name);
    assert.ok(toolNames.includes('lookup_account'));
    assert.ok(toolNames.includes('record_promise'));
    assert.ok(toolNames.includes('send_sms_confirmation'));
  });

  it('POST /api/tools/execute executes test tool invocation', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/tools/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'send_sms_confirmation',
        arguments: { phone: '090-1111-2222', template: 'payment_link' },
      }),
    });
    assert.strictEqual(res.status, 200);
    const body: any = await res.json();
    assert.strictEqual(body.tool, 'send_sms_confirmation');
    assert.ok(typeof body.latency_ms === 'number');
  });

  it('POST /api/tools registers custom webhook definition', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/tools`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'crm_webhook_custom',
        url: 'https://webhook.site/test',
        description: 'Syncs lead status to Salesforce',
        method: 'POST',
        parameters: [{ name: 'lead_id', type: 'string', required: true }],
      }),
    });
    assert.strictEqual(res.status, 200);
    const body: any = await res.json();
    assert.strictEqual(body.success, true);
  });
});
