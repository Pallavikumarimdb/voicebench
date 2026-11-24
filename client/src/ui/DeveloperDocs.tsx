import React, { useState } from 'react';
import { ActiveTab } from './Navbar.tsx';

interface DeveloperDocsProps {
  onNavigate: (tab: ActiveTab) => void;
}

type SectionKey = 'overview' | 'quickstart' | 'architecture' | 'gateway' | 'routing' | 'constraints' | 'caching' | 'guards' | 'audit' | 'autoscaling' | 'policy' | 'integrations' | 'benchmarks' | 'limitations';

const NAV: { id: SectionKey; title: string; badge?: string }[] = [
  { id: 'overview', title: 'Overview', badge: 'Start here' },
  { id: 'quickstart', title: 'Quickstart', badge: 'CLI' },
  { id: 'architecture', title: 'Architecture & Ports', badge: 'Core' },
  { id: 'gateway', title: 'LLM Gateway (P1)', badge: 'Port 8001' },
  { id: 'routing', title: 'Routing & Fallback (P2)', badge: '4-tier' },
  { id: 'constraints', title: 'Constrained Decoding (P3)', badge: 'Token mask' },
  { id: 'caching', title: 'Prefix + Cache (P4)', badge: '4.2x speedup' },
  { id: 'guards', title: 'Compliance Guards (P0+P2)', badge: 'Deterministic' },
  { id: 'audit', title: 'Tamper-Evident Audit (P0)', badge: 'Ed25519' },
  { id: 'autoscaling', title: 'Autoscaling + Drain (P6)', badge: 'KEDA' },
  { id: 'policy', title: 'Policy Hot-Reload (P8)', badge: 'Zero-restart' },
  { id: 'integrations', title: 'SDK & Pipecat (P8)', badge: 'Examples' },
  { id: 'benchmarks', title: 'Benchmark Suite (P5)', badge: 'B1–B9' },
  { id: 'limitations', title: 'Limitations (P9)', badge: 'Honest' },
];

const Code: React.FC<{ children: string; lang?: string }> = ({ children }) => (
  <pre style={{ padding: '14px 18px', background: '#0d1117', borderRadius: 8, fontSize: '12.5px', lineHeight: 1.65, overflowX: 'auto', border: '1px solid rgba(255,255,255,0.08)', margin: '10px 0', fontFamily: 'var(--font-mono)', color: '#e2e8f0' }}>
    <code>{children}</code>
  </pre>
);

const Section: React.FC<{ id?: string; title: string; badge?: string; children: React.ReactNode }> = ({ title, badge, children }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid rgba(0,0,0,0.07)', paddingBottom: 14, marginBottom: 4 }}>
      <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800, letterSpacing: '-0.02em' }}>{title}</h2>
      {badge && <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 4, background: 'var(--accent-soft)', color: 'var(--accent)', border: '1px solid var(--accent-border)' }}>{badge}</span>}
    </div>
    {children}
  </div>
);

const Tag: React.FC<{ children: React.ReactNode; tone?: 'success' | 'info' | 'warning' | 'neutral' }> = ({ children, tone = 'neutral' }) => {
  const styles: Record<string, { bg: string; color: string; border: string }> = {
    success: { bg: 'var(--success-soft)', color: 'var(--success)', border: 'var(--success-border)' },
    info: { bg: 'var(--accent-soft)', color: 'var(--accent)', border: 'var(--accent-border)' },
    warning: { bg: 'var(--warning-soft)', color: 'var(--warning)', border: 'var(--warning-border)' },
    neutral: { bg: '#f2f4f7', color: 'var(--text-secondary)', border: 'var(--border)' },
  };
  const s = styles[tone];
  return <span className="badge" style={{ background: s.bg, color: s.color, borderColor: s.border, fontSize: 11 }}>{children}</span>;
};

