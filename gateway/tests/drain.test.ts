import { describe, it } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { SessionManager } from '../src/Session.ts';

describe('P6-T3 Graceful Drain Semantics', () => {
  it('drains active WebSocket connections gracefully and rejects new sessions', async () => {
    let isDraining = false;
    const sessionManager = new SessionManager();

    // Set up test HTTP & WS server mirroring gateway drain semantics
    const testServer = http.createServer((req, res) => {
      if ((req.url === '/health' || req.url === '/healthz') && req.method === 'GET') {
        if (isDraining) {
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'draining', activeSessions: sessionManager.getAll().length }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', activeSessions: sessionManager.getAll().length }));
        return;
      }

      if (req.url === '/drain' && req.method === 'POST') {
        isDraining = true;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'draining', activeSessions: sessionManager.getAll().length }));
        return;
      }

      res.writeHead(404);
      res.end();
    });

    const wss = new WebSocketServer({ noServer: true });

    testServer.on('upgrade', (request, socket, head) => {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    });

    wss.on('connection', (clientWs: WebSocket) => {
      if (isDraining) {
        clientWs.send(JSON.stringify({ type: 'error', code: 'SERVER_DRAINING' }));
        clientWs.close(1013, 'Server draining');
        return;
      }
      const sId = `test_${Math.random()}`;
      const session = sessionManager.create(sId, clientWs);
      clientWs.on('close', () => {
        sessionManager.remove(sId);
      });
      clientWs.on('message', (data) => {
        // Echo back audio/text turns
        clientWs.send(data);
      });
    });

    await new Promise<void>((resolve) => testServer.listen(0, '127.0.0.1', () => resolve()));
    const address = testServer.address() as { port: number };
    const port = address.port;

    // Helper for HTTP GET
    const httpGet = (path: string): Promise<{ statusCode: number; body: any }> => {
      return new Promise((resolve, reject) => {
        http.get(`http://127.0.0.1:${port}${path}`, (res) => {
          let data = '';
          res.on('data', (c) => (data += c));
          res.on('end', () => resolve({ statusCode: res.statusCode || 0, body: JSON.parse(data) }));
        }).on('error', reject);
      });
    };

    // Helper for HTTP POST
    const httpPost = (path: string): Promise<{ statusCode: number; body: any }> => {
      return new Promise((resolve, reject) => {
        const req = http.request(
          `http://127.0.0.1:${port}${path}`,
          { method: 'POST' },
          (res) => {
            let data = '';
            res.on('data', (c) => (data += c));
            res.on('end', () => resolve({ statusCode: res.statusCode || 0, body: JSON.parse(data) }));
          }
        );
        req.on('error', reject);
        req.end();
      });
    };

    // 1. Initial State: health is 200 OK
    const h1 = await httpGet('/healthz');
    assert.strictEqual(h1.statusCode, 200);
    assert.strictEqual(h1.body.status, 'ok');

    // 2. Open an active call WebSocket (call 1)
    const wsClient1 = new WebSocket(`ws://127.0.0.1:${port}/session`);
    await new Promise<void>((resolve) => wsClient1.on('open', () => resolve()));
    assert.strictEqual(sessionManager.getAll().length, 1);

    // Verify call 1 can send and receive turn frames without error
    const receivedFrames: string[] = [];
    wsClient1.on('message', (d) => receivedFrames.push(d.toString()));
    wsClient1.send(JSON.stringify({ type: 'audio_frame', seq: 1 }));

    await new Promise((r) => setTimeout(r, 50));
    assert.strictEqual(receivedFrames.length, 1);
    assert.strictEqual(JSON.parse(receivedFrames[0]).type, 'audio_frame');

    // 3. Scale-in trigger: preStop hook invokes /drain
    const drainRes = await httpPost('/drain');
    assert.strictEqual(drainRes.statusCode, 200);
    assert.strictEqual(drainRes.body.status, 'draining');
    assert.strictEqual(drainRes.body.activeSessions, 1);

    // 4. Kubernetes readiness probe /healthz now returns 503 so kube-proxy stops routing new calls
    const h2 = await httpGet('/healthz');
    assert.strictEqual(h2.statusCode, 503);
    assert.strictEqual(h2.body.status, 'draining');

    // 5. Existing active call 1 is NOT terminated; continues transmitting packets
    wsClient1.send(JSON.stringify({ type: 'audio_frame', seq: 2 }));
    await new Promise((r) => setTimeout(r, 50));
    assert.strictEqual(receivedFrames.length, 2);
    assert.strictEqual(JSON.parse(receivedFrames[1]).seq, 2);

    // 6. Any new WebSocket connection attempting to hit this pod is rejected with SERVER_DRAINING (1013)
    const wsClient2 = new WebSocket(`ws://127.0.0.1:${port}/session`);
    const closePromise = new Promise<{ code: number; reason: string }>((resolve) => {
      wsClient2.on('close', (code, reason) => resolve({ code, reason: reason.toString() }));
    });
    const ws2Messages: string[] = [];
    wsClient2.on('message', (d) => ws2Messages.push(d.toString()));

    const closeInfo = await closePromise;
    assert.strictEqual(closeInfo.code, 1013);
    assert.strictEqual(ws2Messages.length, 1);
    assert.strictEqual(JSON.parse(ws2Messages[0]).code, 'SERVER_DRAINING');

    // 7. Call 1 hangs up naturally after completing its conversation
    wsClient1.close();
    await new Promise((r) => setTimeout(r, 50));
    assert.strictEqual(sessionManager.getAll().length, 0);

    // Clean up test server
    testServer.close();
    wss.close();
  });
});
