import React, { useState, useEffect, useRef } from 'react';
import { SessionManager, SessionState } from '../session/SessionManager';
import { GatewayMessage, AgentConfig } from '@voice/protocol';
import { Captions, CaptionEntry } from './Captions';
import { LatencyHUD } from './LatencyHUD';
import { PageHeader, Badge } from './primitives.tsx';

export type DomainType = 'collections' | 'screening' | 'kyc' | 'custom';
export type AgentLanguage = 'ja' | 'en';

interface DomainPreset {
  id: DomainType;
  title: string;
  badge: string;
  actionText: string;
  targetLabel: string;
  contextDesc: string;
  greeting: string;
  instructions: string;
  guardrails: string[];
}

const DOMAIN_PRESETS: Record<AgentLanguage, Record<DomainType, DomainPreset>> = {
  ja: {
    collections: {
      id: 'collections', title: 'Collections', badge: 'Collections', actionText: 'Start collections call',
      targetLabel: '山田 太郎 (Taro Yamada)', contextDesc: 'Debt: ¥48,000 · Creditor: みらいファイナンス',
      greeting: 'もしもし、山田太郎様のお電話でお間違いないでしょうか？私、みらい債権回収センターのAIオペレーターでございます。',
      instructions: 'Maintain polite Japanese Keigo. Verify identity with Date of Birth before disclosing amount.',
      guardrails: ['DOB verification', 'Calling hours 08:00–21:00 JST', 'Third-party disclosure ban', 'Civility filter']
    },
    screening: {
      id: 'screening', title: 'Screening', badge: 'Screening', actionText: 'Start screening call',
      targetLabel: '佐藤 健一 (Kenichi Sato)', contextDesc: 'Role: Senior Full-Stack Engineer · Lead',
      greeting: '佐藤様、本日は面談のお時間をいただきありがとうございます。',
      instructions: 'Conduct a professional 5-minute first-round screening interview.',
      guardrails: ['Anti-discrimination guard', 'Salary range check', 'NDA & privacy', 'Civility filter']
    },
    kyc: {
      id: 'kyc', title: 'KYC & support', badge: 'KYC', actionText: 'Start KYC call',
      targetLabel: '鈴木 一郎 (Ichiro Suzuki)', contextDesc: 'Account: ACC-88219 · Tier 2',
      greeting: 'お電話ありがとうございます。カスタマーサポートAIでございます。',
      instructions: 'Authenticate by phone number and 4-digit PIN before assisting.',
      guardrails: ['2-factor PIN auth', 'PII masking', 'Fraud auto-flag', 'Civility filter']
    },
    custom: {
      id: 'custom', title: 'Custom', badge: 'Custom', actionText: 'Start custom call',
      targetLabel: 'Target contact', contextDesc: 'Custom scenario',
      greeting: 'お電話ありがとうございます。AIアシスタントでございます。',
      instructions: 'Act as a professional enterprise voice agent.',
      guardrails: ['Regulatory guard', 'PII protection', 'Civility filter']
    }
  },
  en: {
    collections: {
      id: 'collections', title: 'Collections', badge: 'Collections', actionText: 'Start collections call',
      targetLabel: 'Alex Johnson', contextDesc: 'Balance: $350.00 · Creditor: Apex Capital',
      greeting: 'Hello, this is Accounts Management calling for Alex Johnson. Am I speaking with Alex?',
      instructions: 'Maintain professional tone. Verify identity before disclosing balance.',
      guardrails: ['FDCPA compliance', 'Calling hours 08:00–21:00 local', 'Third-party disclosure ban', 'Civility filter']
    },
    screening: {
      id: 'screening', title: 'Screening', badge: 'Screening', actionText: 'Start screening call',
      targetLabel: 'Alex Johnson', contextDesc: 'Role: Senior Software Engineer · Lead',
      greeting: 'Hello Alex, thank you for making time to speak today.',
      instructions: 'Conduct a warm 5-minute first-round interview.',
      guardrails: ['EEO guard', 'Compensation fairness', 'NDA & privacy', 'Civility filter']
    },
    kyc: {
      id: 'kyc', title: 'KYC & support', badge: 'KYC', actionText: 'Start KYC call',
      targetLabel: 'John Smith', contextDesc: 'Account: ACC-88219 · Level 2',
      greeting: 'Thank you for calling Customer Support.',
      instructions: 'Authenticate by phone number and 4-digit PIN before assisting.',
      guardrails: ['2-factor PIN auth', 'PII masking', 'Fraud detection', 'Civility filter']
    },
    custom: {
      id: 'custom', title: 'Custom', badge: 'Custom', actionText: 'Start custom call',
      targetLabel: 'Target contact', contextDesc: 'Custom workflow',
      greeting: 'Hello! Thank you for calling.',
      instructions: 'Act as a professional enterprise voice agent.',
      guardrails: ['Enterprise compliance', 'PII protection', 'Civility filter']
    }
  }
};