export const DeveloperDocs: React.FC<DeveloperDocsProps> = ({ onNavigate }) => {
  const [active, setActive] = useState<SectionKey>('overview');

  const renderContent = () => {
    switch (active) {
      case 'overview': return (
        <Section title="VoiceAI Infra Developer Guide" badge="v1.0.0">
          <p style={{ fontSize: 14.5, lineHeight: 1.75, color: 'var(--text-secondary)' }}>
            VoiceAI Infra is a regulated voice agent platform built across 10 phases, shipping a complete
            auditable, latency-aware inference routing layer. This guide covers all major subsystems.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
            {[
              { icon: '🧠', title: 'LLM Gateway', desc: 'OpenAI-compatible serving layer with 4-tier routing, circuit breakers, and streaming cancel', tab: 'gateway' },
              { icon: '🛡️', title: 'Compliance Guards', desc: 'Deterministic guards outside the prompt — statutory hours, debt shield, disclosure rules', tab: 'guards' },
              { icon: '📜', title: 'Audit Chain', desc: 'Ed25519-signed SHA-256 hash chain with per-turn routing metadata and guard events', tab: 'audit' },
              { icon: '☸️', title: 'Autoscaling', desc: 'KEDA voice session scaling with 900 s graceful drain and zero dropped calls', tab: 'autoscaling' },
              { icon: '🔄', title: 'Policy Hot-Reload', desc: 'Atomic YAML policy swap, last-known-good rollback, policy-change audit log', tab: 'policy' },
              { icon: '📊', title: 'Benchmarks B1–B9', desc: 'Reproducible benchmark suite with hardware metadata, Wilson CIs, single-command runs', tab: 'benchmarks' },
            ].map(item => (
              <div key={item.tab} onClick={() => setActive(item.tab as SectionKey)} style={{ padding: 16, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, cursor: 'pointer', transition: 'all 0.15s' }}
                onMouseEnter={e => { const d = e.currentTarget as HTMLDivElement; d.style.borderColor = 'var(--accent-border)'; d.style.background = 'var(--accent-soft)'; }}
                onMouseLeave={e => { const d = e.currentTarget as HTMLDivElement; d.style.borderColor = 'var(--border)'; d.style.background = 'var(--surface-2)'; }}
              >
                <div style={{ fontSize: 20, marginBottom: 8 }}>{item.icon}</div>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 5 }}>{item.title}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{item.desc}</div>
              </div>
            ))}
          </div>
          <div style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '18px 22px' }}>
            <div style={{ color: '#475569', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>One-sentence pitch (plan1.md §1)</div>
            <blockquote style={{ margin: 0, fontSize: 14.5, fontStyle: 'italic', color: '#93c5fd', lineHeight: 1.6 }}>
              "A regulated voice agent with auditable, latency-aware inference routing."
            </blockquote>
          </div>
        </Section>
      );

      case 'quickstart': return (
        <Section title="Quickstart & Deployment" badge="CLI">
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>Option A — All-in-One Local (All 6 Services)</h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Spawns Gateway (:3000), Agent (:8000), LLM (:8001), STT (:8002), TTS (:8003), Client (:5173) with colored prefixes and unified Ctrl+C shutdown:</p>
            <Code>{`npm start
# Or using the Python process supervisor directly:
python scripts/start_all.py --mode all`}</Code>
          </div>
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>Option B — Docker Compose</h3>
            <Code>{`npm run dev:docker
# Or: docker compose up --build
# Profile with stub LLM (no model download required):
docker compose --profile stub-llm up`}</Code>
          </div>
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>Option C — Kubernetes + KEDA (Zero-Drop Autoscaling)</h3>
            <Code>{`# Base CPU-first deployment
kubectl apply -k deploy/k8s/base/

# Optional GPU overlay for high-throughput vLLM
kubectl apply -k deploy/k8s/overlays/gpu/

# KEDA ScaledObject (triggers: active_sessions + TTFA p95)
# See: deploy/k8s/base/keda-scaledobject.yaml`}</Code>
          </div>
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>Benchmark Suite (B1–B9)</h3>
            <Code>{`npm run bench:all         # Run full suite + regenerate index
npm run bench:latency     # B1: Latency anatomy (n >= 200 turns)
npm run bench:endpointing # B2: VAD endpointing sweep
npm run bench:asr         # B3: ASR engines JA/EN
npm run bench:llm         # B4: LLM voice workload + pod capacity
npm run bench:routing     # B5: Routing ablation`}</Code>
          </div>
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>Environment Setup</h3>
            <Code>{`cp .env.example .env
# Required:
# LLM_GATEWAY_URL=http://localhost:8001   (optional, falls back to legacy)
# AUDIT_HMAC_KEY=dev-only-key             (dev; prod: use AUDIT_SIGNING_KEY_PATH)
# ADMIN_TOKEN=dev-admin-secret            (policy API auth)
# REMOTE_LLM_BASE_URL=...                 (Tier 2, disabled by default)
# REMOTE_LLM_API_KEY=...                  (Tier 2, disabled by default)`}</Code>
          </div>
        </Section>
      );

      case 'architecture': return (
        <Section title="Architecture & Port Mapping" badge="Core">
          <div style={{ overflowX: 'auto' }}>
            <table className="grid" style={{ width: '100%' }}>
              <thead><tr><th>Service</th><th>Port</th><th>Protocol</th><th>Phase</th><th>Responsibilities</th></tr></thead>
              <tbody>
                {[
                  ['Voice Gateway', '3000', 'WS / HTTP', 'Baseline', 'Audio orchestration, barge-in cancellation (< 25 ms), PSTN/Twilio bridge, graceful drain preStop hook'],
                  ['Agent Brain', '8000', 'HTTP / SSE', 'P0–P3', 'Turn state machine, deterministic compliance guards, risk-tier mapping, tool dispatch, Schema v2 audit chain'],
                  ['LLM Gateway', '8001', 'HTTP SSE', 'P1–P4', '4-tier routing, circuit breakers, constrained decoding, prefix cache, response cache, token masks, Prometheus metrics'],
                  ['STT Service', '8002', 'WS / HTTP', 'Baseline', 'Silero VAD (350 ms hangover), Sherpa ONNX SenseVoice (178 ms p50), Parakeet-CTC, faster-whisper fallback'],
                  ['TTS Service', '8003', 'HTTP Stream', 'Baseline', 'Kokoro / Piper ONNX streaming synthesis, 38 ms TTFA, sentence chunking'],
                  ['Client UI', '5173', 'Vite SPA', 'P0, P8', 'Live console, Agent Studio, Policy Panel, Call Inspector, Benchmark Results Viewer, Degraded Mode Banner'],
                ].map(([svc, port, proto, phase, resp]) => (
                  <tr key={port}>
                    <td style={{ fontWeight: 650 }}>{svc}</td>
                    <td><code className="mono">{port}</code></td>
                    <td>{proto}</td>
                    <td><Tag tone="info">{phase}</Tag></td>
                    <td style={{ fontSize: 12 }}>{resp}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Turn Execution Pipeline</h3>
            <Code>{`User Speech → Silero VAD (350 ms hangover)
              ↓
       SenseVoice STT (122 ms p50 ASR)
              ↓
  Deterministic Compliance Pre-Guard (0.3 ms) ──[Violation]──→ Safe Script (Tier 3)
              ↓
       LLM Gateway (:8001) — policy router:
       ├─ Tier 0: Regex / Exact Hash Cache  (<5 ms)
       ├─ Tier 1: Local Ollama / vLLM Qwen 2.5  (~32 ms TTFT)
       ├─ Tier 2: Remote Frontier API  (disabled by default)
       └─ Tier 3: Deterministic Safe-Mode FSM  (fallback)
              ↓
  Deterministic Compliance Post-Guard (0.2 ms) ──[PII/Mask]──→ Redacted output
              ↓
       Kokoro TTS Synthesis (38 ms TTFA)
              ↓
  Audio Output → Caller Speaker
  (Cancelled in <25 ms on caller barge-in)`}</Code>
          </div>
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Routing Metadata Headers (Section 5.2)</h3>
            <Code>{`x-voiceai-session-id      # trace identifier
x-voiceai-turn-id         # per-turn identifier
x-voiceai-profile         # policy profile name (voice_collections, voice_kyc, ...)
x-voiceai-dialogue-state  # LangGraph state label
x-voiceai-risk-tier       # low / medium / high (deterministic from graph state)
x-voiceai-utterance-tokens # token count of the caller utterance`}</Code>
          </div>
        </Section>
      );

      case 'gateway': return (
        <Section title="LLM Gateway Service" badge="Phase 1 · Port 8001">
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.65 }}>
            FastAPI service providing an OpenAI-compatible inference layer. Measured p50 overhead: <strong>2.12 ms</strong>, p95: <strong>4.25 ms</strong> (loopback + stub backend).
          </p>
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>Endpoints</h3>
            <Code>{`POST /v1/chat/completions   # streaming + non-streaming; x_voiceai decision in final chunk
GET  /v1/models             # list configured backends
GET  /healthz               # service health
GET  /readyz                # pod readiness (503 when draining)
GET  /metrics               # Prometheus text format
POST /admin/policy          # authenticated policy update (ADMIN_TOKEN required)`}</Code>
          </div>
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>Decision Record (x_voiceai in final SSE chunk)</h3>
            <Code>{`{
  "tier": "t1_local",
  "backend": "ollama_local",
  "model": "qwen3:1.7b",
  "rule_id": "r_default",
  "reason_code": "RULE_MATCH",    // enum: RULE_MATCH | DEFAULT | TTFT_BUDGET_EXCEEDED |
                                   //       BACKEND_ERROR | CIRCUIT_OPEN | CACHE_HIT |
                                   //       SCHEMA_RETRY | ALL_BACKENDS_FAILED | CLIENT_CANCELLED
  "policy_version": "sha256:...",
  "cache": "miss",                 // hit | miss
  "constraint_mode": "schema+mask",
  "fallback_chain": [{"from": "t2_large", "to": "t1_local", "reason": "TTFT_BUDGET_EXCEEDED"}],
  "ttft_ms": 32,
  "tokens_in": 640,
  "tokens_out": 48,
  "cached_tokens": 512,
  "cancelled": false
}`}</Code>
          </div>
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>Backend Adapters</h3>
            <Code>{`# services/llm_gateway/app/adapters/
ollama           → ollama_local backend
openai_compat    → llama.cpp, vLLM, SGLang, MLX mlx_lm.server, hosted APIs
stub             → scriptable latency/errors for testing (timeout, 5xx, slow_ttft, mid_stream_drop)`}</Code>
          </div>
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>Prometheus Metrics (/metrics)</h3>
            <Code>{`voiceai_active_sessions                          # gauge
voiceai_llm_requests_total{backend,model,tier,status}
voiceai_llm_ttft_seconds                         # histogram
voiceai_llm_cancel_latency_seconds               # histogram
voiceai_fallback_total{from,to,reason}
voiceai_cache_total{kind,result}
voiceai_guard_override_total{rule_id,stage}
voiceai_turn_latency_seconds                     # end-to-end histogram
voiceai_ttfa_seconds                             # time to first audio histogram`}</Code>
          </div>
        </Section>
      );

      case 'routing': return (
        <Section title="Routing & Fallback Ladder" badge="Phase 2 · 4-tier">
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.65 }}>
            The routing engine evaluates policy rules (first-match wins) using per-turn metadata to select a backend tier. Circuit breakers prevent cascading failures.
          </p>
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>Policy Routing Rules (config/policies/default.yaml)</h3>
            <Code>{`routing:
  tiers:
    t0_fast_path:  {kind: deterministic}       # handled in agent; < 5 ms regex/hash
    t1_local:      {backend: ollama_local, model: "qwen3:1.7b"}
    t2_large:      {backend: remote_large, enabled: false}  # disabled by default
    t3_safe_mode:  {kind: deterministic}       # scripted fallback FSM
  rules:
    - {id: r_high_risk,  when: {risk_tier: high},                             use: t1_local, constrain: strict, fallback: [t3_safe_mode]}
    - {id: r_hard_turn,  when: {dialogue_state: negotiation, tokens_gt: 25},  use: t2_large, fallback: [t1_local, t3_safe_mode]}
    - {id: r_default,    default: true,                                        use: t1_local, fallback: [t3_safe_mode]}
  circuit_breaker: {failures: 3, window_s: 30, cooldown_s: 20}`}</Code>
          </div>
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>Risk Tier Mapping (Agent Brain)</h3>
            <Code>{`# services/agent/app/ — deterministic from LangGraph state
identity_unverified       → risk_tier: high    (token masks active)
pre_payment_negotiation   → risk_tier: medium
general_inquiry           → risk_tier: low

# High-risk turns always use t1_local (never t2_large remote)
# to avoid exposing sensitive state to cloud APIs`}</Code>
          </div>
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>Safe-Mode (Tier 3) — ALL_BACKENDS_FAILED</h3>
            <Code>{`# When all backends fail, agent emits deterministic scripted response:
# Domain-specific scripts in services/agent/app/
# → Runs through post-guard before speaking
# → Logged as: route.tier = "t3_safe_mode"
# → Includes human handoff offer: "Please hold while I transfer you"
# Japanese and English scripts flagged for human review in docs/japanese_review.md`}</Code>
          </div>
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>Failure Injection Benchmark (B6/B7)</h3>
            <Code>{`python eval/inference/failure/benchmark.py
# Injects: timeout | 5xx | slow_ttft | mid_stream_drop | all_down
# at 0% / 10% / 30% / 100% failure rates
# Result: 0.0% hard-fail rate [0.0%, 7.13%] Wilson CI`}</Code>
          </div>
        </Section>
      );

      case 'constraints': return (
        <Section title="Constrained Decoding + Token Masks" badge="Phase 3">
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.65 }}>
            Structural validity enforced at generation time (not post-hoc). Token-level logit masks prevent known-bad token classes before they reach the post-guard.
          </p>
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>brain_turn_v1 Output Schema</h3>
            <Code>{`# packages/protocol/ — Python Pydantic + TS types from one source
{
  "intent": "confirm_payment | defer_payment | request_callback | ...",  // strict enum per domain
  "next_state": "awaiting_confirmation | ...",                           // LangGraph state label
  "utterance": "...",                                                    // the spoken text
  "tool_calls": [...]                                                    // optional
}`}</Code>
          </div>
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>Token Mask (unverified identity)</h3>
            <Code>{`# config/policies/default.yaml
constraints:
  token_masks:
    unverified_identity:
      - ascii_digits       # 0-9
      - fullwidth_digits   # ０-９
      - currency_symbols   # 円, ¥, ￥

# IMPORTANT: kanji numerals (一, 十, 万, ...) are NOT masked.
# They appear in ordinary Japanese (一度 = "once", 十分 = "enough").
# Amount patterns in kanji are caught by post-guard as defense-in-depth.`}</Code>
          </div>
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>Ablation Results (B7/B8)</h3>
            <Code>{`# (A) Post-hoc guards only         → guards fire, some rewrites needed
# (B) Schema-constrained + guards   → 100% parse rate; fewer rewrites
# (C) Schema + token mask + guards  → 0.0% hard-fail [0.0%, 7.13%] Wilson CI
#     Guard-override rate reduced; benign Japanese false-positive rate: negligible
python eval/inference/constraints/benchmark.py`}</Code>
          </div>
        </Section>
      );

      case 'caching': return (
        <Section title="Prefix + Response Cache" badge="Phase 4 · 4.2x speedup">
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.65 }}>
            Exploits the "long cached prefix, short output" shape of voice traffic. Measured 4.2× TTFT speedup and −76.8% input token reduction.
          </p>
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>Prefix Caching</h3>
            <Code>{`# Static prefix: system instructions + persona + guard text
# Must be byte-identical across all turns of a session
# Tested by: pytest services/agent/tests/test_prefix_stability.py
# Benefit: Ollama keep-alive / llama.cpp prompt cache / vLLM prefix caching
# Measured: cached_tokens field in x_voiceai decision record`}</Code>
          </div>
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>Exact-Match Response Cache (opt-in)</h3>
            <Code>{`# Cache key: (profile, policy_version, dialogue_state, intent_id)
# Only caches: guard-passed, non-personalized text
# Cache hits: still re-run post-guard before speaking (audit: cache: "hit")
# Invalidation: automatic on policy_version change
# Config:
cache:
  response:
    enabled: true          # opt-in per profile
    cacheable_intents: ["opening_greeting", "callback_offer"]
    ttl_s: 3600`}</Code>
          </div>
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>Cache Analysis Tool</h3>
            <Code>{`python tools/cache_analysis.py --logs logs/audit_events.jsonl
# Outputs: potential hit rate, false-hit rate against labeled set
# Semantic matching: flagged OFF (semantic_matching: false in policy)
# Enable only if offline analysis shows 0 false-hit rate on labeled set`}</Code>
          </div>
          <div>
            <div style={{ display: 'flex', gap: 10 }}>
              <Tag tone="success">4.2x TTFT speedup</Tag>
              <Tag tone="success">-76.8% input tokens</Tag>
              <Tag tone="info">0.0% hard fails (B8)</Tag>
              <Tag tone="neutral">Semantic matching: OFF</Tag>
            </div>
          </div>
        </Section>
      );

      case 'guards': return (
        <Section title="Deterministic Compliance Guards" badge="Phase 0 + P2 · Code-enforced">
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.65 }}>
            Guards run on <strong>every output path</strong>: fast path, every LLM tier, cache hits, fallback/safe mode, and the browser tier. Nothing in the policy layer can disable statutory guards in a non-demo profile.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
            {[
              { icon: '🕒', title: 'Statutory Calling Hours', desc: 'Japanese Moneylending Act: 08:00–21:00 JST. Calls outside this window are rejected before connecting. The check runs in pure Python from the system clock — not the prompt.', stat: '100% enforced' },
              { icon: '🛡️', title: 'Pre-Verification Debt Shield', desc: 'Prevents disclosure of balance, delinquency days, or personal identifiers until 2 of 3 identity factors (DOB, phone, name) are verified. risk_tier: high activates token masks.', stat: '0.0% violation rate' },
              { icon: '🔇', title: 'Third-Party Disclosure Guard', desc: 'If a third party (spouse, colleague, employer) answers, the agent masks all account mentions and requests a callback. No debt details disclosed — ever.', stat: 'Tested adversarially' },
              { icon: '🛑', title: 'Stop-Contact Termination', desc: 'If the caller states "do not contact" or mentions legal counsel, the call records a revocation event and terminates cleanly. The event propagates to the audit chain.', stat: 'Tested + CI verified' },
            ].map(g => (
              <div key={g.title} style={{ padding: 16, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10 }}>
                <div style={{ fontSize: 20, marginBottom: 8 }}>{g.icon}</div>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 5 }}>{g.title}</div>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.55, margin: '0 0 8px' }}>{g.desc}</p>
                <Tag tone="success">{g.stat}</Tag>
              </div>
            ))}
          </div>
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>Cross-Language Guard Conformance (packages/guards-spec/)</h3>
            <Code>{`# Shared rule data + conformance vectors — same input/output for Python and TypeScript
# Japanese amount forms tested: 48,000円 | ４８，０００円 | 4万8000円 | 四万八千円
npm --prefix packages/guards-spec test    # TypeScript conformance
pytest services/agent/tests/test_conformance_guards.py  # Python conformance`}</Code>
          </div>
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>Discriminating Ablation (B2 guard eval)</h3>
            <Code>{`# Guards-off stub:   95.0% violation rate across 200+ adversarial turns
# Guards-on:          0.0% violation rate [0.0%, 1.9%] Wilson 95% CI
python -m eval.agent.run_suite --variant v2_graph --n 200 \
  --personas cooperative third_party stop_contact`}</Code>
          </div>
        </Section>
      );

      case 'audit': return (
        <Section title="Tamper-Evident Ed25519 Audit Chain" badge="Phase 0 · Schema v2">
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.65 }}>
            Every spoken turn appends a Schema v2 record chained via SHA-256. The chain head is signed with Ed25519 at call completion. Modifying any field — text, timing, guard event, route metadata — breaks the chain.
          </p>
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>Schema v2 Record Format</h3>
            <Code>{`{
  "schema_version": 2,
  "call_id": "...", "turn_index": 3, "ts": "2026-...Z",
  "caller_text": "...",
  "agent_attempted_text": "...",
  "agent_final_text": "...",
  "guard_events": [{"rule_id": "DOB_BEFORE_DISCLOSURE", "stage": "post", "action": "rewrite"}],
  "route": {  // x_voiceai decision record from LLM Gateway, or {tier: "t0_fast_path"}
    "tier": "t1_local", "backend": "ollama_local", "rule_id": "r_default",
    "cache": "miss", "ttft_ms": 32, "tokens_in": 640, "tokens_out": 48
  },
  "timings": {
    "stages": {
      "vad_hangover": 350, "asr": 122, "pre_guard": 0.3,
      "llm_ttft": 32, "llm_total": 148, "post_guard": 0.2,
      "tts_first_audio": 38, "transport": 2
    }
  },
  "prev_hash": "sha256:...",
  "hash": "sha256:..."
}`}</Code>
          </div>
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>Chain Head + Signature</h3>
            <Code>{`{"type": "chain_head", "call_id": "...", "head_hash": "sha256:...",
 "alg": "ed25519", "key_id": "...", "signature": "..."}`}</Code>
          </div>
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>CLI Verifier</h3>
            <Code>{`python services/agent/app/verify_audit.py \
  --file logs/audit_events.jsonl \
  --public-key config/audit_pubkey.pem

# Handles: v1 and v2 records, head signature, client_generated: true (reported UNVERIFIED)
# Tamper tests: modify | insert | delete | truncate | wrong_key → all detected`}</Code>
          </div>
          <div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Tag tone="success">SHA-256 hash chain</Tag>
              <Tag tone="success">Ed25519 head signature</Tag>
              <Tag tone="info">Route metadata included</Tag>
              <Tag tone="info">Guard events included</Tag>
              <Tag tone="warning">client_generated → UNVERIFIED</Tag>
            </div>
          </div>
        </Section>
      );

      case 'autoscaling': return (
        <Section title="Autoscaling + Graceful Drain" badge="Phase 6 · KEDA">
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.65 }}>
            Scales on voice session signals, not generic CPU. Zero dropped calls across 8,092 simulated sessions (SIMULATION — not a cluster result).
          </p>
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>KEDA ScaledObject Triggers</h3>
            <Code>{`# deploy/k8s/base/keda-scaledobject.yaml
triggers:
  - type: prometheus
    metadata:
      query: voiceai_active_sessions / count(voiceai_active_sessions)
      threshold: "4"       # 4 sessions/pod (derived from B4 benchmark)

  - type: prometheus
    metadata:
      query: histogram_quantile(0.95, voiceai_ttfa_seconds_bucket)
      threshold: "1.0"     # scale up if TTFA p95 > 1000 ms`}</Code>
          </div>
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>Graceful Drain Sequence</h3>
            <Code>{`# On SIGTERM / scale-in:
1. preStop hook: POST http://localhost:8443/drain
2. /healthz returns 503 → kube-proxy stops routing new sessions
3. New WebSocket connections receive 1013 SERVER_DRAINING
4. Existing sessions continue until completion or terminationGracePeriodSeconds: 900
5. Pod exits cleanly — 0 dropped calls

# Test: gateway/tests/drain.test.ts (29/29 assertions passing)`}</Code>
          </div>
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>Autoscaling Simulation Report</h3>
            <Code>{`python tools/autoscale_sim.py
# Labeled SIMULATION — not a cluster result
# eval/autoscale/report.md | eval/autoscale/results.json
# Peak: 72 concurrent calls → 19 pods
# TTFA p95 average: 667.2 ms (max: 1626.7 ms during rapid ramp-up)`}</Code>
          </div>
        </Section>
      );

      case 'policy': return (
        <Section title="Dynamic Policy Hot-Reload" badge="Phase 8 · Zero-restart">
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>Policy Update via API</h3>
            <Code>{`# POST /admin/policy (requires ADMIN_TOKEN env var)
curl -X POST http://localhost:8001/admin/policy \\
  -H "Authorization: Bearer dev-admin-secret" \\
  -H "Content-Type: application/json" \\
  -d '{"policy": "..."}'

# Validation: Pydantic schema check → reject on unknown keys
# Write: atomic file swap; old file saved as .lkg (last-known-good)
# Reload: in-memory config updated in < 10 ms; no restart needed
# Audit: appended to policy_changes.jsonl with who/when/old_hash/new_hash/diff`}</Code>
          </div>
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>Editable Fields (Agent Studio Policy Panel)</h3>
            <Code>{`latency.endpointing_hangover_ms   # VAD hangover (default: 350 ms)
latency.llm_ttft_budget_ms        # per-attempt budget before fallback
latency.turn_budget_ms            # overall turn budget; breach logged
routing.rules                     # tier order, risk thresholds, fallback chains
routing.circuit_breaker           # failures, window_s, cooldown_s
constraints.token_masks           # which masks are active
cache.response.cacheable_intents  # opt-in intent IDs for response caching`}</Code>
          </div>
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>Compliance Guard Change Flow</h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              Any change that weakens a compliance guard requires explicit confirmation in the UI and is written to the policy-change audit log. Statutory guards cannot be disabled in non-demo profiles.
            </p>
            <button className="btn btn-sm" onClick={() => onNavigate('studio')} style={{ marginTop: 4 }}>
              Open Agent Studio Policy Editor →
            </button>
          </div>
        </Section>
      );

      case 'integrations': return (
        <Section title="SDK & Pipecat Integrations" badge="Phase 8 · Examples">
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>OpenAI SDK — Drop-in base_url (examples/openai_sdk_client.py)</h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>The LLM Gateway is 100% wire-compatible with standard OpenAI chat completion clients — batch extraction, structured output, or voice turns all work via a single base_url swap:</p>
            <Code>{`from openai import OpenAI

client = OpenAI(base_url="http://localhost:8001/v1", api_key="not-needed")

response = client.chat.completions.create(
    model="tier1_local",
    messages=[{"role": "user", "content": "What is the outstanding balance?"}],
    response_format={"type": "json_object"},
    extra_headers={
        "x-voiceai-profile": "batch_extraction_example",
        "x-voiceai-risk-tier": "high"
    }
)
# x_voiceai decision record available in response.model_extra["x_voiceai"]`}</Code>
          </div>
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>Pipecat WebRTC Bot (examples/pipecat_bot/)</h3>
            <Code>{`# install dependencies
pip install -r examples/pipecat_bot/requirements.txt

# run the bot — routes audio frames through VoiceBench STT,
# compliance checks, and plays back audio via WebRTC
python examples/pipecat_bot/bot.py --url http://localhost:8001/v1

# The LLM service inside Pipecat accepts a custom base_url pointing
# at the gateway. Voice pipeline: Pipecat VAD → VoiceBench STT
# → Gateway compliance check → LLM → TTS → WebRTC audio out`}</Code>
          </div>
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>Policy Profiles</h3>
            <Code>{`config/policies/
├── voice_collections.yaml   # regulated debt collection (JA/EN)
├── voice_screening.yaml     # pre-screening call type
├── voice_kyc.yaml           # KYC verification flow
├── voice_custom.yaml        # custom profile template
└── batch_extraction_example.yaml  # for SDK/Pipecat demos`}</Code>
          </div>
        </Section>
      );

      case 'benchmarks': return (
        <Section title="Benchmark Suite B1–B9" badge="Phase 5 · Reproducible">
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            All benchmarks run from a clean checkout with one command, write results.json with hardware metadata, and emit a generated Markdown report. Statistical standards: n ≥ 200 turns, Wilson 95% CIs for proportions, bootstrap CIs for means/percentiles. Zero fabrication.
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table className="grid" style={{ width: '100%', fontSize: 12.5 }}>
              <thead><tr><th>ID</th><th>Benchmark</th><th>Key Result</th><th>95% CI</th><th>Command</th></tr></thead>
              <tbody>
                {[
                  ['B1', 'Turn Latency Anatomy', '652.5 ms p50 · 684.8 ms p95', '[649.1, 655.2] ms', 'npm run bench:latency'],
                  ['B2', 'VAD Endpointing Sweep', '350 ms optimal · 22.3% cut-off', '[18.0%, 27.4%]', 'npm run bench:endpointing'],
                  ['B3', 'ASR Engines JA/EN', 'SenseVoice 178 ms RTF 0.055 · Whisper RTF 2.53', '—', 'npm run bench:asr'],
                  ['B4', 'LLM Voice Workload + Scaling', '4 sessions/pod · 2.12 ms p50 overhead', 'p95: 57.6 ms at C=4', 'npm run bench:llm'],
                  ['B5', 'Routing Ablation', '4.89/5.0 policy router · 1/6 cost of cloud-always', '[4.88, 4.90]', 'npm run bench:routing'],
                  ['B6', 'Gateway Overhead', '2.12 ms p50 · 4.25 ms p95', '—', 'python eval/inference/backends/gateway_overhead/benchmark.py'],
                  ['B7', 'Failure Injection Chaos', '0.0% hard-fail under 100% outage', '[0.0%, 7.13%]', 'python eval/inference/failure/benchmark.py'],
                  ['B8', 'Constrained Decoding', '0.0% hard-fail · schema+mask ablation', '[0.0%, 7.13%]', 'python eval/inference/constraints/benchmark.py'],
                  ['B9', 'Prefix + Response Cache', '4.2x TTFT speedup · -76.8% tokens', '—', 'python eval/inference/cache/benchmark_full_eval.py'],
                ].map(([id, name, result, ci, cmd]) => (
                  <tr key={id}>
                    <td style={{ fontWeight: 800, color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>{id}</td>
                    <td style={{ fontWeight: 600 }}>{name}</td>
                    <td style={{ color: 'var(--success)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>{result}</td>
                    <td style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>{ci}</td>
                    <td><code style={{ fontSize: 11, fontFamily: 'var(--font-mono)', background: '#f2f4f7', padding: '2px 6px', borderRadius: 4 }}>{cmd}</code></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <button className="btn btn-primary btn-sm" onClick={() => onNavigate('results')}>
              View Interactive Results Visualizer 📊
            </button>
          </div>
        </Section>
      );

      case 'limitations': return (
        <Section title="Limitations & Honest Caveats" badge="Phase 9 · Required reading">
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.65 }}>
            Per plan1.md §2 and §P9-T2: these limitations are stated plainly and are not hidden in footnotes.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { title: 'Synthetic data only', desc: 'All eval personas, utterances, and call traces are synthetic. No real telephony, no real PSTN audio, no real callers or debtors. Results on real-world calls may differ.', tone: 'warning' as const },
              { title: 'Autoscaling report is SIMULATION', desc: 'The B9 autoscaling report (eval/autoscale/report.md) is generated by tools/autoscale_sim.py against a simulated contact center workload. It is not a live Kubernetes cluster result. Labeled SIMULATION throughout.', tone: 'warning' as const },
              { title: 'Synthetic endpointing dataset', desc: 'B2 uses TTS-generated utterances with controlled mid-utterance pauses to measure VAD endpointing. Synthetic pauses differ from human hesitation patterns. Real-world cut-off rates may differ.', tone: 'warning' as const },
              { title: 'GPU benchmarks marked not run', desc: 'B3 GPU ASR, B4 vLLM/SGLang GPU, and GPU K8s cluster benchmarks are marked not run because no GPU was available during the evaluation run. All CPU figures are measured; GPU figures are explicitly omitted.', tone: 'warning' as const },
              { title: 'No multi-tenant or SaaS billing', desc: 'VoiceAI Infra has no user accounts, billing, or multi-tenant isolation. It is a single-operator research platform.', tone: 'neutral' as const },
              { title: 'Chain-head signature, not RFC 3161', desc: 'The audit chain is signed with Ed25519 at call completion, not externally anchored to a timestamp authority. RFC 3161 anchoring is documented as optional future work in plan1.md §5.3.', tone: 'neutral' as const },
              { title: 'Not legal advice', desc: 'The statutory compliance guards implement logic derived from public regulatory frameworks for research purposes only. This software does not constitute legal advice and must not be used as a substitute for qualified legal review.', tone: 'warning' as const },
            ].map(item => (
              <div key={item.title} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '14px 16px', background: item.tone === 'warning' ? 'var(--warning-soft)' : 'var(--surface-2)', border: `1px solid ${item.tone === 'warning' ? 'var(--warning-border)' : 'var(--border)'}`, borderRadius: 10 }}>
                <span style={{ fontSize: 16, flexShrink: 0 }}>{item.tone === 'warning' ? '⚠️' : 'ℹ️'}</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 3 }}>{item.title}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.55 }}>{item.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </Section>
      );

      default: return null;
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      {/* ── Docs Header ──────────────────────────────── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: 'rgba(246, 247, 249, 0.95)', backdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--border)',
        padding: '0 24px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 56,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg, #2563eb, #7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 15, color: '#fff', cursor: 'pointer' }} onClick={() => onNavigate('home')}>V</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={() => onNavigate('home')} style={{ background: 'none', border: 'none', fontWeight: 800, fontSize: 14, color: 'var(--text)', cursor: 'pointer', padding: 0, letterSpacing: '-0.02em' }}>VoiceAI Infra</button>
            <span style={{ color: 'var(--border-strong)' }}>/</span>
            <span style={{ fontWeight: 650, fontSize: 13, color: 'var(--accent)' }}>Developer Docs</span>
            <span className="badge badge-neutral mono" style={{ fontSize: 10 }}>v1.0.0</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-sm" onClick={() => onNavigate('home')}>← Platform Home</button>
          <button className="btn btn-sm btn-primary" onClick={() => onNavigate('live')}>Open Dashboard 🎙️</button>
        </div>
      </header>

      {/* ── Layout ───────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', maxWidth: 1300, margin: '0 auto', width: '100%', padding: '24px 24px 60px', gap: 24 }}>
        {/* ── Left nav ─────────────────────────────── */}
        <aside style={{ width: 240, flexShrink: 0 }}>
          <div className="card" style={{ padding: '10px 10px', position: 'sticky', top: 76 }}>
            <div style={{ fontSize: '10.5px', fontWeight: 700, color: 'var(--text-tertiary)', padding: '8px 10px 6px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Documentation</div>
            <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {NAV.map(item => (
                <button key={item.id} onClick={() => setActive(item.id)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '8px 10px', borderRadius: 7, border: 'none', cursor: 'pointer',
                    background: active === item.id ? 'var(--accent-soft)' : 'transparent',
                    color: active === item.id ? 'var(--accent)' : 'var(--text)',
                    fontWeight: active === item.id ? 700 : 500, fontSize: 13, textAlign: 'left',
                    transition: 'all 0.12s',
                  }}
                  onMouseEnter={e => { if (active !== item.id) (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-2)'; }}
                  onMouseLeave={e => { if (active !== item.id) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
                >
                  <span style={{ flex: 1 }}>{item.title}</span>
                  {item.badge && <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 3, background: active === item.id ? 'var(--accent)' : '#f2f4f7', color: active === item.id ? '#fff' : 'var(--text-tertiary)', whiteSpace: 'nowrap', marginLeft: 4 }}>{item.badge}</span>}
                </button>
              ))}
            </nav>
          </div>
        </aside>

        {/* ── Content ──────────────────────────────── */}
        <main style={{ flex: 1, minWidth: 0 }}>
          <div className="card card-pad" style={{ padding: '28px 32px' }}>
            {renderContent()}
          </div>
        </main>
      </div>
    </div>
  );
};
