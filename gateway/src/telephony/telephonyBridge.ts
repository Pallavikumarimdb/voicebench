/**
 * Production Twilio & SIP PSTN Media Streams Bridge
 * 
 * Manages full duplex telephone media streams, real-time G.711 mu-law transcoding,
 * caller barge-in clearance, dual-channel call recording, and outbound dialing.
 */

import { WebSocket } from 'ws';
import crypto from 'crypto';
import path from 'path';
// Precomputed 256-entry lookup table for ultra-fast mu-law to linear 16-bit PCM conversion
const MULAW_TO_LINEAR_TABLE = new Int16Array(256);
for (let i = 0; i < 256; i++) {
  let mu = ~i & 0xff;
  let sign = mu & 0x80;
  let exponent = (mu >> 4) & 0x07;
  let mantissa = mu & 0x0f;
  let sample = ((mantissa << 3) + 0x84) << exponent;
  sample -= 0x84;
  MULAW_TO_LINEAR_TABLE[i] = sign !== 0 ? -sample : sample;
}

export function linearToMuLawSample(sample: number): number {
  const CLIP = 32635;
  const BIAS = 0x84;
  let sign = (sample >> 8) & 0x80;
  if (sign !== 0) sample = -sample;
  if (sample > CLIP) sample = CLIP;
  sample += BIAS;
  let exponent = 7;
  for (let expMask = 0x4000; (sample & expMask) === 0 && exponent > 0; expMask >>= 1) {
    exponent--;
  }
  let mantissa = (sample >> (exponent + 3)) & 0x0f;
  return ~(sign | (exponent << 4) | mantissa) & 0xff;
}

export function decodeMuLaw8kToPcm16k(muLawBuffer: Buffer): Buffer {
  const inLength = muLawBuffer.length;
  const outPcm = Buffer.alloc(inLength * 4);
  let outOffset = 0;
  for (let i = 0; i < inLength; i++) {
    const s0 = MULAW_TO_LINEAR_TABLE[muLawBuffer[i]];
    const nextByte = i + 1 < inLength ? muLawBuffer[i + 1] : muLawBuffer[i];
    const s1 = MULAW_TO_LINEAR_TABLE[nextByte];
    const interpolated = Math.round((s0 + s1) / 2);
    outPcm.writeInt16LE(s0, outOffset);
    outOffset += 2;
    outPcm.writeInt16LE(interpolated, outOffset);
    outOffset += 2;
  }
  return outPcm;
}

export function encodePcmToMuLaw8k(pcmBuffer: Buffer, inputSampleRate: number = 16000): Buffer {
  const numSamples = Math.floor(pcmBuffer.length / 2);
  const ratio = inputSampleRate / 8000;
  const outLength = Math.floor(numSamples / ratio);
  const muLawBuffer = Buffer.alloc(outLength);
  for (let i = 0; i < outLength; i++) {
    const srcIndex = Math.floor(i * ratio) * 2;
    if (srcIndex + 1 < pcmBuffer.length) {
      const pcmSample = pcmBuffer.readInt16LE(srcIndex);
      muLawBuffer[i] = linearToMuLawSample(pcmSample);
    } else {
      muLawBuffer[i] = 0xff;
    }
  }
  return muLawBuffer;
}


let callRecorderClass: any = null;

export function setCallRecorderClass(cls: any) {
  callRecorderClass = cls;
}

export interface TelephonyCallSession {
  callSid: string;
  streamSid: string;
  direction: 'inbound' | 'outbound';
  fromPhone: string;
  toPhone: string;
  personaId: string;
  status: 'ringing' | 'in-progress' | 'completed' | 'failed';
  startedAt: number;
  endedAt: number | null;
  durationSec: number;
  turns: number;
  transcript: Array<{ speaker: 'caller' | 'agent'; text: string; ts: number }>;
  ws?: WebSocket;
  recorder?: { recordCaller: (buf: Buffer) => void; recordAgent: (buf: Buffer) => void; finalize?: () => void };
  disposition?: string;
}

export interface PhoneNumberConfig {
  phoneNumber: string;
  friendlyName: string;
  personaId: string;
  language: 'ja' | 'en';
  provider: 'twilio' | 'telnyx' | 'sip_trunk';
  status: 'active' | 'standby';
  configuredAt: number;
}

class TelephonyManager {
  private activeCalls = new Map<string, TelephonyCallSession>();
  private completedCalls: TelephonyCallSession[] = [];
  private phoneNumbers: PhoneNumberConfig[] = [
    {
      phoneNumber: '+1 (800) 555-0199',
      friendlyName: 'Collections & Receivables Inbound Line',
      personaId: 'mirai_collections_ja',
      language: 'ja',
      provider: 'twilio',
      status: 'active',
      configuredAt: Date.now() - 86400000 * 14,
    },
    {
      phoneNumber: '+1 (415) 555-2671',
      friendlyName: 'Customer Support & KYC Hotline',
      personaId: 'sarah_support_en',
      language: 'en',
      provider: 'twilio',
      status: 'active',
      configuredAt: Date.now() - 86400000 * 10,
    },
    {
      phoneNumber: '+81 3 5555 0142',
      friendlyName: 'Tokyo Outbound Advisory Line',
      personaId: 'mirai_collections_ja',
      language: 'ja',
      provider: 'sip_trunk',
      status: 'active',
      configuredAt: Date.now() - 86400000 * 5,
    },
  ];

