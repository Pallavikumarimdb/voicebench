import { WebSocket } from 'ws';
import { Session } from '../Session';

export interface STTMessage {
  type: 'partial' | 'final' | 'error';
  uttId?: number;
  seq?: number;
  text?: string;
  stableChars?: number;
  words?: Array<{ text: string; start: number; end: number }>;
  tCapture?: number;
  tEmit?: number;
  tFinal?: number;
  code?: string;
  message?: string;
}

export function createSTTConnection(
  session: Session,
  sttServiceUrl: string,
  onMessage: (msg: STTMessage) => void,
  onError: (err: Error) => void,
  onClose: () => void
): WebSocket {
  const ws = new WebSocket(sttServiceUrl);

  ws.on('open', () => {
    // Send session init handshake. uttIdStart continues numbering across
    // mid-call reconnects so transcripts don't merge unrelated turns.
    const initMsg = {
      type: 'session_start',
      sessionId: session.id,
      srcLang: session.srcLang,
      sampleRate: session.sampleRate,
      startUttId: (session.lastSttUttId || 0) + 1,
      sttModel: (session.config as any)?.stt?.model,
    };
    ws.send(JSON.stringify(initMsg));
  });

  ws.on('message', (raw: Buffer | string) => {
    try {
      const text = typeof raw === 'string' ? raw : raw.toString('utf-8');
      const data = JSON.parse(text) as STTMessage;
      onMessage(data);
    } catch (err) {
      console.error(`[STTClient] Failed to parse message for session ${session.id}:`, err);
    }
  });

  ws.on('error', (err) => {
    console.error(`[STTClient] WebSocket error for session ${session.id}:`, err.message);
    onError(err);
  });

  ws.on('close', () => {
    onClose();
  });

  return ws;
}
