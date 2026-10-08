import http from 'http';
import crypto from 'crypto';
import { WebSocketServer, WebSocket } from 'ws';
import dotenv from 'dotenv';
import { SessionManager, Session } from './Session';
import { sanitizeAgentConfig } from './agentConfig';
import { forwardAudioFrame } from './backpressure';
import { createSTTConnection, STTMessage } from './routes/sttClient';
import { MTClient } from './routes/mtClient';
import { AgentClient } from './routes/agentClient';
import { TTSClient } from './routes/ttsClient';
import { handleDataApi } from './routes/dataApi';
import { metrics } from './metrics';

dotenv.config();

const PORT = parseInt(process.env.GATEWAY_PORT || process.env.PORT || '8443', 10);
const HOST = process.env.GATEWAY_HOST || '0.0.0.0';
const DEFAULT_MODE = (process.env.GATEWAY_MODE || process.env.MODE || 'translate') as 'translate' | 'agent';
const STT_URL = process.env.STT_SERVICE_URL || 'ws://localhost:8001/stream';
const MT_URL = process.env.MT_SERVICE_URL || 'http://localhost:8002/translate';
const AGENT_URL = process.env.AGENT_SERVICE_URL || 'http://localhost:8003/turn';
const TTS_URL = process.env.TTS_SERVICE_URL || 'http://localhost:8004/synthesize';
const MAX_SESSIONS = parseInt(process.env.MAX_SESSIONS || '500', 10);

// [M2] Validate STT URL scheme at startup to catch misconfiguration early
if (!STT_URL.startsWith('ws://') && !STT_URL.startsWith('wss://')) {
  console.error(`[Gateway] FATAL: STT_SERVICE_URL must use ws:// or wss:// scheme. Got: ${STT_URL}`);
  process.exit(1);
}

const sessionManager = new SessionManager();
const mtClient = new MTClient(MT_URL);
const agentClient = new AgentClient(AGENT_URL);
const ttsClient = new TTSClient(TTS_URL);

/**
 * Word overlap between a fresh STT final and the agent's last utterance.
 * Used to catch the agent's own voice (speaker echo) being transcribed as
 * the caller — without this, the echo eats a turn and triggers a bogus reply.
 */
// Pure filler sounds and punctuation-only outputs from Whisper on silence/noise.
// Intentionally NOT including real single-word responses like "yes", "no", "bye",
// "sure", "ok", "hello" — those are valid short caller turns.
const LOW_QUALITY_FINALS = new Set([
  'uh', 'um', 'oh', 'ah', 'hmm', 'mm', '.', 'a', 'i',
]);

// Real short words that are valid caller responses and must never be blocked.
const VALID_SHORT_WORDS = new Set([
  'yes', 'no', 'bye', 'hi', 'ok', 'sure', 'yep', 'nah', 'nope',
  'hey', 'yup', 'fine', 'stop', 'wait', 'good', 'bad', 'help',
]);

function isLowQualityFinal(text: string): boolean {
  const t = (text || '').trim();
  if (!t) return true;
  if (t.length < 2) return true;
  const norm = t.toLowerCase().replace(/^[.\s,!?;:'"]+|[.\s,!?;:'"]+$/g, '');
  if (!norm) return true;
  // Always pass through real short-word responses (yes, no, bye, ok, etc.)
  if (VALID_SHORT_WORDS.has(norm)) return false;
  if (LOW_QUALITY_FINALS.has(norm)) return true;
  // Single word with no digit and <=2 chars (not a real word) is
  // almost always a VAD-blip hallucination — show it, never act on it.
  // Raised from <=3 to <=2 so "bye", "ok" etc. are not caught.
  if (!norm.includes(' ') && norm.length <= 2 && !/\d/.test(norm)) return true;
  return false;
}
function echoOverlap(finalText: string, agentText: string): { ratio: number; shared: number } {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9\u3040-\u30ff\u4e00-\u9faf\s]/g, ' ')
      .split(/\s+/)
      .filter(Boolean);
  const f = norm(finalText);
  if (f.length === 0) return { ratio: 0, shared: 0 };
  const a = new Set(norm(agentText));
  const shared = f.filter((t) => a.has(t)).length;
  let ratio = shared / f.length;
  // Punctuation-insensitive substring: "accounts management." must match
  // "…Accounts Management calling…" even with trailing period.
  const strip = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9\u3040-\u30ff\u4e00-\u9faf]/g, '');
  const strippedFinal = strip(finalText);
  const strippedAgent = strip(agentText);
  if (strippedFinal.length >= 8 && strippedAgent.includes(strippedFinal)) {
    return { ratio: Math.max(ratio, 0.9), shared: Math.max(shared, f.length) };
  }
  // Short-fragment echo: 2 shared words at >=50% is enough when the final
  // itself is short ("accounts management." = 2/2). Old shared>=3 gate let
  // these leak and eat turns.
  return { ratio, shared };
}