  constructor() {
    // Seed initial demo calls for analytics and review
    this.completedCalls.push({
      callSid: 'CA_telephony_inbound_demo_001',
      streamSid: 'MZ_stream_001',
      direction: 'inbound',
      fromPhone: '+1 (555) 234-8901',
      toPhone: '+1 (800) 555-0199',
      personaId: 'mirai_collections_ja',
      status: 'completed',
      startedAt: Date.now() - 3600000 * 2,
      endedAt: Date.now() - 3600000 * 2 + 142000,
      durationSec: 142,
      turns: 8,
      transcript: [
        { speaker: 'agent', text: 'お電話ありがとうございます。カスタマーサポートです。', ts: Date.now() - 3600000 * 2 },
        { speaker: 'caller', text: '支払日の変更について相談したいのですが。', ts: Date.now() - 3600000 * 2 + 6000 },
        { speaker: 'agent', text: 'かしこまりました。本人確認のためお名前とお電話番号をお願いいたします。', ts: Date.now() - 3600000 * 2 + 12000 },
      ],
      disposition: 'promise_secured',
    });

    this.completedCalls.push({
      callSid: 'CA_telephony_outbound_demo_002',
      streamSid: 'MZ_stream_002',
      direction: 'outbound',
      fromPhone: '+1 (415) 555-2671',
      toPhone: '+1 (555) 890-4321',
      personaId: 'sarah_support_en',
      status: 'completed',
      startedAt: Date.now() - 3600000 * 4,
      endedAt: Date.now() - 3600000 * 4 + 95000,
      durationSec: 95,
      turns: 6,
      transcript: [
        { speaker: 'agent', text: 'Hello, this is Sarah from Voice AI accounts support.', ts: Date.now() - 3600000 * 4 },
        { speaker: 'caller', text: 'Yes, hi Sarah. I received your notification.', ts: Date.now() - 3600000 * 4 + 5000 },
        { speaker: 'agent', text: 'Great, I can help you confirm the payment arrangement today.', ts: Date.now() - 3600000 * 4 + 11000 },
      ],
      disposition: 'resolved',
    });
  }

  getPhoneNumbers(): PhoneNumberConfig[] {
    return this.phoneNumbers;
  }

  savePhoneNumber(config: PhoneNumberConfig): PhoneNumberConfig {
    const existing = this.phoneNumbers.findIndex((p) => p.phoneNumber === config.phoneNumber);
    if (existing >= 0) {
      this.phoneNumbers[existing] = { ...this.phoneNumbers[existing], ...config };
      return this.phoneNumbers[existing];
    }
    this.phoneNumbers.push(config);
    return config;
  }

  getActiveCalls(): TelephonyCallSession[] {
    return Array.from(this.activeCalls.values());
  }

  getAllCalls(): TelephonyCallSession[] {
    const active = Array.from(this.activeCalls.values());
    return [...active, ...this.completedCalls].sort((a, b) => b.startedAt - a.startedAt);
  }

  getCallBySid(callSid: string): TelephonyCallSession | undefined {
    return this.activeCalls.get(callSid) || this.completedCalls.find((c) => c.callSid === callSid);
  }

  /**
   * Dispatches an outbound telephone call via Twilio REST API / simulated bridge
   */
  dispatchOutboundCall(params: {
    toPhone: string;
    fromPhone?: string;
    personaId?: string;
  }): TelephonyCallSession {
    const callSid = `CA_${crypto.randomBytes(12).toString('hex')}`;
    const streamSid = `MZ_${crypto.randomBytes(12).toString('hex')}`;
    const persona = params.personaId || 'mirai_collections_ja';
    const from = params.fromPhone || this.phoneNumbers[0]?.phoneNumber || '+1 (800) 555-0199';

    const session: TelephonyCallSession = {
      callSid,
      streamSid,
      direction: 'outbound',
      fromPhone: from,
      toPhone: params.toPhone,
      personaId: persona,
      status: 'ringing',
      startedAt: Date.now(),
      endedAt: null,
      durationSec: 0,
      turns: 0,
      transcript: [],
      disposition: 'in-progress',
    };

    this.activeCalls.set(callSid, session);

    // Transition status to in-progress after short ring simulation
    setTimeout(() => {
      if (this.activeCalls.has(callSid)) {
        const c = this.activeCalls.get(callSid)!;
        if (c.status === 'ringing') {
          c.status = 'in-progress';
          c.turns = 1;
          c.transcript.push({
            speaker: 'agent',
            text: persona.includes('en')
              ? 'Hello! Thanks for answering. This is your Voice AI account advisor.'
              : 'お電話ありがとうございます。ボイスAIアシスタントでございます。',
            ts: Date.now(),
          });
        }
      }
    }, 1500);

    return session;
  }

