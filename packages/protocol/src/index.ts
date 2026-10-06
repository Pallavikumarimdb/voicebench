/**
 * Shared protocol interfaces and helpers for Client and Gateway.
 */

export interface WordTs {
  text: string;
  start: number;
  end: number;
  probability?: number;
}

export interface Utterance {
  uttId: number;
  text: string;
  words?: WordTs[];
  tCapture: number;
  tFinal?: number;
}

export interface PartialMessage {
  type: 'partial';
  uttId: number;
  seq: number;
  text: string;
  stableChars: number;
  tCapture: number;
  tEmit: number;
}

export interface FinalMessage {
  type: 'final';
  uttId: number;
  text: string;
  words: WordTs[];
  tCapture: number;
  tFinal: number;
  /** True when the gateway classified this as speaker echo (shown, not acted on). */
  echo?: boolean;
}

export interface TranslatedMessage {
  type: 'translated';
  uttId: number;
  translation: string;
  ttftMs?: number;
  decodeMs?: number;
  tTranslated: number;
}

export interface HUDMessage {
  type: 'hud';
  queueDepth: number;
  /** Null when the backend has no real measurement — clients must render "—", never a guess. */
  gpuUtil: number | null;
  /** Null when the backend has no real measurement — clients must render "—", never a guess. */
  rtf: number | null;
  agentTurnLatencyMs?: number;
  ttsFirstAudioMs?: number;
  e2eAgentLatencyMs?: number;
}

export interface ErrorMessage {
  type: 'error';
  code: string;
  uttId?: number;
  message?: string;
}

export interface AgentConfig {
  domain?: 'collections' | 'screening' | 'kyc' | 'custom' | string;
  language?: 'ja' | 'en';  // Voice agent language; defaults to 'ja' (Japanese)
  instructions?: string;
  greeting?: string;
  guardrails?: string[];
  context?: Record<string, any>;
  /** Conversation brain: scripted templates, local Ollama model, or paid API. */
  llm?: {
    provider?: 'template' | 'local' | 'openai';
    model?: string;
  };
  /** Speech-to-Text configuration. */
  stt?: {
    /** Whisper model size. Smaller = faster; larger = more accurate. */
    model?: 'tiny' | 'base' | 'small' | 'medium' | 'large-v2' | 'large-v3-turbo' | string;
  };
  /** Text-to-Speech configuration. */
  tts?: {
    /** Azure Neural voice ID, e.g. 'ja-JP-NanamiNeural' or 'en-US-AriaNeural'. */
    voice?: string;
  };
}

export interface StartControlMessage {
  type: 'start';
  srcLang: string;
  tgtLang: string;
  sampleRate: number;
  mode?: 'translate' | 'agent';
  config?: AgentConfig;
}

export interface StopControlMessage {
  type: 'stop';
}

// Brain Contract (M1)
export type BrainEventType =
  | 'state_change'
  | 'tool_call'
  | 'compliance_block'
  | 'escalate'
  | 'identity_verified'
  | 'promise_to_pay'
  | 'stop_contact'
  | 'end_call'
  | 'candidate_qualified'
  | 'kyc_verified'
  | 'rubric_scored';

export interface BrainEvent {
  type: BrainEventType;
  payload: Record<string, any>;
  ts: number;
}

export interface BrainMetrics {
  llmMs: number;
  ttftMs?: number;
  tokensIn: number;
  tokensOut: number;
  model: string;
}

export interface BrainRequest {
  sessionId: string;
  uttId: number;
  text: string;
  tCaptureMs?: number;
  config?: Record<string, any>;
  context?: string[];
}

export interface BrainResponse {
  text: string;
  events: BrainEvent[];
  metrics: BrainMetrics;
}

// Agent streaming and voice message types
export interface AgentTextMessage {
  type: 'agent_text';
  sessionId: string;
  uttId: number;
  text: string;
  events: BrainEvent[];
  metrics: BrainMetrics;
  tEmit: number;
}

export interface AgentAudioChunkMessage {
  type: 'agent_audio_chunk';
  uttId: number;
  seq: number;
  pcm16Base64: string;
  tEmit: number;
}

export interface AgentSpeechStartMessage {
  type: 'agent_speech_start';
  uttId: number;
  tStart: number;
}

export interface AgentSpeechEndMessage {
  type: 'agent_speech_end';
  uttId: number;
  tEnd: number;
}

export interface InterruptMessage {
  type: 'interrupt';
  uttId?: number;
  tInterrupt: number;
  reason?: string;
}

/** Pipeline status signal (e.g. downstream reconnects). Never carries transcript content. */
export interface StatusMessage {
  type: 'status';
  status: 'stt_reconnecting' | 'stt_restored' | 'stt_unavailable';
  message?: string;
  tEmit: number;
}

export type GatewayMessage =
  | PartialMessage
  | FinalMessage
  | TranslatedMessage
  | AgentTextMessage
  | AgentAudioChunkMessage
  | AgentSpeechStartMessage
  | AgentSpeechEndMessage
  | InterruptMessage
  | StatusMessage
  | HUDMessage
  | ErrorMessage;

/**
 * Packs 16-bit signed PCM audio into the binary protocol frame:
 * Offset 0: uint8 (0x01 = audio)
 * Offset 1..4: uint32LE (sequence number)
 * Offset 5..12: float64LE (tCapture timestamp in ms)
 * Offset 13..: int16LE[] (16kHz mono PCM samples)
 */
export function packAudioFrame(pcm16: Int16Array, seq: number, tCapture: number): ArrayBuffer {
  const buffer = new ArrayBuffer(13 + pcm16.byteLength);
  const view = new DataView(buffer);

  view.setUint8(0, 0x01);
  view.setUint32(1, seq, true);
  view.setFloat64(5, tCapture, true);

  // Copy Int16 PCM samples via Uint8 view to prevent "start offset of Int16Array should be a multiple of 2" RangeError
  const uint8Src = new Uint8Array(pcm16.buffer, pcm16.byteOffset, pcm16.byteLength);
  const uint8Dst = new Uint8Array(buffer, 13, pcm16.byteLength);
  uint8Dst.set(uint8Src);

  return buffer;
}

/**
 * Unpacks a binary audio frame.
 */
export function unpackAudioFrame(buffer: ArrayBuffer | Buffer): {
  msgType: number;
  seq: number;
  tCapture: number;
  pcm16: Int16Array;
} {
  const pcmOffset = 13;

  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(buffer)) {
    const msgType = buffer.readUInt8(0);
    const seq = buffer.readUInt32LE(1);
    const tCapture = buffer.readDoubleLE(5);
    const numSamples = Math.floor((buffer.length - pcmOffset) / 2);
    const pcm16 = new Int16Array(numSamples);
    const dst = new Uint8Array(pcm16.buffer);
    const src = new Uint8Array(buffer.buffer, buffer.byteOffset + pcmOffset, numSamples * 2);
    dst.set(src);
    return { msgType, seq, tCapture, pcm16 };
  } else {
    const arrBuf = buffer as ArrayBuffer;
    const view = new DataView(arrBuf);
    const msgType = view.getUint8(0);
    const seq = view.getUint32(1, true);
    const tCapture = view.getFloat64(5, true);
    const numSamples = Math.floor((arrBuf.byteLength - pcmOffset) / 2);
    const pcm16 = new Int16Array(numSamples);
    const dst = new Uint8Array(pcm16.buffer);
    const src = new Uint8Array(arrBuf, pcmOffset, numSamples * 2);
    dst.set(src);
    return { msgType, seq, tCapture, pcm16 };
  }
}
