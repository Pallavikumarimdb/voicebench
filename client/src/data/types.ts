/**
 * Typed models for the Reviewer & Validation UI.
 * Mirrors agent audit trails, simulation runs, personas, and human labeling formats.
 */

export type CallSource = 'live' | 'sim';

export interface AuditRecordPayload {
  text?: string;
  turn?: number;
  attempted?: string;
  final?: string;
  phase?: string;
  latency_ms?: number;
  rule?: string;
  rule_violation?: string;
  tool?: string;
  args?: Record<string, any>;
  result?: Record<string, any>;
  [key: string]: any;
}

export interface AuditRecord {
  seq: number;
  session_id: string;
  ts: number;
  stage: 'user_utterance' | 'agent_utterance' | 'compliance_block' | 'tool_call' | 'state_change' | string;
  payload: AuditRecordPayload;
  prev_hash: string;
  hash: string;
}

export interface AuditVerifyResult {
  valid: boolean;
  error?: string;
  verifiedCount: number;
  brokenSeq?: number;
}

export interface HumanHandoffSummary {
  session_id: string;
  debtor_id?: string | null;
  debtor_name?: string | null;
  identity_verified: boolean;
  verification_attempts: number;
  disclosure_completed: boolean;
  debtor_stated_situation?: string | null;
  hardship_detected: boolean;
  dispute_detected: boolean;
  stop_contact_requested: boolean;
  third_party_detected: boolean;
  balance?: number | null;
  offers_made: Array<Record<string, any>>;
  promise_to_pay?: {
    amount?: number;
    date?: string;
    method?: string;
  } | null;
  escalation_reason?: string | null;
  recommended_next_action: string;
  audit_log_path?: string;
  total_turns: number;
}

export interface HardFailDetail {
  passed: boolean;
  attempted_violations: string[];
  final_violations: string[];
  num_attempted: number;
  num_final: number;
}

export interface JudgeDetail {
  scores: Record<string, number>;
  outcome: string;
  justification: string;
  mean_score: number;
}

export interface CallRun {
  session_id: string;
  variant: string;
  persona_id: string;
  seed: number;
  hard_fail: HardFailDetail;
  judge: JudgeDetail;
  promise_to_pay: boolean;
  total_turns: number;
  latencies_ms: number[];
}

export interface CallSummaryItem {
  id: string;
  source: CallSource;
  variant: string;
  persona: string;
  outcome: string;
  /** Null when the call was never evaluated (e.g. a raw live audit log). */
  hardFailPassed: boolean | null;
  hasComplianceBlock: boolean;
  hasEscalation: boolean;
  totalTurns: number;
  timestamp: number;
  promiseSecured: boolean;
}

export interface PersonaDefinition {
  id: string;
  name: string;
  debtor_id: string;
  difficulty: string;
  description: string;
  debt_details: {
    creditor: string;
    amount: number;
    original_due_date: string;
    days_overdue: number;
  };
  debtor_profile: {
    full_name: string;
    dob: string;
    phone: string;
    address: string;
  };
  hidden_situation: {
    reason: string;
    financial_state: string;
    temperament: string;
  };
  scripted_turns: string[];
  expected_good_outcomes: string[];
}

export interface CallAudioInfo {
  hasRecording: boolean;
  audioUrl: string;
  downloadUrl: string;
  waveformUrl: string;
  format: string;
}

export interface WaveformData {
  durationSec: number;
  sampleRate: number;
  channels: number;
  peaks: number[];
}

export interface CallDetail {
  id: string;
  source: CallSource;
  variant: string;
  personaId: string;
  auditLog: AuditRecord[];
  handoff?: HumanHandoffSummary | null;
  runData?: CallRun | null;
  persona?: PersonaDefinition | null;
  hashChain: AuditVerifyResult;
  audio?: CallAudioInfo | null;
}

export interface EvalVariantSummary {
  variant: string;
  totalCalls: number;
  hardFailFinalRate: number;
  attemptedViolations: number;
  /** Null when not derivable from result files — UI must render "—". */
  finalViolations: number | null;
  promiseRate: number;
  avgJudgeScore: number;
  latencyP50: number;
  latencyP95: number;
}