  /**
   * Handles incoming Twilio Media Stream WebSocket connection
   */
  handleMediaStreamConnection(ws: WebSocket, recordingsDir: string) {
    let currentSession: TelephonyCallSession | null = null;
    let callSid = '';
    let streamSid = '';

    ws.on('message', (data: any) => {
      try {
        const msg = JSON.parse(data.toString());

        if (msg.event === 'start') {
          streamSid = msg.start?.streamSid || msg.streamSid || `MZ_${Date.now()}`;
          callSid = msg.start?.callSid || `CA_${Date.now()}`;
          const customParams = msg.start?.customParameters || {};
          const personaId = customParams.persona_id || 'mirai_collections_ja';
          const fromPhone = msg.start?.from || customParams.from || '+1 (555) 012-3456';
          const toPhone = msg.start?.to || customParams.to || '+1 (800) 555-0199';

          currentSession = {
            callSid,
            streamSid,
            direction: 'inbound',
            fromPhone,
            toPhone,
            personaId,
            status: 'in-progress',
            startedAt: Date.now(),
            endedAt: null,
            durationSec: 0,
            turns: 0,
            transcript: [],
            ws,
            recorder: callRecorderClass ? new callRecorderClass(callSid, recordingsDir) : undefined,
          };

          this.activeCalls.set(callSid, currentSession);
          console.log(`[Telephony] Inbound Media Stream started: ${callSid} (${fromPhone} -> ${toPhone})`);

          // Send initial greeting audio to phone caller
          this.sendGreetingToStream(currentSession);
        } else if (msg.event === 'media') {
          // Inbound caller audio frame (8kHz mu-law base64 encoded)
          if (currentSession && msg.media?.payload) {
            const muLawBuffer = Buffer.from(msg.media.payload, 'base64');
            const pcm16k = decodeMuLaw8kToPcm16k(muLawBuffer);
            // Record caller audio to caller channel
            currentSession.recorder?.recordCaller(pcm16k);
          }
        } else if (msg.event === 'stop') {
          this.terminateCall(callSid, 'completed');
        }
      } catch (err: any) {
        console.error('[Telephony] Media stream message parsing error:', err.message);
      }
    });

    ws.on('close', () => {
      if (callSid) {
        this.terminateCall(callSid, 'completed');
      }
    });

    ws.on('error', (err) => {
      console.error(`[Telephony] Stream error for ${callSid}:`, err.message);
      if (callSid) {
        this.terminateCall(callSid, 'failed');
      }
    });
  }

  /**
   * Sends audio chunk back to Twilio Telephone receiver
   */
  sendMediaAudio(callSid: string, pcmAudioBuffer: Buffer) {
    const session = this.activeCalls.get(callSid);
    if (!session || !session.ws || session.ws.readyState !== WebSocket.OPEN) return;

    // Record agent speech to agent channel
    session.recorder?.recordAgent(pcmAudioBuffer);

    // Encode to 8kHz mu-law and base64 for Twilio
    const muLawBuffer = encodePcmToMuLaw8k(pcmAudioBuffer, 16000);
    const payload = muLawBuffer.toString('base64');

    session.ws.send(
      JSON.stringify({
        event: 'media',
        streamSid: session.streamSid,
        media: { payload },
      })
    );
  }

  /**
   * Interrupts agent audio playback on caller telephone when barge-in is detected
   */
  clearStreamBuffer(callSid: string) {
    const session = this.activeCalls.get(callSid);
    if (!session || !session.ws || session.ws.readyState !== WebSocket.OPEN) return;

    session.ws.send(
      JSON.stringify({
        event: 'clear',
        streamSid: session.streamSid,
      })
    );
  }

  private sendGreetingToStream(session: TelephonyCallSession) {
    const greetingText = session.personaId.includes('en')
      ? 'Thank you for calling. How can I help you today?'
      : 'お電話ありがとうございます。ご用件をお伺いいたします。';

    session.turns += 1;
    session.transcript.push({
      speaker: 'agent',
      text: greetingText,
      ts: Date.now(),
    });

    // In a full production loop, this invokes ttsClient and streams the audio chunks:
    // Generate synthetic silence/tone buffer to establish audio sync
    const syntheticTone = Buffer.alloc(3200); // 100ms of 16kHz PCM
    this.sendMediaAudio(session.callSid, syntheticTone);
  }

  terminateCall(callSid: string, disposition: string = 'completed'): boolean {
    const session = this.activeCalls.get(callSid);
    if (!session) return false;

    session.status = 'completed';
    session.endedAt = Date.now();
    session.durationSec = Math.max(1, Math.round((session.endedAt - session.startedAt) / 1000));
    session.disposition = session.disposition === 'in-progress' ? disposition : session.disposition;

    try {
      session.recorder?.finalize?.();
    } catch {}

    if (session.ws && session.ws.readyState === WebSocket.OPEN) {
      session.ws.close();
    }

    this.activeCalls.delete(callSid);
    this.completedCalls.unshift(session);
    console.log(`[Telephony] Call terminated: ${callSid} (${session.durationSec}s, disposition: ${session.disposition})`);
    return true;
  }
}

export const telephonyManager = new TelephonyManager();
