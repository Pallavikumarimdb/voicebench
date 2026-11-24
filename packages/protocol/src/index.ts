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
  /** True when the text is too short/noisy to act on (shown, agent not called). */
  lowConfidence?: boolean;
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

// Plan 1 Section 6 P3-T2: Constrained Decoding Brain Turn Schema v1
export type BrainTurnIntent =
  // Generic & Shared
  | 'greet'
  | 'confirm_identity'
  | 'deny_identity'
  | 'provide_dob'
  | 'request_agent_handoff'
  | 'close_call'
  | 'clarification'
  // Collections
  | 'disclose_balance'
  | 'inquire_situation'
  | 'propose_payment_plan'
  | 'accept_terms'
  | 'request_installments'
  | 'claim_hardship'
  | 'claim_already_paid'
  | 'request_stop_contact'
  | 'third_party_notice'
  // Screening
  | 'describe_experience'
  | 'confirm_qualification'
  | 'provide_availability'
  | 'agree_schedule'
  // KYC
  | 'submit_document'
  | 'confirm_address'
  | 'provide_info'
  // Custom
  | 'inquire'
  | 'confirm'
  | 'escalate';

export type BrainTurnNextState =
  // Collections states
  | 'greet'
  | 'verify_identity'
  | 'disclose'
  | 'discover'
  | 'negotiate'
  | 'capture_promise'
  | 'close'
  | 'third_party'
  | 'stop_contact'
  | 'escalate_human'
  | 'dispute_or_paid'
  // Screening states
  | 'experience_inquiry'
  | 'qualification_check'
  | 'availability_check'
  | 'schedule_interview'
  // KYC states
  | 'document_verification'
  | 'address_confirmation'
  | 'risk_assessment'
  | 'kyc_approved'
  // Custom states
  | 'inquiry'
  | 'action'
  | 'resolve';

export interface BrainToolCall {
  name: string;
  arguments: Record<string, any>;
}

export interface BrainTurnV1 {
  intent: BrainTurnIntent;
  next_state: BrainTurnNextState;
  utterance: string;
  tool_calls?: BrainToolCall[];
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

export interface PlaybackStartMessage {
  type: 'playback_start';
  uttId?: number;
  tPlaybackStart: number;
}

// Audit Schema v2 and Chain Head Protocol Types (Plan 1 Section 5.3)
export interface AuditGuardEvent {
  rule_id: string;
  stage: 'pre' | 'post';
  action: 'allow' | 'rewrite' | 'block';
  detail?: string;
}

export interface RoutingDecision {
  tier: string;
  backend?: string;
  model?: string;
  rule_id?: string;
  reason_code?: string;
  policy_version?: string;
  cache?: 'hit' | 'miss';
  constraint_mode?: string;
  fallback_chain?: Array<{ from: string; to: string; reason: string }>;
  ttft_ms?: number;
  tokens_in?: number;
  tokens_out?: number;
  cached_tokens?: number;
  cancelled?: boolean;
}

export interface AuditTimingStages {
  vad_hangover: number;
  asr: number;
  pre_guard: number;
  llm_ttft: number;
  llm_total: number;
  post_guard: number;
  tts_first_audio: number;
  transport: number;
}

export interface AuditTimings {
  vad_end_to_first_audio_ms: number;
  stages: AuditTimingStages;
}

export interface AuditRecordV2 {
  schema_version: 2;
  call_id: string;
  turn_index: number;
  ts: string;
  caller_text: string;
  agent_attempted_text: string;
  agent_final_text: string;
  guard_events: AuditGuardEvent[];
  route: RoutingDecision | { tier: string };
  timings: AuditTimings;
  client_generated?: boolean;
  prev_hash: string;
  hash?: string;
}

export interface ChainHeadRecord {
  type: 'chain_head';
  call_id: string;
  head_hash: string;
  alg: 'ed25519' | 'hmac-sha256';
  key_id: string;
  signature: string;
}

export interface PolicyChangeRecord {
  ts: string;
  who: string;
  old_hash: string;
  new_hash: string;
  diff_summary: Record<string, any> | string;
  prev_hash: string;
  hash: string;
}

export type GatewayMessage =
  | PartialMessage
  | FinalMessage
  | TranslatedMessage
  | PlaybackStartMessage
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