export interface HumanLabel {
  transcript_id: string;
  persona_id: string;
  human_listening_score: number;
  human_pacing_score: number;
  human_recovery_score: number;
  human_negotiation_score: number;
  human_confirmation_score: number;
  human_escalation_score: number;
  human_outcome_pass_fail: 'PASS' | 'FAIL';
  notes: string;
}

export interface ToolParam {
  name: string;
  type: string;
  description: string;
  required: boolean;
  enum?: string[];
}

export interface ToolItem {
  name: string;
  description: string;
  tool_type: 'builtin' | 'webhook';
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  timeout_ms?: number;
  parameters: ToolParam[];
  filler_phrase?: string;
  secret_key?: string;
}

export interface ToolExecutionResult {
  success: boolean;
  tool: string;
  data?: any;
  error?: string;
  latency_ms: number;
  status_code?: number;
}

export interface StudioPersonaItem {
  id: string;
  name: string;
  description: string;
  domain: 'collections' | 'screening' | 'kyc' | 'custom' | string;
  language: 'ja' | 'en';
  system_prompt: string;
  greeting: string;
  voice_settings: {
    provider: string;
    voice_id: string;
    speed: number;
    pitch: number;
    barge_in_sensitivity: string;
    pause_threshold_ms: number;
  };
  llm_settings: {
    provider: string;
    model: string;
    temperature: number;
    max_tokens: number;
  };
  knowledge_snippets: Array<{ title: string; text: string }>;
  assigned_tools: string[];
  created_at: number;
  updated_at: number;
}

export interface SimulationResult {
  success: boolean;
  persona_id: string;
  agent_response: string;
  triggered_tools: string[];
  latency_ms: number;
  voice_settings?: any;
  llm_model?: string;
  error?: string;
}

export interface AnalyticsOverview {
  totalCalls: number;
  completedCalls: number;
  escalatedCalls: number;
  failedCalls: number;
  avgHandleTimeSec: number;
  totalDurationMin: number;
  firstCallResolutionRate: number;
  promiseToPayRate: number;
  complianceGuardrailRate: number;
  avgJudgeScore: number;
  totalCostUsd: number;
  avgCostPerCallUsd: number;
  avgCostPerMinuteUsd: number;
  humanAgentEquivalentCostUsd: number;
  estimatedNetSavingsUsd: number;
  savingsPercentage: number;
  latencyP50Ms: number;
  latencyP95Ms: number;
  latencyP99Ms: number;
}

export interface AnalyticsTimeSeriesPoint {
  date: string;
  calls: number;
  completed: number;
  escalated: number;
  avgDurationSec: number;
  costUsd: number;
}

export interface AnalyticsDisposition {
  disposition: string;
  count: number;
  percentage: number;
}

export interface AnalyticsPersonaStat {
  persona: string;
  totalCalls: number;
  resolutionRate: number;
  avgTurns: number;
  avgDurationSec: number;
  avgScore: number;
  costUsd: number;
}

export interface AnalyticsLatencyWaterfall {
  sttP50: number;
  sttP95: number;
  llmP50: number;
  llmP95: number;
  ttsP50: number;
  ttsP95: number;
  networkP50: number;
  networkP95: number;
  e2eP50: number;
  e2eP95: number;
}

export interface AnalyticsCostLedger {
  sttCostUsd: number;
  llmCostUsd: number;
  ttsCostUsd: number;
  telephonyCostUsd: number;
  totalCostUsd: number;
  humanEquivalentCostUsd: number;
  savingsUsd: number;
  savingsPct: number;
}

export interface AnalyticsData {
  overview: AnalyticsOverview;
  timeSeries: AnalyticsTimeSeriesPoint[];
  dispositions: AnalyticsDisposition[];
  personas: AnalyticsPersonaStat[];
  waterfall: AnalyticsLatencyWaterfall;
  costLedger: AnalyticsCostLedger;
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
  disposition?: string;
}


