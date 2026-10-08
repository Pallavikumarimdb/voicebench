import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'http';
import { handleDataApi } from '../src/routes/dataApi.ts';

describe('No-Code Agent Studio & Persona API Integration', () => {
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

  it('GET /api/studio/personas returns personas list with voice and LLM configs', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/studio/personas`);
    assert.strictEqual(res.status, 200);
    const body: any = await res.json();
    assert.ok(Array.isArray(body.personas));
    assert.ok(body.personas.length >= 2);
    const mirai = body.personas.find((p: any) => p.id === 'mirai_collections_ja');
    assert.ok(mirai);
    assert.strictEqual(mirai.language, 'ja');
    assert.ok(mirai.voice_settings);
    assert.ok(mirai.llm_settings);
    assert.ok(Array.isArray(mirai.assigned_tools));
  });

  it('POST /api/studio/personas saves custom voice persona', async () => {
    const payload = {
      id: 'concierge_vip',
      name: 'VIP Hotel Concierge',
      description: 'Luxury booking and table reservation assistant',
      domain: 'custom',
      language: 'en',
      greeting: 'Good afternoon, VIP concierge at your service.',
      system_prompt: 'Assist guests with dining, transfer, and suite amenities.',
      voice_settings: { provider: 'elevenlabs', voice_id: 'en_us_matthew', speed: 1.05 },
      llm_settings: { provider: 'openai', model: 'gpt-4o-mini', temperature: 0.3 },
      assigned_tools: ['check_availability', 'send_sms_confirmation'],
    };

    const res = await fetch(`http://127.0.0.1:${port}/api/studio/personas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    assert.strictEqual(res.status, 200);
    const body: any = await res.json();
    assert.strictEqual(body.success, true);
  });

  it('POST /api/studio/simulate-turn runs turn simulation preview', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/studio/simulate-turn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        persona_id: 'mirai_collections_ja',
        message: '1985年4月12日生まれです。残高を確認できますか。',
      }),
    });
    assert.strictEqual(res.status, 200);
    const body: any = await res.json();
    assert.strictEqual(body.success, true);
    assert.ok(typeof body.agent_response === 'string');
    assert.ok(typeof body.latency_ms === 'number');
  });
});
