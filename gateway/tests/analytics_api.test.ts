import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'http';
import { handleDataApi } from '../src/routes/dataApi.ts';

describe('Analytics & Dispositions Data API Integration', () => {
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

  it('GET /api/analytics returns overview KPIs, dispositions, personas, and cost ledger', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/analytics`);
    assert.strictEqual(res.status, 200);
    const body: any = await res.json();

    // Verify overview
    assert.ok(body.overview);
    assert.ok(typeof body.overview.totalCalls === 'number');
    assert.ok(body.overview.totalCalls > 0);
    assert.ok(typeof body.overview.avgHandleTimeSec === 'number');
    assert.ok(typeof body.overview.firstCallResolutionRate === 'number');
    assert.ok(typeof body.overview.promiseToPayRate === 'number');
    assert.ok(typeof body.overview.complianceGuardrailRate === 'number');
    assert.ok(typeof body.overview.totalCostUsd === 'number');
    assert.ok(typeof body.overview.estimatedNetSavingsUsd === 'number');
    assert.ok(body.overview.savingsPercentage > 90); // AI delivers >90% savings over human call center

    // Verify dispositions
    assert.ok(Array.isArray(body.dispositions));
    assert.ok(body.dispositions.length > 0);
    const disp = body.dispositions[0];
    assert.ok(typeof disp.disposition === 'string');
    assert.ok(typeof disp.count === 'number');
    assert.ok(typeof disp.percentage === 'number');

    // Verify personas breakdown
    assert.ok(Array.isArray(body.personas));
    assert.ok(body.personas.length > 0);
    const persona = body.personas[0];
    assert.ok(typeof persona.persona === 'string');
    assert.ok(typeof persona.totalCalls === 'number');
    assert.ok(typeof persona.resolutionRate === 'number');

    // Verify latency waterfall
    assert.ok(body.waterfall);
    assert.ok(body.waterfall.sttP50 > 0);
    assert.ok(body.waterfall.llmP50 > 0);
    assert.ok(body.waterfall.ttsP50 > 0);
    assert.ok(body.waterfall.e2eP50 < 800); // Meets low-latency voice SLA

    // Verify cost ledger
    assert.ok(body.costLedger);
    assert.ok(body.costLedger.totalCostUsd > 0);
    assert.ok(body.costLedger.humanEquivalentCostUsd > body.costLedger.totalCostUsd);
    assert.ok(body.costLedger.savingsPct > 90);
  });

  it('GET /api/analytics filters by persona', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/analytics?persona=cooperative`);
    assert.strictEqual(res.status, 200);
    const body: any = await res.json();
    assert.ok(body.overview.totalCalls > 0);
    // All grouped persona stats in this query should only be cooperative
    for (const p of body.personas) {
      assert.strictEqual(p.persona, 'cooperative');
    }
  });

  it('GET /api/analytics/export returns valid CSV attachment', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/analytics/export`);
    assert.strictEqual(res.status, 200);
    assert.ok(res.headers.get('content-type')?.includes('text/csv'));
    assert.ok(res.headers.get('content-disposition')?.includes('voice_ai_analytics_report.csv'));

    const csvText = await res.text();
    assert.ok(csvText.startsWith('session_id,source,variant,persona,outcome,turns,duration_sec,compliance_passed,score,cost_usd'));
    const lines = csvText.trim().split('\n');
    assert.ok(lines.length > 5);
  });
});
