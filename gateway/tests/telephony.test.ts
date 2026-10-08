import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'http';
import { handleDataApi, setTelephonyManager } from '../src/routes/dataApi.ts';
import { telephonyManager } from '../src/telephony/telephonyBridge.ts';
import {
  linearToMuLawSample,
  muLawToLinearSample,
  decodeMuLaw8kToPcm16k,
  encodePcmToMuLaw8k,
} from '../src/telephony/codecs.ts';

describe('Telephony Audio Codecs & G.711 Transcoding', () => {
  it('transcodes single sample linear PCM <-> mu-law within ITU bounds', () => {
    const testSamples = [0, 500, 2000, 15000, -500, -2000, -15000];
    for (const sample of testSamples) {
      const mu = linearToMuLawSample(sample);
      assert.ok(mu >= 0 && mu <= 255);
      const decoded = muLawToLinearSample(mu);
      // G.711 mu-law is logarithmic compression: quantization error is proportional to magnitude
      const diff = Math.abs(decoded - sample);
      const maxAllowedDiff = Math.max(80, Math.abs(sample) * 0.08);
      assert.ok(diff <= maxAllowedDiff, `Sample ${sample} vs decoded ${decoded} diff ${diff} exceeded ${maxAllowedDiff}`);
    }
  });

  it('upsamples 8kHz mu-law audio buffer to 16kHz 16-bit PCM', () => {
    // 160 bytes of 8kHz mu-law = 20ms of telephone audio
    const muLawBuffer = Buffer.alloc(160);
    for (let i = 0; i < muLawBuffer.length; i++) {
      muLawBuffer[i] = (i * 7) % 256;
    }

    const pcm16k = decodeMuLaw8kToPcm16k(muLawBuffer);
    // 160 samples at 8kHz -> 320 samples at 16kHz -> 640 bytes (16-bit LE)
    assert.strictEqual(pcm16k.length, 160 * 4);
  });

  it('downsamples 16kHz 16-bit PCM buffer to 8kHz mu-law', () => {
    // 640 bytes of 16kHz 16-bit PCM = 320 samples = 20ms of audio
    const pcm16k = Buffer.alloc(640);
    for (let i = 0; i < 320; i++) {
      pcm16k.writeInt16LE(Math.sin(i / 10) * 10000, i * 2);
    }

    const muLaw8k = encodePcmToMuLaw8k(pcm16k, 16000);
    // 320 samples at 16kHz -> 160 samples at 8kHz -> 160 bytes
    assert.strictEqual(muLaw8k.length, 160);
  });
});

describe('Telephony Bridge & Twilio Integration API', () => {
  let server: http.Server;
  let port: number;

  before(async () => {
    setTelephonyManager(telephonyManager);
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

  it('GET /api/telephony/numbers returns configured phone numbers', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/telephony/numbers`);
    assert.strictEqual(res.status, 200);
    const body: any = await res.json();
    assert.ok(Array.isArray(body.numbers));
    assert.ok(body.numbers.length >= 2);
    const num = body.numbers[0];
    assert.ok(num.phoneNumber);
    assert.ok(num.personaId);
  });

  it('POST /api/telephony/numbers updates phone number persona assignment', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/telephony/numbers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phoneNumber: '+1 (800) 555-9999',
        friendlyName: 'New Test Hotline',
        personaId: 'sarah_support_en',
        language: 'en',
        provider: 'twilio',
        status: 'active',
        configuredAt: Date.now(),
      }),
    });
    assert.strictEqual(res.status, 200);
    const body: any = await res.json();
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.number.phoneNumber, '+1 (800) 555-9999');
  });

  it('GET /api/telephony/calls returns telephony call records', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/telephony/calls`);
    assert.strictEqual(res.status, 200);
    const body: any = await res.json();
    assert.ok(Array.isArray(body.calls));
    assert.ok(body.calls.length >= 2);
  });

  it('POST /api/telephony/calls/outbound initiates an outbound call', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/telephony/calls/outbound`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        toPhone: '+1 (555) 987-6543',
        personaId: 'mirai_collections_ja',
      }),
    });
    assert.strictEqual(res.status, 200);
    const body: any = await res.json();
    assert.strictEqual(body.success, true);
    assert.ok(body.call.callSid.startsWith('CA_'));
    assert.strictEqual(body.call.toPhone, '+1 (555) 987-6543');
    assert.strictEqual(body.call.direction, 'outbound');

    // Test programmatic hangup
    const hangupRes = await fetch(`http://127.0.0.1:${port}/api/telephony/calls/${body.call.callSid}/hangup`, {
      method: 'POST',
    });
    assert.strictEqual(hangupRes.status, 200);
    const hangupBody: any = await hangupRes.json();
    assert.strictEqual(hangupBody.success, true);
  });

  it('GET /api/telephony/twilio/incoming returns TwiML with Media Stream directive', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/telephony/twilio/incoming`);
    assert.strictEqual(res.status, 200);
    assert.ok(res.headers.get('content-type')?.includes('text/xml'));
    const twiml = await res.text();
    assert.ok(twiml.includes('<Response>'));
    assert.ok(twiml.includes('<Stream url="'));
    assert.ok(twiml.includes('/telephony/stream'));
  });
});