// HTTP Server for metrics, health, and reviewer data API
const server = http.createServer(async (req, res) => {
  // 1. Data API endpoints for reviewer UI (/api/*)
  if (req.url?.startsWith('/api/')) {
    if (await handleDataApi(req, res)) return;
  }

  // 2. Metrics endpoint
  if (req.url === '/metrics' && req.method === 'GET') {
    res.setHeader('Content-Type', metrics.register.contentType);
    res.end(await metrics.register.metrics());
    return;
  }

  // 3. Health check endpoint
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', activeSessions: sessionManager.getAll().length }));
    return;
  }

  res.writeHead(404);
  res.end();
});

// WebSocket Server for client sessions
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  const { pathname } = new URL(request.url || '', `http://${request.headers.host}`);
  if (pathname === '/session') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

wss.on('connection', (clientWs: WebSocket) => {
  // [C2] Enforce hard max session cap to prevent DoS / memory exhaustion
  if (sessionManager.getAll().length >= MAX_SESSIONS) {
    clientWs.send(JSON.stringify({ type: 'error', code: 'SERVER_FULL', message: 'Max concurrent sessions reached' }));
    clientWs.close(1013, 'Server full');
    return;
  }

  // [C1] Use cryptographically random session ID instead of Math.random()
  const sessionId = `s_${crypto.randomBytes(12).toString('hex')}`;
  const session = sessionManager.create(sessionId, clientWs, DEFAULT_MODE);
  metrics.activeSessions.inc();

  console.log(`[Gateway] Session connected: ${sessionId} (mode: ${session.mode})`);

  // Safe JSON sender
  const sendJson = (ws: WebSocket, obj: unknown) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(obj));
    }
  };

  // Connect downstream to STT Service (with auto-reconnect while the call is live)
  const MAX_STT_RETRIES = 5;
  let sttRetries = 0;
  let sttReconnectTimer: NodeJS.Timeout | null = null;
  const clearSttReconnectTimer = () => {
    if (sttReconnectTimer) {
      clearTimeout(sttReconnectTimer);
      sttReconnectTimer = null;
    }
  };

  const connectSTT = (isReconnect = false) => {
    session.sttWs = createSTTConnection(
      session,
      STT_URL,
      async (sttMsg: STTMessage) => {
        const now = Date.now();

        if (sttMsg.type === 'partial') {
          if (sttMsg.uttId !== undefined) {
            session.lastSttUttId = Math.max(session.lastSttUttId || 0, sttMsg.uttId);
          }
          // Record capture-to-partial latency if tCapture is present
          if (sttMsg.tCapture) {
            const latSec = (now - sttMsg.tCapture) / 1000;
            metrics.e2eLatency.observe({ boundary: 'capture_to_partial' }, latSec);
          }

          // Barge-in check: If caller starts speaking while agent is speaking audio, interrupt
          // Require at least 450ms of agent speech elapsed to avoid false cutoff from trailing echo.
          // Also require the partial to be fresh: with slow STT hosts, delayed
          // partials of pre-agent speech arrive mid-playback and must not cut it.
          if (session.mode === 'agent' && session.isAgentSpeaking) {
            const speakElapsed = now - (session.agentSpeakingStartedAt || 0);
            const partialFresh =
              !sttMsg.tCapture || sttMsg.tCapture >= (session.agentSpeakingStartedAt || 0) - 1000;
            if (partialFresh && speakElapsed > 450) {
              console.log(`[Gateway] Barge-in detected during utterance ${session.currentSpeakingUttId}`);
              session.currentTTSAbort?.abort();
              session.isAgentSpeaking = false;
              sendJson(clientWs, {
                type: 'interrupt',
                uttId: session.currentSpeakingUttId,
                tInterrupt: now,
                reason: 'caller_barge_in'
              });
            }
          }

          sendJson(clientWs, { ...sttMsg, tEmit: now });
        } else if (sttMsg.type === 'final') {
          const tFinal = now;
          if (sttMsg.tCapture) {
            const latSec = (tFinal - sttMsg.tCapture) / 1000;
            metrics.e2eLatency.observe({ boundary: 'capture_to_final' }, latSec);
          }
          if (sttMsg.uttId !== undefined) {
            session.lastSttUttId = Math.max(session.lastSttUttId || 0, sttMsg.uttId);
          }

          const currentUttId = sttMsg.uttId;
          const currentText = sttMsg.text || '';
          const isLowQuality = isLowQualityFinal(currentText);

          // Echo check (agent mode only): audio captured while our own voice
          // was playing that heavily overlaps it is speaker echo, not caller
          // speech. Display it, but never let it eat a turn or cut playback.
          // Must cover ACTIVE playback (isAgentSpeaking) — not just past
          // playback (lastAgentSpeechEndAt). The old check missed echoes
          // like "accounts management." captured mid-greeting because
          // lastAgentSpeechEndAt wasn't set yet.
          let isEcho = false;
          if (session.mode === 'agent' && session.lastAgentText && sttMsg.tCapture) {
            const nowMs = Date.now();
            const activePlayback =
              session.isAgentSpeaking &&
              sttMsg.tCapture >= (session.agentSpeakingStartedAt || 0) - 1500 &&
              sttMsg.tCapture <= nowMs + 500;
            const recentPlayback =
              !!session.lastAgentSpeechEndAt &&
              sttMsg.tCapture < session.lastAgentSpeechEndAt &&
              session.lastAgentSpeechEndAt - sttMsg.tCapture < 30000;
            if (activePlayback || recentPlayback) {
              const { ratio, shared } = echoOverlap(currentText, session.lastAgentText);
              isEcho = shared >= 2 && ratio >= 0.5;
            }
          }

          // Forward final transcript to client immediately with echo & quality tags
          sendJson(clientWs, {
            ...sttMsg,
            tFinal,
            ...(isEcho ? { echo: true } : {}),
            ...(isLowQuality ? { lowConfidence: true } : {}),
          });

          if (sttMsg.text && currentUttId !== undefined) {
            if (session.mode === 'agent' && !isEcho) {
              // Hallucinated blips ("you", ".", "be 90") must be displayed
              // but must never consume an agent turn or count as auth input.
              if (isLowQuality) {
                console.log(`[Gateway] Low-quality final ignored for turn logic: utt ${currentUttId} "${currentText}"`);
              } else {
              const res = await agentClient.turn({
                sessionId: session.id,
                uttId: currentUttId,
                text: currentText,
                tCaptureMs: sttMsg.tCapture,
                config: session.config,
                context: session.contextWindow.slice(-5),
              }).catch((agentErr) => {
                console.error(`[Gateway] Agent turn failed for ${currentUttId}:`, agentErr?.message || agentErr);
                return null;
              });

              const tAgentDone = Date.now();
              const agentLatSec = (tAgentDone - tFinal) / 1000;
              metrics.e2eLatency.observe({ boundary: 'final_to_agent' }, agentLatSec);

              if (res) {
                session.contextWindow.push(`Caller: ${currentText}`);
                session.contextWindow.push(`Agent: ${res.text}`);
                if (session.contextWindow.length > 10) {
                  session.contextWindow = session.contextWindow.slice(-10);
                }

                sendJson(clientWs, {
                  type: 'agent_text',
                  sessionId: session.id,
                  uttId: currentUttId,
                  text: res.text,
                  events: res.events,
                  metrics: res.metrics,
                  tEmit: tAgentDone,
                });
                session.lastAgentText = res.text;

                if (res.metrics?.llmMs) {
                  metrics.agentTurnLatency.observe({ stage: 'llm_fast' }, res.metrics.llmMs / 1000);
                }
                if (res.metrics?.tokensIn) {
                  metrics.agentTokens.inc({ type: 'prompt' }, res.metrics.tokensIn);
                }
                if (res.metrics?.tokensOut) {
                  metrics.agentTokens.inc({ type: 'completion' }, res.metrics.tokensOut);
                }
                if (res.events) {
                  for (const ev of res.events) {
                    if (ev.type === 'compliance_block') {
                      metrics.agentComplianceBlocks.inc({ rule: ev.payload?.rule || 'unknown' });
                    } else if (ev.type === 'escalate') {
                      metrics.agentEscalations.inc({ reason: ev.payload?.reason || 'unknown' });
                    }
                  }
                }

                // Stream agent audio back to client via TTS
                session.isAgentSpeaking = true;
                session.agentSpeakingStartedAt = Date.now();
                session.currentSpeakingUttId = currentUttId;
                session.currentTTSAbort = new AbortController();

                sendJson(clientWs, {
                  type: 'agent_speech_start',
                  uttId: currentUttId,
                  tStart: Date.now()
                });
                metrics.turnEndToAgentAudio.observe((Date.now() - tFinal) / 1000);

                ttsClient.streamSynthesize(
                  res.text,
                  (chunkSeq, chunkBuf) => {
                    if (session.isAgentSpeaking) {
                      sendJson(clientWs, {
                        type: 'agent_audio_chunk',
                        uttId: currentUttId,
                        seq: chunkSeq,
                        pcm16Base64: chunkBuf.toString('base64'),
                        tEmit: Date.now()
                      });
                    }
                  },
                  {
                    abortSignal: session.currentTTSAbort.signal,
                    language: (session.config?.language as 'ja' | 'en') || 'ja',
                    voice: (session.config?.tts as any)?.voice,
                  }
                ).then(() => {
                  if (session.isAgentSpeaking) {
                    sendJson(clientWs, {
                      type: 'agent_speech_end',
                      uttId: currentUttId,
                      tEnd: Date.now()
                    });
                    session.isAgentSpeaking = false;
                    session.lastAgentSpeechEndAt = Date.now();
                  }
                }).catch((ttsErr) => {
                  if (ttsErr.name !== 'AbortError') {
                    console.error(`[Gateway] TTS error for ${currentUttId}:`, ttsErr.message);
                  }
                  session.isAgentSpeaking = false;
                });
              } else {
                sendJson(clientWs, {
                  type: 'error',
                  code: 'AGENT_UNAVAILABLE',
                  uttId: currentUttId,
                });
              }
              } // end low-quality guard
            } else if (isEcho) {
              console.log(`[Gateway] Echo suppressed for utterance ${currentUttId} (matches own playback)`);
            } else {
              if (isLowQuality) {
                // Low quality input skipped for translation
              } else {
              // Asynchronously dispatch translation to stateless MT service
              const res = await mtClient.translate({
                uttId: currentUttId,
                text: currentText,
                srcLang: session.srcLang,
                tgtLang: session.tgtLang,
                context: session.contextWindow.slice(-3),
              });

              const tTranslated = Date.now();
              const mtLatSec = (tTranslated - tFinal) / 1000;
              metrics.e2eLatency.observe({ boundary: 'final_to_translated' }, mtLatSec);

              if (res && res.translation) {
                session.contextWindow.push(currentText);
                // Bound context window
                if (session.contextWindow.length > 5) {
                  session.contextWindow.shift();
                }

                sendJson(clientWs, {
                  type: 'translated',
                  uttId: currentUttId,
                  translation: res.translation,
                  ttftMs: res.ttft_ms,
                  decodeMs: res.decode_ms,
                  tTranslated,
                });
              } else {
                sendJson(clientWs, {
                  type: 'error',
                  code: 'MT_UNAVAILABLE',
                  uttId: currentUttId,
                });
              }
              }
            }
          }
        }
      },
      (err) => {
        console.error(`[Gateway] STT service error in session ${sessionId}:`, err.message);
        sendJson(clientWs, { type: 'error', code: 'STT_ERROR', message: err.message });
      },
      () => {
        console.log(`[Gateway] STT connection closed for session ${sessionId}`);
        // Without reconnect, the client keeps streaming into a dead socket:
        // frozen queue gauge, zero transcripts, and the call never recovers.
        const sessionAlive =
          session.isStarted &&
          clientWs.readyState === WebSocket.OPEN &&
          sessionManager.get(sessionId) !== undefined;
        if (!sessionAlive) return;
        if (sttRetries >= MAX_STT_RETRIES) {
          sendJson(clientWs, {
            type: 'error',
            code: 'STT_UNAVAILABLE',
            message: 'Speech recognition disconnected. Please restart the call.',
          });
          return;
        }
        sttRetries += 1;
        const delayMs = Math.min(1000 * 2 ** (sttRetries - 1), 8000);
        sendJson(clientWs, {
          type: 'status',
          status: 'stt_reconnecting',
          message: `Speech recognition reconnecting (attempt ${sttRetries}/${MAX_STT_RETRIES})…`,
          tEmit: Date.now(),
        });
        clearSttReconnectTimer();
        sttReconnectTimer = setTimeout(() => {
          sttReconnectTimer = null;
          if (
            session.isStarted &&
            clientWs.readyState === WebSocket.OPEN &&
            sessionManager.get(sessionId) !== undefined
          ) {
            connectSTT(true);
          }
        }, delayMs);
      }
    );
    session.sttWs.on('open', () => {
      if (isReconnect) {
        sendJson(clientWs, {
          type: 'status',
          status: 'stt_restored',
          message: 'Speech recognition reconnected.',
          tEmit: Date.now(),
        });
      }
      sttRetries = 0;
    });
  };

  clientWs.on('message', (data: Buffer | ArrayBuffer | Buffer[] | string, isBinary: boolean) => {
    session.lastActivityAt = Date.now();

    const buf = Buffer.isBuffer(data)
      ? data
      : data instanceof ArrayBuffer
      ? Buffer.from(data)
      : Array.isArray(data)
      ? Buffer.concat(data)
      : null;

    if (isBinary && buf) {
      // Protocol header check: Offset 0 = msgType (0x01 = audio)
      if (buf.length < 13) return;
      const msgType = buf.readUInt8(0);
      if (msgType === 0x01) {
        if (!session.isStarted) {
          // Client sent audio before start control message - drop safely
          return;
        }
        // Forward through backpressure policy
        forwardAudioFrame(session, buf);
      }
    } else {
      // Control JSON message
      try {
        const text = typeof data === 'string' ? data : data.toString('utf-8');
        const msg = JSON.parse(text);

        if (msg.type === 'start') {
          session.srcLang = msg.srcLang || 'ja';
          session.tgtLang = msg.tgtLang || 'en';
          session.sampleRate = msg.sampleRate || 16000;
          if (msg.mode) {
            session.mode = msg.mode;
          }
          // [H4] Validate and sanitize agent config before storing — prevents prompt injection via config channel
          if (msg.config && typeof msg.config === 'object') {
            session.config = sanitizeAgentConfig(msg.config) as Record<string, any>;
          }
          session.isStarted = true;
          connectSTT();
          console.log(`[Gateway] Session started: ${sessionId} (mode: ${session.mode}, srcLang: ${session.srcLang})`);
          sendJson(clientWs, { type: 'started', sessionId, mode: session.mode, config: session.config });

          // Agent speaks first: turn 1 is always the agent's introduction.
          // Previously the call opened in silence and waited for the caller,
          // so live calls felt dead until the user guessed what to say.
          if (session.mode === 'agent') {
            const cfgLang = session.config?.language;
            const ttsLang: 'ja' | 'en' =
              cfgLang === 'en' ? 'en' : cfgLang === 'ja' ? 'ja' : session.srcLang === 'en' ? 'en' : 'ja';
            const configured = typeof session.config?.greeting === 'string' ? session.config.greeting.trim() : '';
            const greeting =
              configured ||
              (ttsLang === 'en'
                ? 'Hello! Thank you for calling. I am your AI assistant. How may I help you today?'
                : 'お電話ありがとうございます。AIアシスタントでございます。どのようなご用件でしょうか。');

            const greetUttId = 0;
            session.contextWindow.push(`Agent: ${greeting}`);
            sendJson(clientWs, {
              type: 'agent_text',
              sessionId: session.id,
              uttId: greetUttId,
              text: greeting,
              events: [],
              tEmit: Date.now(),
            });
            session.lastAgentText = greeting;

            session.isAgentSpeaking = true;
            session.agentSpeakingStartedAt = Date.now();
            session.currentSpeakingUttId = greetUttId;
            session.currentTTSAbort = new AbortController();

            sendJson(clientWs, {
              type: 'agent_speech_start',
              uttId: greetUttId,
              tStart: Date.now(),
            });

            ttsClient
              .streamSynthesize(
                greeting,
                (chunkSeq, chunkBuf) => {
                  if (session.isAgentSpeaking) {
                    sendJson(clientWs, {
                      type: 'agent_audio_chunk',
                      uttId: greetUttId,
                      seq: chunkSeq,
                      pcm16Base64: chunkBuf.toString('base64'),
                      tEmit: Date.now(),
                    });
                  }
                },
                {
                  abortSignal: session.currentTTSAbort.signal,
                  language: ttsLang,
                  voice: (session.config?.tts as any)?.voice,
                }
              )
              .then(() => {
                if (session.isAgentSpeaking) {
                  sendJson(clientWs, {
                    type: 'agent_speech_end',
                    uttId: greetUttId,
                    tEnd: Date.now(),
                  });
                  session.isAgentSpeaking = false;
                  session.lastAgentSpeechEndAt = Date.now();
                }
              })
              .catch((ttsErr) => {
                if (ttsErr.name !== 'AbortError') {
                  console.error(`[Gateway] Greeting TTS error for ${sessionId}:`, ttsErr.message);
                }
                session.isAgentSpeaking = false;
              });
          }
        } else if (msg.type === 'stop') {
          session.isStarted = false;
          clearSttReconnectTimer();
          if (session.sttWs && session.sttWs.readyState === WebSocket.OPEN) {
            session.sttWs.send(JSON.stringify({ type: 'session_stop' }));
          }
          if (session.mode === 'agent') {
            agentClient.endSession(sessionId).catch(() => {});
          }
          sendJson(clientWs, { type: 'stopped' });
        }
      } catch (err) {
        console.error(`[Gateway] Invalid control frame for session ${sessionId}:`, err);
      }
    }
  });

  clientWs.on('close', () => {
    console.log(`[Gateway] Client disconnected: ${sessionId}`);
    clearSttReconnectTimer();
    metrics.activeSessions.dec();
    if (session.mode === 'agent') {
      agentClient.endSession(sessionId).catch(() => {});
    }
    sessionManager.remove(sessionId);
  });

  clientWs.on('error', (err) => {
    console.error(`[Gateway] Client error for session ${sessionId}:`, err.message);
  });
});

