import { WebSocket } from 'ws';
import { WordTs, Utterance } from '@voice/protocol';

export interface Session {
  id: string;
  clientWs: WebSocket;
  sttWs?: WebSocket;
  srcLang: string;
  tgtLang: string;
  mode: 'translate' | 'agent';
  sampleRate: number;
  contextWindow: string[]; // last N committed translations' source sentences
  audioSeq: number;
  audioChannelDepth: number;
  createdAt: number;
  lastActivityAt: number;
  isStarted: boolean;
  isAgentSpeaking: boolean;
  agentSpeakingStartedAt?: number;
  currentSpeakingUttId?: number;
  currentTTSAbort?: AbortController;
  config?: Record<string, any>;
  /** Last agent utterance text + when its playback ended (echo suppression). */
  lastAgentText?: string;
  lastAgentSpeechEndAt?: number;
  /** Highest STT uttId seen (survives STT reconnects so numbering continues). */
  lastSttUttId?: number;
}

export class SessionManager {
  private sessions = new Map<string, Session>();

  create(id: string, clientWs: WebSocket, defaultMode: 'translate' | 'agent' = 'translate'): Session {
    const session: Session = {
      id,
      clientWs,
      srcLang: 'ja',
      tgtLang: 'en',
      mode: defaultMode,
      sampleRate: 16000,
      contextWindow: [],
      audioSeq: 0,
      audioChannelDepth: 0,
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
      isStarted: false,
      isAgentSpeaking: false,
    };
    this.sessions.set(id, session);
    return session;
  }

  get(id: string): Session | undefined {
    return this.sessions.get(id);
  }

  remove(id: string): void {
    const session = this.sessions.get(id);
    if (session) {
      if (session.sttWs && session.sttWs.readyState === WebSocket.OPEN) {
        try {
          session.sttWs.close();
        } catch {
          // ignore
        }
      }
      this.sessions.delete(id);
    }
  }

  getAll(): Session[] {
    return Array.from(this.sessions.values());
  }
}