interface LiveCallPanelProps {
  onInspectCall: (sessionId: string) => void;
}

export const LiveCallPanel: React.FC<LiveCallPanelProps> = ({ onInspectCall }) => {
  const [state, setState] = useState<SessionState>('idle');
  const [entries, setEntries] = useState<CaptionEntry[]>([]);
  const [hudData, setHudData] = useState<{ queueDepth: number; gpuUtil: number | null; rtf: number | null }>({ queueDepth: 0, gpuUtil: null, rtf: null });
  const [asrCommitMs, setAsrCommitMs] = useState<number | undefined>();
  const [agentTurnLatencyMs, setAgentTurnLatencyMs] = useState<number | undefined>();
  const [ttsFirstAudioMs, setTtsFirstAudioMs] = useState<number | undefined>();
  const [totalRoundTripMs, setTotalRoundTripMs] = useState<number | undefined>();
  const [isAgentSpeaking, setIsAgentSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [agentLanguage, setAgentLanguage] = useState<AgentLanguage>('ja');
  const [activeDomain, setActiveDomain] = useState<DomainType>('collections');
  const [showSettings, setShowSettings] = useState(false);

  // ─── Brain / LLM ────────────────────────────────────────────────────────────
  type BrainProvider = 'template' | 'local' | 'openai';
  const BRAIN_DEFAULT_MODEL: Record<BrainProvider, string> = { template: '', local: 'qwen3:1.7b', openai: 'gpt-4o-mini' };
  const [brainProvider, setBrainProvider] = useState<BrainProvider>(() => {
    const saved = localStorage.getItem('voicebench.brain.provider');
    return saved === 'local' || saved === 'openai' ? saved : 'template';
  });
  const [brainModel, setBrainModel] = useState(() => localStorage.getItem('voicebench.brain.model') || 'qwen3:1.7b');
  const [brainModelUsed, setBrainModelUsed] = useState<string | null>(null);

  // ─── STT ────────────────────────────────────────────────────────────────────
  const STT_MODELS = [
    { id: 'base',            label: 'base',              hint: 'Fast · CPU-friendly' },
    { id: 'small',           label: 'small',             hint: 'Balanced speed & accuracy' },
    { id: 'medium',          label: 'medium',            hint: 'Higher accuracy' },
    { id: 'large-v2',        label: 'large-v2',          hint: 'Best quality · needs GPU' },
    { id: 'large-v3-turbo',  label: 'large-v3-turbo',   hint: 'Best quality + speed · needs GPU' },
  ];
  const [sttModel, setSttModel] = useState(() => localStorage.getItem('voicebench.stt.model') || 'base');

  // ─── TTS ─────────────────────────────────────────────────────────────────────
  const TTS_VOICES = [
    { id: 'ja-JP-NanamiNeural',   label: 'Nanami (JA)',    lang: 'ja', hint: 'Japanese female · Natural' },
    { id: 'ja-JP-KeitaNeural',    label: 'Keita (JA)',     lang: 'ja', hint: 'Japanese male' },
    { id: 'en-US-AriaNeural',     label: 'Aria (EN)',      lang: 'en', hint: 'English female · Conversational' },
    { id: 'en-US-GuyNeural',      label: 'Guy (EN)',       lang: 'en', hint: 'English male' },
    { id: 'en-GB-SoniaNeural',    label: 'Sonia (EN-GB)', lang: 'en', hint: 'British female' },
  ];
  const defaultTtsVoice = (lang: AgentLanguage) => lang === 'en' ? 'en-US-AriaNeural' : 'ja-JP-NanamiNeural';
  const [ttsVoice, setTtsVoice] = useState(() => localStorage.getItem('voicebench.tts.voice') || 'ja-JP-NanamiNeural');

  // ─── Service health probes ───────────────────────────────────────────────────
  // null = unknown, true = up, false = down
  const [ollamaOk,  setOllamaOk]  = useState<boolean | null>(null);
  const [openaiOk,  setOpenaiOk]  = useState<boolean | null>(null);
  const [ttsOk,     setTtsOk]     = useState<boolean | null>(null);
  const [sttOk,     setSttOk]     = useState<boolean | null>(null);
  const [agentOk,   setAgentOk]   = useState<boolean | null>(null);

  const [customGreeting, setCustomGreeting] = useState(DOMAIN_PRESETS.ja.collections.greeting);
  const [customInstructions, setCustomInstructions] = useState(DOMAIN_PRESETS.ja.collections.instructions);
  const [targetContext, setTargetContext] = useState(DOMAIN_PRESETS.ja.collections.contextDesc);
  const [targetSubject, setTargetSubject] = useState(DOMAIN_PRESETS.ja.collections.targetLabel);
  const [activeGuardrails, setActiveGuardrails] = useState<string[]>(DOMAIN_PRESETS.ja.collections.guardrails);
  const [callSeconds, setCallSeconds] = useState(0);

  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  const [callPhase, setCallPhase] = useState('greet');
  const [identityVerified, setIdentityVerified] = useState(false);
  const [stopContact, setStopContact] = useState(false);
  const [promiseCaptured, setPromiseCaptured] = useState<string | null>(null);
  const [screeningQualified, setScreeningQualified] = useState(false);
  const [screeningStage, setScreeningStage] = useState('intro');
  const [kycResolved, setKycResolved] = useState(false);

  const [eventsFeed, setEventsFeed] = useState<Array<{ type: string; rule?: string; text?: string; time: string }>>([]);
  const [lastCompletedSessionId, setLastCompletedSessionId] = useState<string | null>(null);

  const sessionManagerRef = useRef<SessionManager | null>(null);
  const currentSessionIdRef = useRef<string | null>(null);
  const captureTimestampsRef = useRef<Map<number, number>>(new Map());
  const asrCommitMsRef = useRef<number | undefined>(undefined);
  const agentTurnLatencyMsRef = useRef<number | undefined>(undefined);

  // Helper: safe fetch with timeout, returns ok bool
  const probeUrl = (url: string, timeoutMs = 2500): Promise<boolean> => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    return fetch(url, { signal: ctrl.signal })
      .then((r) => r.ok)
      .catch(() => false)
      .finally(() => clearTimeout(timer));
  };

  // Probe all services once on mount, then every 30s
  useEffect(() => {
    let cancelled = false;
    const runProbes = async () => {
      const [ollama, tts, stt, agent] = await Promise.all([
        probeUrl('http://localhost:11434/api/tags'),
        probeUrl('http://localhost:8004/health'),
        probeUrl('http://localhost:8001/health'),
        probeUrl('http://localhost:8003/healthz'),
      ]);
      if (cancelled) return;
      setOllamaOk(ollama);
      setTtsOk(tts);
      setSttOk(stt);
      setAgentOk(agent);
      // OpenAI status comes from agent healthz
      if (agent) {
        fetch('http://localhost:8003/healthz')
          .then((r) => r.json())
          .then((j) => { if (!cancelled) setOpenaiOk(j?.llm?.openai === true); })
          .catch(() => { if (!cancelled) setOpenaiOk(false); });
      } else {
        setOpenaiOk(false);
      }
    };
    runProbes();
    const interval = setInterval(runProbes, 30_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  const selectBrain = (p: BrainProvider) => {
    setBrainProvider(p);
    localStorage.setItem('voicebench.brain.provider', p);
    if (p !== 'template' && !brainModel.trim()) {
      setBrainModel(BRAIN_DEFAULT_MODEL[p]);
      localStorage.setItem('voicebench.brain.model', BRAIN_DEFAULT_MODEL[p]);
    }
  };

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleSelectDomain = (domain: DomainType) => {
    setActiveDomain(domain);
    const preset = DOMAIN_PRESETS[agentLanguage][domain];
    setCustomGreeting(preset.greeting);
    setCustomInstructions(preset.instructions);
    setTargetContext(preset.contextDesc);
    setTargetSubject(preset.targetLabel);
    setActiveGuardrails(preset.guardrails);
  };

  const handleSelectLanguage = (lang: AgentLanguage) => {
    setAgentLanguage(lang);
    const preset = DOMAIN_PRESETS[lang][activeDomain];
    setCustomGreeting(preset.greeting);
    setCustomInstructions(preset.instructions);
    setTargetContext(preset.contextDesc);
    setTargetSubject(preset.targetLabel);
    setActiveGuardrails(preset.guardrails);
    // Sync TTS voice to language default only if still on a language-default voice
    const currentVoiceLang = TTS_VOICES.find((v) => v.id === ttsVoice)?.lang;
    if (!currentVoiceLang || currentVoiceLang !== lang) {
      const dv = defaultTtsVoice(lang);
      setTtsVoice(dv);
      localStorage.setItem('voicebench.tts.voice', dv);
    }
  };

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    if (state === 'streaming') {
      setCallSeconds(0);
      interval = setInterval(() => setCallSeconds((s) => s + 1), 1000);
    }
    return () => { if (interval) clearInterval(interval); };
  }, [state]);

  useEffect(() => {
    if (chatScrollRef.current) chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
  }, [entries]);

  useEffect(() => {
    const gatewayProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const gatewayHost = window.location.hostname || 'localhost';
    const gatewayUrl = `${gatewayProtocol}//${gatewayHost}:8443/session`;

    sessionManagerRef.current = new SessionManager(gatewayUrl, {
      onStateChange: (newState) => {
        setState(newState);
        if (newState === 'idle') {
          setIsAgentSpeaking(false);
          if (currentSessionIdRef.current) setLastCompletedSessionId(currentSessionIdRef.current);
        }
      },
      onError: (err) => setError(err),
      onMessage: (msg: GatewayMessage) => {
        if (msg.type === 'status') {
          setNotice(msg.status === 'stt_restored' ? null : (msg.message || 'Speech recognition reconnecting…'));
          return;
        }
        if (msg.type === 'error') {
          setError(msg.message || msg.code || 'Voice pipeline error');
          sessionManagerRef.current?.stop();
          setIsAgentSpeaking(false);
          return;
        }
        if (msg.type === 'hud') {
          setHudData({ queueDepth: msg.queueDepth, gpuUtil: msg.gpuUtil, rtf: msg.rtf });
        } else if (msg.type === 'partial') {
          setEntries((prev) => {
            const index = prev.findIndex((e) => e.uttId === msg.uttId);
            if (index >= 0) { const u = [...prev]; u[index] = { ...u[index], partialText: msg.text }; return u; }
            return [...prev, { uttId: msg.uttId, partialText: msg.text }];
          });
        } else if (msg.type === 'final') {
          if (msg.tCapture && msg.tFinal) {
            const commitMs = msg.tFinal - msg.tCapture;
            setAsrCommitMs(commitMs);
            asrCommitMsRef.current = commitMs;
            captureTimestampsRef.current.set(msg.uttId, msg.tCapture);
          }
          setEntries((prev) => {
            const index = prev.findIndex((e) => e.uttId === msg.uttId);
            if (index >= 0) { const u = [...prev]; u[index] = { ...u[index], finalText: msg.text, partialText: undefined }; return u; }
            return [...prev, { uttId: msg.uttId, finalText: msg.text }];
          });
        } else if (msg.type === 'agent_text') {
          currentSessionIdRef.current = msg.sessionId;
          if (msg.metrics?.llmMs) {
            setAgentTurnLatencyMs(msg.metrics.llmMs);
            agentTurnLatencyMsRef.current = msg.metrics.llmMs;
          }
          if (msg.metrics?.model) setBrainModelUsed(msg.metrics.model);
          if (msg.events) {
            for (const ev of msg.events) {
              const timeStr = new Date().toLocaleTimeString();
              if (ev.type === 'identity_verified') { setIdentityVerified(true); setCallPhase('disclose'); setEventsFeed((p) => [{ type: 'identity_verified', text: 'Identity verified', time: timeStr }, ...p]); }
              else if (ev.type === 'promise_to_pay') {
                const amt = ev.payload?.amount ? `¥${ev.payload.amount.toLocaleString()}` : '';
                const date = ev.payload?.date || '';
                setPromiseCaptured(`${amt} on ${date}`.trim());
                setCallPhase('close');
                setEventsFeed((p) => [{ type: 'promise_to_pay', text: `Promise: ${amt} on ${date}`, time: timeStr }, ...p]);
              }
              else if (ev.type === 'compliance_block') setEventsFeed((p) => [{ type: 'compliance_block', rule: ev.payload?.rule || 'guard', text: ev.payload?.text || 'Guard intercepted disclosure', time: timeStr }, ...p]);
              else if (ev.type === 'escalate') setEventsFeed((p) => [{ type: 'escalate', text: `Escalated: ${ev.payload?.reason || ''}`, time: timeStr }, ...p]);
              else if (ev.type === 'stop_contact') { setStopContact(true); setEventsFeed((p) => [{ type: 'stop_contact', text: 'Stop-contact requested', time: timeStr }, ...p]); }
              else if (ev.type === 'candidate_qualified') { setScreeningQualified(true); setScreeningStage('qualified'); setEventsFeed((p) => [{ type: 'candidate_qualified', text: 'Candidate qualified', time: timeStr }, ...p]); }
              else if (ev.type === 'state_change' && ev.payload?.stage) setScreeningStage(ev.payload.stage);
            }
          }
          setEntries((prev) => {
            const index = prev.findIndex((e) => e.uttId === msg.uttId);
            if (index >= 0) { const u = [...prev]; u[index] = { ...u[index], agentText: msg.text }; return u; }
            return [...prev, { uttId: msg.uttId, agentText: msg.text }];
          });
        } else if (msg.type === 'agent_speech_start') {
          setIsAgentSpeaking(true);
          const tCapture = captureTimestampsRef.current.get(msg.uttId);
          if (tCapture) {
            const totalMs = Math.round(Date.now() - tCapture);
            setTotalRoundTripMs(totalMs);
            const asrMs = asrCommitMsRef.current;
            const llmMs = agentTurnLatencyMsRef.current;
            if (asrMs && llmMs) setTtsFirstAudioMs(Math.max(0, totalMs - asrMs - llmMs));
          }
        } else if (msg.type === 'agent_speech_end') {
          setIsAgentSpeaking(false);
        } else if (msg.type === 'interrupt') {
          setIsAgentSpeaking(false);
          const timeStr = new Date().toLocaleTimeString();
          setEventsFeed((p) => [{ type: 'interrupt', text: 'Barge-in — playback cut off', time: timeStr }, ...p]);
          setEntries((prev) => {
            if (prev.length === 0) return prev;
            const u = [...prev];
            const idx = msg.uttId !== undefined ? prev.findIndex((e) => e.uttId === msg.uttId) : prev.length - 1;
            const target = idx >= 0 ? idx : prev.length - 1;
            u[target] = { ...u[target], interrupted: true };
            return u;
          });
        }
      },
    });
    return () => { sessionManagerRef.current?.stop(); };
    // Mount-once: SessionManager owns the mic + socket for the component's
    // lifetime. Never add message-derived state to these deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleToggle = () => {
    if (state === 'idle') {
      setError(null);
      setNotice(null);
      setBrainModelUsed(null);
      setLastCompletedSessionId(null);
      setIdentityVerified(false);
      setStopContact(false);
      setPromiseCaptured(null);
      setScreeningQualified(false);
      setScreeningStage('intro');
      setKycResolved(false);
      setCallPhase('greet');
      setEventsFeed([]);
      const agentConfig: AgentConfig = {
        domain: activeDomain, language: agentLanguage,
        instructions: customInstructions, greeting: customGreeting, guardrails: activeGuardrails,
        llm: { provider: brainProvider, model: brainModel.trim() || BRAIN_DEFAULT_MODEL[brainProvider] },
        stt: { model: sttModel },
        tts: { voice: ttsVoice },
        context: { targetSubject, contextDesc: targetContext, candidateName: targetSubject, customerName: targetSubject, debtorName: targetSubject }
      };
      sessionManagerRef.current?.start(agentLanguage, agentLanguage, 'agent', agentConfig);
    } else {
      sessionManagerRef.current?.stop();
      setIsAgentSpeaking(false);
    }
  };

  const currentPreset = DOMAIN_PRESETS[agentLanguage][activeDomain];
  const statusTone = state === 'streaming' ? 'success' : state === 'connecting' ? 'warning' : 'neutral';
  // Effective brain actually used (from turn metrics); falls back to selection pre-call.
  const brainLabel = brainModelUsed
    ? (brainModelUsed.startsWith('template') ? 'Template' : brainModelUsed.replace(/^(local|openai):/, ''))
    : brainProvider === 'template' ? 'Template' : (brainModel.trim() || BRAIN_DEFAULT_MODEL[brainProvider]);

  const steps: { title: string; state: 'done' | 'active' | 'pending' }[] =
    activeDomain === 'collections'
      ? [
        { title: 'Greeting & identity', state: callPhase !== 'greet' ? 'done' : 'active' },
        { title: 'DOB verification', state: identityVerified ? 'done' : callPhase === 'greet' ? 'pending' : 'active' },
        { title: 'Disclosure & hardship', state: callPhase === 'close' ? 'done' : callPhase === 'disclose' ? 'active' : 'pending' },
        { title: 'Promise / escalation', state: promiseCaptured ? 'done' : callPhase === 'close' ? 'active' : 'pending' },
      ]
      : activeDomain === 'screening'
        ? [
          { title: 'Intro', state: screeningStage !== 'intro' ? 'done' : 'active' },
          { title: 'Experience', state: screeningStage === 'qualified' || screeningStage === 'expectations' ? 'done' : screeningStage === 'experience' ? 'active' : 'pending' },
          { title: 'Expectations', state: screeningStage === 'qualified' ? 'done' : screeningStage === 'expectations' ? 'active' : 'pending' },
          { title: 'Verdict', state: screeningQualified ? 'done' : 'pending' },
        ]
        : [
          { title: 'Greeting', state: 'done' },
          { title: 'Verification', state: identityVerified ? 'done' : 'active' },
          { title: 'Inquiry', state: identityVerified ? 'active' : 'pending' },
          { title: 'Wrap-up', state: kycResolved ? 'done' : 'pending' },
        ];

  return (
    <div className="page" style={{ maxWidth: 1240 }}>
      <PageHeader
        eyebrow="Build · Live call"
        title={currentPreset.title}
        desc={`${targetSubject} — ${targetContext}`}
        right={
          <>
            <Badge tone={statusTone} dot>
              {state === 'streaming' ? `Live · ${formatDuration(callSeconds)}` : state === 'connecting' ? 'Connecting' : 'Standby'}
            </Badge>
            <Badge tone="neutral" dot={state === 'streaming'} title="Conversation brain actually in effect">
              Brain: {brainLabel}
            </Badge>
            {lastCompletedSessionId && (
              <button className="btn btn-sm" onClick={() => onInspectCall(lastCompletedSessionId)}>Inspect last call</button>
            )}
          </>
        }
      />

      <div className="card card-pad" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {(Object.keys(DOMAIN_PRESETS[agentLanguage]) as DomainType[]).map((d) => (
            <button
              key={d}
              onClick={() => handleSelectDomain(d)}
              disabled={state !== 'idle'}
              className={activeDomain === d ? '' : 'btn btn-sm'}
              style={activeDomain === d
                ? { padding: '5px 12px', borderRadius: 8, border: '1px solid #101828', background: '#101828', color: '#fff', fontSize: 12.5, fontWeight: 650, cursor: state === 'idle' ? 'pointer' : 'not-allowed' }
                : undefined}
            >
              {DOMAIN_PRESETS[agentLanguage][d].title}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6, marginLeft: 'auto', alignItems: 'center' }}>
          <div style={{ display: 'inline-flex', border: '1px solid var(--border-strong)', borderRadius: 8, padding: 2 }}>
            {(['ja', 'en'] as AgentLanguage[]).map((l) => (
              <button
                key={l}
                onClick={() => handleSelectLanguage(l)}
                disabled={state !== 'idle'}
                style={{
                  padding: '4px 10px', borderRadius: 6, border: 'none', fontSize: 12.5, fontWeight: 650,
                  background: agentLanguage === l ? '#101828' : 'transparent',
                  color: agentLanguage === l ? '#fff' : 'var(--text-secondary)',
                  cursor: state === 'idle' ? 'pointer' : 'not-allowed',
                }}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>
          <button className="btn btn-sm" onClick={() => setShowSettings((s) => !s)}>
            {showSettings ? 'Hide settings' : 'Agent settings'}
          </button>
          <button
            className={state === 'streaming' ? 'btn btn-danger' : 'btn btn-primary'}
            onClick={handleToggle}
          >
            {state === 'streaming' ? 'End call' : state === 'connecting' ? 'Connecting…' : currentPreset.actionText}
          </button>
        </div>
      </div>

      {showSettings && (
        <div className="card card-pad" style={{ marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* ── Row 1: Contact / Scenario / Greeting ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 650, color: 'var(--text-secondary)' }}>Contact</label>
              <input className="input" value={targetSubject} onChange={(e) => setTargetSubject(e.target.value)} disabled={state !== 'idle'} style={{ width: '100%', marginTop: 4, boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 650, color: 'var(--text-secondary)' }}>Scenario</label>
              <input className="input" value={targetContext} onChange={(e) => setTargetContext(e.target.value)} disabled={state !== 'idle'} style={{ width: '100%', marginTop: 4, boxSizing: 'border-box' }} />
            </div>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 650, color: 'var(--text-secondary)' }}>Opening greeting</label>
            <input className="input" value={customGreeting} onChange={(e) => setCustomGreeting(e.target.value)} disabled={state !== 'idle'} style={{ width: '100%', marginTop: 4, boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 650, color: 'var(--text-secondary)' }}>System instructions</label>
            <textarea className="input" value={customInstructions} onChange={(e) => setCustomInstructions(e.target.value)} disabled={state !== 'idle'} rows={3} style={{ width: '100%', marginTop: 4, boxSizing: 'border-box', resize: 'vertical' }} />
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: 0 }} />

          {/* ── Row 2: Conversation Brain ── */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 650, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
              Conversation brain
              {agentOk !== null && <span style={{ fontSize: 10, color: agentOk ? '#16a34a' : '#dc2626' }}>● Agent {agentOk ? 'up' : 'down'}</span>}
            </label>
            <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
              {([
                { id: 'template', label: 'Template',    hint: 'Offline scripts — always works',    dot: true,    dotOk: true  },
                { id: 'local',    label: 'Local Qwen',  hint: 'Ollama · Free · qwen3:1.7b',        dot: ollamaOk !== null, dotOk: ollamaOk === true  },
                { id: 'openai',   label: 'OpenAI',      hint: 'gpt-4o-mini · Needs OPENAI_API_KEY', dot: openaiOk !== null, dotOk: openaiOk === true  },
              ] as { id: BrainProvider; label: string; hint: string; dot: boolean; dotOk: boolean }[]).map((b) => {
                const selected = brainProvider === b.id;
                return (
                  <button
                    key={b.id}
                    id={`brain-${b.id}`}
                    onClick={() => selectBrain(b.id)}
                    disabled={state !== 'idle'}
                    title={b.hint}
                    style={{
                      padding: '6px 12px', borderRadius: 8, fontSize: 12.5, fontWeight: 650, display: 'flex', alignItems: 'center', gap: 5,
                      border: selected ? '1px solid #101828' : '1px solid var(--border-strong)',
                      background: selected ? '#101828' : 'var(--surface-1)',
                      color: selected ? '#fff' : 'var(--text-secondary)',
                      cursor: state === 'idle' ? 'pointer' : 'not-allowed',
                    }}
                  >
                    {b.label}
                    {b.dot && <span style={{ fontSize: 8, color: b.dotOk ? '#4ade80' : '#f87171' }}>●</span>}
                  </button>
                );
              })}
            </div>
            {brainProvider !== 'template' && (
              <input
                className="input"
                value={brainModel}
                onChange={(e) => { setBrainModel(e.target.value); localStorage.setItem('voicebench.brain.model', e.target.value); }}
                disabled={state !== 'idle'}
                placeholder={BRAIN_DEFAULT_MODEL[brainProvider]}
                title="Model id passed to the provider"
                style={{ width: '100%', marginTop: 6, boxSizing: 'border-box' }}
              />
            )}
            <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)', marginTop: 4 }}>
              {brainProvider === 'template' && 'Deterministic scripts. Always works, no model needed.'}
              {brainProvider === 'local' && (ollamaOk === false
                ? '⚠ Ollama not reachable — run `ollama run qwen3:1.7b` first. Falls back to templates.'
                : 'Restyles replies within guardrails. Falls back to templates on failure.')}
              {brainProvider === 'openai' && (openaiOk
                ? '✓ OPENAI_API_KEY detected.'
                : '⚠ OPENAI_API_KEY not set on agent. Falls back to templates.')}
            </div>
          </div>

          {/* ── Row 3: STT Model + TTS Voice (side by side) ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {/* STT */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 650, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                STT model (Whisper)
                {sttOk !== null && <span style={{ fontSize: 10, color: sttOk ? '#16a34a' : '#dc2626' }}>● {sttOk ? 'up' : 'down'}</span>}
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 6 }}>
                {STT_MODELS.map((m) => {
                  const sel = sttModel === m.id;
                  return (
                    <button
                      key={m.id}
                      id={`stt-${m.id}`}
                      title={m.hint}
                      onClick={() => { setSttModel(m.id); localStorage.setItem('voicebench.stt.model', m.id); }}
                      disabled={state !== 'idle'}
                      style={{
                        padding: '5px 10px', borderRadius: 7, fontSize: 12, fontWeight: sel ? 650 : 450,
                        border: sel ? '1px solid #101828' : '1px solid var(--border-strong)',
                        background: sel ? '#101828' : 'var(--surface-1)',
                        color: sel ? '#fff' : 'var(--text-secondary)',
                        cursor: state === 'idle' ? 'pointer' : 'not-allowed',
                      }}
                    >
                      {m.label}
                    </button>
                  );
                })}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)', marginTop: 4 }}>
                {STT_MODELS.find((m) => m.id === sttModel)?.hint}
                {(sttModel === 'large-v2' || sttModel === 'large-v3-turbo') && ' · Currently running on CPU — expect slower inference.'}
              </div>
            </div>

            {/* TTS */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 650, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                TTS voice (Edge Neural)
                {ttsOk !== null && <span style={{ fontSize: 10, color: ttsOk ? '#16a34a' : '#dc2626' }}>● {ttsOk ? 'up' : 'down'}</span>}
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 6 }}>
                {TTS_VOICES.map((v) => {
                  const sel = ttsVoice === v.id;
                  return (
                    <button
                      key={v.id}
                      id={`tts-${v.id}`}
                      title={v.hint}
                      onClick={() => { setTtsVoice(v.id); localStorage.setItem('voicebench.tts.voice', v.id); }}
                      disabled={state !== 'idle'}
                      style={{
                        padding: '5px 10px', borderRadius: 7, fontSize: 12, fontWeight: sel ? 650 : 450,
                        border: sel ? '1px solid #101828' : '1px solid var(--border-strong)',
                        background: sel ? '#101828' : 'var(--surface-1)',
                        color: sel ? '#fff' : 'var(--text-secondary)',
                        cursor: state === 'idle' ? 'pointer' : 'not-allowed',
                        opacity: v.lang !== agentLanguage ? 0.45 : 1,
                      }}
                    >
                      {v.label}
                      {v.lang !== agentLanguage && <span style={{ marginLeft: 4, fontSize: 9 }}>↗</span>}
                    </button>
                  );
                })}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)', marginTop: 4 }}>
                {TTS_VOICES.find((v) => v.id === ttsVoice)?.hint || ttsVoice}
                {!ttsOk && ttsOk !== null && ' · TTS service down — check port 8004.'}
              </div>
            </div>
          </div>

          {/* ── Guardrails ── */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {activeGuardrails.map((g) => <Badge key={g} tone="success">{g}</Badge>)}
          </div>

        </div>
      )}

      <div style={{ marginBottom: 12 }}>
        <LatencyHUD
          queueDepth={hudData.queueDepth} gpuUtil={hudData.gpuUtil} rtf={hudData.rtf} mode="agent"
          lastCaptureToFinalMs={asrCommitMs} agentTurnLatencyMs={agentTurnLatencyMs}
          ttsFirstAudioMs={ttsFirstAudioMs} totalRoundTripMs={totalRoundTripMs}
          agentVerified={identityVerified} promiseCaptured={promiseCaptured}
        />
      </div>

      {notice && (
        <div className="card card-pad" style={{ borderColor: 'var(--accent-border)', background: 'var(--accent-soft)', color: 'var(--accent)', marginBottom: 12, fontSize: 13 }}>
          {notice}
        </div>
      )}

      {error && (
        <div className="card card-pad" style={{ borderColor: 'var(--danger-border)', background: 'var(--danger-soft)', color: 'var(--danger)', marginBottom: 12, fontSize: 13 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.6fr) minmax(300px, 1fr)', gap: 12, alignItems: 'start' }}>
        <div className="card" style={{ padding: 0 }}>
          <div className="card-header">
            <h3 className="card-title">Transcript</h3>
            <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
              {entries.length} turn{entries.length === 1 ? '' : 's'}{isAgentSpeaking ? ' · agent speaking' : ''}
            </span>
          </div>
          <div ref={chatScrollRef} style={{ padding: 16, maxHeight: 560, overflowY: 'auto' }}>
            {entries.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text-tertiary)' }}>
                <div style={{ fontWeight: 650, color: 'var(--text)', marginBottom: 4 }}>Ready to start</div>
                <div style={{ fontSize: 13 }}>Press “{currentPreset.actionText}” — the agent greets you first. When it's your turn, try: “Yes, this is Alex — my date of birth is April 15, 1988.”</div>
              </div>
            ) : (
              <Captions entries={entries} />
            )}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="card" style={{ padding: 0 }}>
            <div className="card-header"><h3 className="card-title">Workflow state</h3><Badge tone="neutral">{currentPreset.title}</Badge></div>
            <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {steps.map((s, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: s.state === 'done' ? 'var(--success-soft)' : s.state === 'active' ? 'var(--accent-soft)' : 'var(--surface-2)' }}>
                  <span style={{ fontSize: 13, fontWeight: s.state === 'active' ? 650 : 450 }}>{i + 1}. {s.title}</span>
                  <Badge tone={s.state === 'done' ? 'success' : s.state === 'active' ? 'info' : 'neutral'}>
                    {s.state === 'done' ? 'Done' : s.state === 'active' ? 'Active' : 'Pending'}
                  </Badge>
                </div>
              ))}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 2 }}>
                <div className="stat"><div className="stat-label">Stop-contact</div><div style={{ fontWeight: 700, color: stopContact ? 'var(--danger)' : 'var(--success)' }}>{stopContact ? 'Triggered' : 'Clear'}</div></div>
                <div className="stat"><div className="stat-label">Promise</div><div style={{ fontWeight: 700 }}>{promiseCaptured || 'None'}</div></div>
              </div>
            </div>
          </div>

          <div className="card" style={{ padding: 0 }}>
            <div className="card-header"><h3 className="card-title">Safety feed</h3><Badge tone="neutral">Realtime</Badge></div>
            <div style={{ padding: 14, maxHeight: 260, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {eventsFeed.length === 0 ? (
                <div style={{ fontSize: 13, color: 'var(--text-tertiary)', textAlign: 'center', padding: '12px 0' }}>No events yet. Guardrails armed.</div>
              ) : (
                eventsFeed.map((ev, i) => (
                  <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', fontSize: 13 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                      <Badge tone={ev.type === 'compliance_block' ? 'danger' : ev.type === 'interrupt' ? 'warning' : 'success'}>{ev.type}</Badge>
                      <span className="mono" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{ev.time}</span>
                    </div>
                    <div style={{ color: 'var(--text-secondary)' }}>{ev.rule ? `[${ev.rule}] ` : ''}{ev.text}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