// Periodic HUD metrics broadcast
setInterval(() => {
  const sessions = sessionManager.getAll();
  for (const session of sessions) {
    if (session.clientWs.readyState === WebSocket.OPEN) {
      // Report 0 when the STT leg is down so the HUD never shows a frozen
      // stale backlog after a disconnect.
      const sttOpen = session.sttWs && session.sttWs.readyState === WebSocket.OPEN;
      session.clientWs.send(
        JSON.stringify({
          type: 'hud',
          queueDepth: sttOpen ? session.audioChannelDepth : 0,
          // No GPU exporter or RTF probe is wired up: report unknown explicitly
          // rather than a plausible-looking constant.
          gpuUtil: null,
          rtf: null,
        })
      );
    }
  }
}, 1000);

// [M1] Idle session reaper: close sessions that have been silent beyond the timeout
const SESSION_IDLE_TIMEOUT_MS = parseInt(process.env.SESSION_IDLE_TIMEOUT_MS || '1800000', 10); // 30 min
setInterval(() => {
  const now = Date.now();
  const idleSessions = sessionManager.getAll().filter(
    (s) => now - s.lastActivityAt > SESSION_IDLE_TIMEOUT_MS
  );
  for (const s of idleSessions) {
    console.log(`[Gateway] Reaping idle session ${s.id} (idle ${Math.round((now - s.lastActivityAt) / 1000)}s)`);
    if (s.sttWs && s.sttWs.readyState === WebSocket.OPEN) {
      s.sttWs.close();
    }
    if (s.clientWs.readyState === WebSocket.OPEN) {
      s.clientWs.send(JSON.stringify({ type: 'error', code: 'SESSION_IDLE_TIMEOUT' }));
      s.clientWs.close(1001, 'Idle timeout');
    }
    if (s.mode === 'agent') {
      agentClient.endSession(s.id).catch(() => {});
    }
    sessionManager.remove(s.id);
    metrics.activeSessions.dec();
  }
}, 60_000); // Check every minute


server.listen(PORT, HOST, () => {
  console.log(`[Gateway] Server running on http://${HOST}:${PORT}`);
  console.log(`[Gateway] Metrics available at http://${HOST}:${PORT}/metrics`);
});
