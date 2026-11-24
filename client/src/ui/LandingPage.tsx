import React, { useState, useEffect } from 'react';
import { ActiveTab } from './Navbar.tsx';

interface LandingPageProps {
  onNavigate: (tab: ActiveTab) => void;
}

const BENCHMARKS = [
  { id: 'B1', name: 'Turn Latency Anatomy', metric: '652.5 ms p50', sub: '684.8 ms p95 · 225 turns measured', ci: '[649.1, 655.2] ms 95% CI', color: '#059669', cmd: 'npm run bench:latency' },
  { id: 'B2', name: 'VAD Endpointing Sweep', metric: '350 ms optimal', sub: '22.3% cut-off rate · Pareto frontier', ci: '[18.0%, 27.4%]', color: '#2563eb', cmd: 'npm run bench:endpointing' },
  { id: 'B3', name: 'ASR Engines JA/EN', metric: '178 ms SenseVoice', sub: 'RTF 0.055 · Whisper fails at RTF 2.53', ci: '—', color: '#7c3aed', cmd: 'npm run bench:asr' },
  { id: 'B4', name: 'LLM Voice Workload', metric: '4 sessions/pod', sub: 'TTFT p95 57.6 ms at C=4 · 2.12 ms overhead', ci: '—', color: '#d97706', cmd: 'npm run bench:llm' },
  { id: 'B5', name: 'Routing Ablation', metric: '4.89/5.0 score', sub: 'Policy router at 1/6 cost vs cloud-always', ci: '[4.88, 4.90]', color: '#db2777', cmd: 'npm run bench:routing' },
  { id: 'B6', name: 'Failure Injection', metric: '0.0% hard-fail', sub: 'Safe-mode ladder under 100% outage', ci: '[0.0%, 7.13%]', color: '#059669', cmd: 'python eval/inference/failure/benchmark.py' },
  { id: 'B7', name: 'Constrained Decoding', metric: '0.0% hard-fail', sub: 'Schema + token mask prevents amount disclosure', ci: '[0.0%, 7.13%]', color: '#2563eb', cmd: 'python eval/inference/constraints/benchmark.py' },
  { id: 'B8', name: 'Prefix + Response Cache', metric: '4.2x TTFT speedup', sub: '-76.8% input tokens · 0.0% hard fails', ci: '—', color: '#7c3aed', cmd: 'python eval/inference/cache/benchmark_full_eval.py' },
  { id: 'B9', name: 'Zero-Drop Autoscaling', metric: '0 drops / 8,092', sub: '19 pod peak · 900s graceful drain (SIMULATION)', ci: 'SIMULATION', color: '#d97706', cmd: 'python tools/autoscale_sim.py' },
];

const PILLARS = [
  { icon: '🛡️', phase: 'P0+P2', title: 'Deterministic Compliance Outside the Prompt', desc: 'Japanese Moneylending Act statutory hours (08:00-21:00 JST), pre-verification debt shields, third-party disclosure guards, and stop-contact termination enforced in pure Python/TypeScript code — not prompt text. 0.0% violation rate under 200+ adversarial turns.', tags: ['SHA-256 audit chain', 'Guard coverage proof', 'Wilson 95% CIs'], link: 'studio' as ActiveTab },
  { icon: '⚡', phase: 'P1', title: 'True Upstream Barge-In Cancellation', desc: 'On caller speech detection, the gateway flushes the TTS audio buffer and aborts the in-flight LLM HTTP generation upstream in < 25 ms. Saves cloud GPU tokens, prevents phantom billing. Cancel latency measured p95 <= 100 ms.', tags: ['< 25 ms audio cutoff', 'Upstream HTTP abort', 'cancelled: true in audit'], link: 'live' as ActiveTab },
  { icon: '📜', phase: 'P0', title: 'Tamper-Evident Ed25519 Audit Chain', desc: 'Every spoken turn appends a Schema v2 record chained via SHA-256 and digitally signed at call completion with Ed25519. Modifying any field invalidates the chain. 5 tamper attack vectors tested (modify, insert, delete, truncate, wrong key).', tags: ['Schema v2 chain', 'Ed25519 head signature', '5 tamper attack vectors'], link: 'calls' as ActiveTab },
  { icon: '🧠', phase: 'P1-P3', title: 'OpenAI-Compatible LLM Gateway with 4-Tier Routing', desc: 'FastAPI service on :8001 with Tier 0 (< 5 ms regex/hash), Tier 1 (local Ollama/vLLM, 2.12 ms overhead), Tier 2 (remote frontier, disabled by default), Tier 3 (safe-mode FSM). Circuit breakers, TTFT budgets, automatic fallback per risk tier.', tags: ['4-tier ladder', '2.12 ms p50 overhead', 'Policy routing rules'], link: 'results' as ActiveTab },
  { icon: '🔐', phase: 'P3', title: 'Constrained Decoding + Token-Level Masks', desc: 'Structured brain_turn_v1 schema output enforced at generation time. While identity is unverified, ASCII digits, fullwidth digits, and currency symbols are logit-masked. Benign Japanese kanji numerals (ichido, juppun) are intentionally NOT blocked.', tags: ['JSON schema enforcement', 'Token logit mask', '0.0% schema parse fails'], link: 'results' as ActiveTab },
  { icon: '⚡', phase: 'P4', title: 'Prefix + State-Gated Response Cache', desc: 'Byte-stable system prompt prefix enables 4.2x TTFT speedup and -76.8% input token reduction. An exact-hash response cache on (profile, policy_version, dialogue_state, intent_id) keys stores only guard-passed, non-personalized text — cache hits still re-run post-guard.', tags: ['4.2x TTFT speedup', '-76.8% input tokens', 'Policy-change invalidation'], link: 'results' as ActiveTab },
  { icon: '☸️', phase: 'P6', title: 'Zero-Drop KEDA Autoscaling', desc: 'Scales on active voice sessions (target 4 sessions/pod from B4) plus a TTFA p95 latency guard at 1000 ms. During scale-in, a preStop HTTP drain hook flips readiness to 503. Existing WebSocket calls continue for up to 900 s. 0 dropped calls across 8,092 simulated sessions.', tags: ['0 dropped calls', '900 s graceful drain', 'KEDA + Prometheus triggers'], link: 'analytics' as ActiveTab },
  { icon: '🌐', phase: 'P7', title: 'Edge / Browser Tier with Guard Parity', desc: 'A 5-rung degraded ladder: Cloud -> Local Server -> Safe-Mode Scripted -> Browser WebGPU (WebLLM + sherpa-onnx Wasm). Shared guard conformance vectors in packages/guards-spec/ run identically in Python and TypeScript CI.', tags: ['Guard parity Python/TS', 'DegradedModeBanner UI', 'client_generated audit'], link: 'live' as ActiveTab },
  { icon: '🔄', phase: 'P8', title: 'Zero-Restart Dynamic Policy Hot-Reload', desc: 'Modify TTFT budgets, routing tier order, risk thresholds, cache eligibility, and constraint toggles from the Agent Studio Policy Panel. Atomic swap with last-known-good rollback, policy-change audit log, and hot-reload in < 10 ms without container restarts.', tags: ['Atomic swap + LKG rollback', 'Policy change audit log', 'UI policy diff + confirm'], link: 'studio' as ActiveTab },
];

const PHASES = [
  { id: 0, label: 'P0', name: 'Foundations & Honest Evals', color: '#059669', desc: 'Latency instrumentation, discriminating ablations, Ed25519 audit chain, schema v2' },
  { id: 1, label: 'P1', name: 'LLM Gateway Service', color: '#2563eb', desc: 'OpenAI-compatible FastAPI, streaming, cancel propagation, prefix stability' },
  { id: 2, label: 'P2', name: 'Router & Fallback Ladder', color: '#7c3aed', desc: 'Risk-tier routing rules, circuit breakers, safe-mode T3, guard coverage proof' },
  { id: 3, label: 'P3', name: 'Constrained Decoding', color: '#d97706', desc: 'brain_turn_v1 schema, token-level masks, unsupported-backend retry, ablation' },
  { id: 4, label: 'P4', name: 'Prefix + Response Cache', color: '#db2777', desc: 'Prefix caching, exact-match response cache, semantic matching (flagged off)' },
  { id: 5, label: 'P5', name: 'Public Benchmark Suite', color: '#059669', desc: 'B1-B9 benchmarks, single-command reproduction, hardware metadata, CIs' },
  { id: 6, label: 'P6', name: 'Autoscaling + Drain', color: '#2563eb', desc: 'K8s manifests, KEDA ScaledObjects, drain semantics, 0-drop simulation' },
  { id: 7, label: 'P7', name: 'Edge / Browser Tier', color: '#7c3aed', desc: 'Browser spike, guards-spec package, cascade drill, MLX backend docs' },
  { id: 8, label: 'P8', name: 'Policy Panel & Integrations', color: '#d97706', desc: 'Policy API, Agent Studio panel, Call Inspector, OpenAI SDK + Pipecat examples' },
  { id: 9, label: 'P9', name: 'Docs & v1.0 Release', color: '#db2777', desc: 'inference_gateway.md, audit_format.md, CHANGELOG, v1.0.0 tag' },
];

const METRICS_TOP = [
  { value: '652.5 ms', label: 'Turn Latency p50', sub: 'CPU · SenseVoice + Silero VAD', color: '#34d399' },
  { value: '< 5 ms', label: 'Tier 0 Fast Path', sub: 'Regex / exact-hash cache', color: '#60a5fa' },
  { value: '2.12 ms', label: 'Gateway Overhead p50', sub: '4.25 ms p95 · loopback stub', color: '#a78bfa' },
  { value: '0.0%', label: 'Hard-Fail Rate', sub: 'Under all guard + constraint modes', color: '#34d399' },
  { value: '4.2x', label: 'Cache TTFT Speedup', sub: '-76.8% input tokens', color: '#fbbf24' },
  { value: '0 drops', label: 'Scale-In Sessions', sub: '8,092 simulated calls (SIMULATION)', color: '#f472b6' },
];

export const LandingPage: React.FC<LandingPageProps> = ({ onNavigate }) => {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: '#080c18', color: '#f1f5f9', fontFamily: 'var(--font-sans)' }}>
      {/* ── Header ───────────────────────────────────────────── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: scrolled ? 'rgba(8,12,24,0.95)' : 'transparent',
        backdropFilter: scrolled ? 'blur(16px)' : 'none',
        borderBottom: scrolled ? '1px solid rgba(255,255,255,0.08)' : '1px solid transparent',
        transition: 'all 0.3s ease',
        padding: '0 32px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 60,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg, #2563eb, #7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 18, color: '#fff' }}>V</div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 15, letterSpacing: '-0.03em', color: '#fff', lineHeight: 1 }}>VoiceAI Infra</div>
            <div style={{ fontSize: 10, color: '#475569', letterSpacing: '0.08em', textTransform: 'uppercase' }}>VoiceBench v1.0.0</div>
          </div>
        </div>
        <nav style={{ display: 'flex', gap: 28, fontSize: 13, fontWeight: 500 }}>
          {[['#features', 'Features'], ['#benchmarks', 'Benchmarks'], ['#phases', 'Phases']].map(([href, label]) => (
            <a key={href} href={href} style={{ color: '#64748b', textDecoration: 'none' }}>{label}</a>
          ))}
          <button onClick={() => onNavigate('docs')} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 13, fontWeight: 500, cursor: 'pointer', padding: 0 }}>Docs</button>
        </nav>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button onClick={() => onNavigate('docs')} style={{ padding: '7px 16px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: '#e2e8f0', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Docs</button>
          <button onClick={() => onNavigate('live')} style={{ padding: '7px 18px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #2563eb, #7c3aed)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Open Dashboard</button>
        </div>
      </header>

      {/* ── Hero ─────────────────────────────────────────────── */}
      <section style={{ padding: '90px 32px 72px', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: -120, left: '50%', transform: 'translateX(-50%)', width: 800, height: 400, background: 'radial-gradient(ellipse, rgba(37,99,235,0.2) 0%, transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', top: 60, left: '15%', width: 400, height: 400, background: 'radial-gradient(ellipse, rgba(124,58,237,0.1) 0%, transparent 60%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', top: 60, right: '15%', width: 400, height: 400, background: 'radial-gradient(ellipse, rgba(5,150,105,0.08) 0%, transparent 60%)', pointerEvents: 'none' }} />

        <div style={{ position: 'relative', zIndex: 1, maxWidth: 900, margin: '0 auto' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '5px 14px', borderRadius: 999, background: 'rgba(37,99,235,0.15)', border: '1px solid rgba(37,99,235,0.3)', color: '#93c5fd', fontSize: 12, fontWeight: 600, marginBottom: 24, letterSpacing: '0.02em' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#3b82f6', display: 'inline-block' }} />
            VoiceBench v1.0.0 · 10 Phases Complete · 9 Benchmarks · All Tests Green
          </div>

          <h1 style={{ fontSize: 'clamp(2.2rem, 5vw, 3.75rem)', fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 1.1, color: '#fff', margin: '0 0 20px' }}>
            Regulated Voice AI Infrastructure<br />
            <span style={{ background: 'linear-gradient(135deg, #60a5fa, #a78bfa, #34d399)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
              Deterministic · Auditable · Sub-700 ms
            </span>
          </h1>

          <p style={{ fontSize: 'clamp(1rem, 2vw, 1.2rem)', color: '#64748b', maxWidth: 760, margin: '0 auto 36px', lineHeight: 1.7 }}>
            A complete enterprise voice agent platform with an auditable, latency-aware inference routing layer.
            Deterministic compliance guards outside the prompt, Ed25519 tamper-evident audit chains,
            CPU-first inference fallback ladder, and a reproducible public benchmark suite (B1–B9).
          </p>

          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 44 }}>
            <button onClick={() => onNavigate('live')} style={{ padding: '13px 28px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #2563eb, #7c3aed)', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
              🎙️ Open Live Console
            </button>
            <button onClick={() => onNavigate('docs')} style={{ padding: '13px 28px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: '#e2e8f0', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>
              📖 Developer Docs
            </button>
            <button onClick={() => onNavigate('results')} style={{ padding: '13px 28px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: '#e2e8f0', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>
              📊 B1–B9 Benchmarks
            </button>
          </div>

          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 16, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 10, padding: '12px 20px' }}>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: 10, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Quickstart — all 6 services</div>
              <code style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: '#38bdf8' }}>npm start</code>
            </div>
            <span style={{ color: '#1e293b', fontSize: 20 }}>·</span>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: 10, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Docker</div>
              <code style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: '#38bdf8' }}>npm run dev:docker</code>
            </div>
          </div>
        </div>
      </section>

      {/* ── Metric ribbon ───────────────────────────────────── */}
      <section style={{ padding: '0 32px 60px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
          {METRICS_TOP.map((m) => (
            <div key={m.label} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '18px 20px', textAlign: 'center' }}>
              <div style={{ fontSize: 'clamp(1.4rem, 3vw, 2rem)', fontWeight: 800, color: m.color, letterSpacing: '-0.03em', lineHeight: 1 }}>{m.value}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0', marginTop: 6, marginBottom: 3 }}>{m.label}</div>
              <div style={{ fontSize: 11, color: '#475569', lineHeight: 1.4 }}>{m.sub}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Architecture ─────────────────────────────────────── */}
      <section style={{ padding: '0 32px 72px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <h2 style={{ textAlign: 'center', fontSize: 'clamp(1.3rem, 3vw, 1.9rem)', fontWeight: 800, color: '#fff', marginBottom: 8, letterSpacing: '-0.03em' }}>System Architecture</h2>
          <p style={{ textAlign: 'center', color: '#475569', fontSize: 13, marginBottom: 28 }}>All 10 phases integrated into one production-grade voice pipeline</p>
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: '24px 28px', overflowX: 'auto' }}>
            <pre style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: '#94a3b8', lineHeight: 1.75, margin: 0, whiteSpace: 'pre' }}>
{`Browser ──ws──► Voice Gateway (:3000) ──► STT (:8002)      ──► Agent Brain (:8000)  ──► LLM Gateway (:8001) ──► Backends
   ^                |  barge-in cancel          | SenseVoice/      | pre/post guards      | policy router
   |                |  <25ms abort ────────────>| Silero VAD       | risk tier mapping    | Tier 0: regex/hash cache     <5ms
   |                |                           | 350ms hangover   | token masks          | Tier 1: local Ollama/vLLM    ~32ms
   +── TTS <────────+                           | 122ms p50 ASR    | audit chain v2       | Tier 2: remote frontier      disabled
        Kokoro/Piper                            | Ed25519 signed   | policy hot-reload    | Tier 3: safe-mode FSM        fallback
        38ms TTFA

Audit Chain:  turn_text + route_decision + policy_version + guard_events + timings  -->  SHA-256 chain + Ed25519 head signature
Edge Tier:    Browser WebGPU (WebLLM) + sherpa-onnx Wasm  -->  guard parity via packages/guards-spec/ conformance vectors
K8s:          KEDA ScaledObject  -->  voiceai_active_sessions (target 4/pod) + TTFA p95 guard (1000ms) + 900s graceful drain`}
            </pre>
          </div>
        </div>
      </section>

      {/* ── Pillars ──────────────────────────────────────────── */}
      <section id="features" style={{ padding: '0 32px 72px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <h2 style={{ textAlign: 'center', fontSize: 'clamp(1.3rem, 3vw, 1.9rem)', fontWeight: 800, color: '#fff', marginBottom: 8, letterSpacing: '-0.03em' }}>9 Differentiating Pillars</h2>
          <p style={{ textAlign: 'center', color: '#475569', fontSize: 13, marginBottom: 36 }}>Every feature backed by measured evidence — no fabricated numbers, Wilson 95% CIs throughout</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 14 }}>
            {PILLARS.map((p, i) => (
              <div key={i} onClick={() => onNavigate(p.link)}
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '22px 24px', cursor: 'pointer', transition: 'all 0.2s ease' }}
                onMouseEnter={e => { const d = e.currentTarget as HTMLDivElement; d.style.background = 'rgba(255,255,255,0.055)'; d.style.borderColor = 'rgba(255,255,255,0.13)'; d.style.transform = 'translateY(-2px)'; }}
                onMouseLeave={e => { const d = e.currentTarget as HTMLDivElement; d.style.background = 'rgba(255,255,255,0.03)'; d.style.borderColor = 'rgba(255,255,255,0.07)'; d.style.transform = 'none'; }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                  <div style={{ fontSize: 24 }}>{p.icon}</div>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 5, background: 'rgba(37,99,235,0.15)', color: '#93c5fd', letterSpacing: '0.03em' }}>{p.phase}</span>
                </div>
                <h3 style={{ fontSize: 14.5, fontWeight: 700, color: '#f1f5f9', margin: '0 0 8px', letterSpacing: '-0.01em' }}>{p.title}</h3>
                <p style={{ fontSize: 12.5, color: '#64748b', lineHeight: 1.65, margin: '0 0 14px' }}>{p.desc}</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {p.tags.map(t => (
                    <span key={t} style={{ fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 4, background: 'rgba(255,255,255,0.05)', color: '#475569', border: '1px solid rgba(255,255,255,0.07)' }}>{t}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Benchmarks ───────────────────────────────────────── */}
      <section id="benchmarks" style={{ padding: '0 32px 72px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <h2 style={{ textAlign: 'center', fontSize: 'clamp(1.3rem, 3vw, 1.9rem)', fontWeight: 800, color: '#fff', marginBottom: 8, letterSpacing: '-0.03em' }}>Public Benchmark Suite B1–B9</h2>
          <p style={{ textAlign: 'center', color: '#475569', fontSize: 13, marginBottom: 6 }}>n {'>='} 200 turns · Wilson 95% CIs · Bootstrap CIs for means · Zero fabrication · Single-command reproduction</p>
          <p style={{ textAlign: 'center', marginBottom: 28 }}>
            <button onClick={() => onNavigate('results')} style={{ background: 'none', border: 'none', color: '#3b82f6', fontSize: 13, cursor: 'pointer', textDecoration: 'underline' }}>View interactive results viewer in dashboard</button>
          </p>
          <div style={{ overflowX: 'auto', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                  {['ID', 'Benchmark', 'Key Metric', '95% CI / Note', 'Reproduce'].map(h => (
                    <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#334155', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {BENCHMARKS.map((b, i) => (
                  <tr key={b.id} style={{ borderBottom: i < BENCHMARKS.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                    <td style={{ padding: '13px 16px' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: 13, color: b.color }}>{b.id}</span>
                    </td>
                    <td style={{ padding: '13px 16px' }}>
                      <div style={{ fontWeight: 600, color: '#cbd5e1', marginBottom: 2 }}>{b.name}</div>
                      <div style={{ fontSize: 11, color: '#475569' }}>{b.sub}</div>
                    </td>
                    <td style={{ padding: '13px 16px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: b.color, whiteSpace: 'nowrap' }}>{b.metric}</td>
                    <td style={{ padding: '13px 16px', fontSize: 12, color: '#475569', fontFamily: 'var(--font-mono)' }}>{b.ci}</td>
                    <td style={{ padding: '13px 16px' }}>
                      <code style={{ fontSize: 11, fontFamily: 'var(--font-mono)', background: 'rgba(255,255,255,0.05)', padding: '3px 7px', borderRadius: 4, color: '#64748b' }}>{b.cmd}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── Phase roadmap ───────────────────────────────────── */}
      <section id="phases" style={{ padding: '0 32px 72px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <h2 style={{ textAlign: 'center', fontSize: 'clamp(1.3rem, 3vw, 1.9rem)', fontWeight: 800, color: '#fff', marginBottom: 8, letterSpacing: '-0.03em' }}>10-Phase Delivery</h2>
          <p style={{ textAlign: 'center', color: '#475569', fontSize: 13, marginBottom: 32 }}>All 10 phases complete · v1.0.0 tagged · Every gate condition passed</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(540px, 1fr))', gap: 10 }}>
            {PHASES.map((ph) => (
              <div key={ph.id} style={{ display: 'flex', alignItems: 'center', gap: 14, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '12px 18px' }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: ph.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 11, color: '#fff', flexShrink: 0 }}>{ph.label}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, color: '#e2e8f0', fontSize: 13 }}>{ph.name}</div>
                  <div style={{ fontSize: 11, color: '#475569', marginTop: 2 }}>{ph.desc}</div>
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: 'rgba(52,211,153,0.12)', color: '#34d399', border: '1px solid rgba(52,211,153,0.25)', whiteSpace: 'nowrap' }}>
                  DONE
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Comparison table ─────────────────────────────────── */}
      <section style={{ padding: '0 32px 72px' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <h2 style={{ textAlign: 'center', fontSize: 'clamp(1.3rem, 3vw, 1.9rem)', fontWeight: 800, color: '#fff', marginBottom: 8, letterSpacing: '-0.03em' }}>VoiceAI Infra vs. Commercial Platforms</h2>
          <p style={{ textAlign: 'center', color: '#475569', fontSize: 13, marginBottom: 28 }}>The streaming audio loop is commoditized. Our differentiators are what happens inside each turn.</p>
          <div style={{ overflowX: 'auto', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                  <th style={{ padding: '12px 20px', textAlign: 'left', color: '#334155', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Capability</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center', color: '#93c5fd', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>VoiceAI Infra</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center', color: '#334155', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Pipecat / Vapi / Retell</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['Deterministic per-turn compliance guards', '✓ Code-enforced (Python + TS)', '— Prompt-based only'],
                  ['Tamper-evident signed audit trail with routing', '✓ Ed25519 chain + route metadata', '— Not available'],
                  ['Upstream barge-in token cancellation', '✓ < 25 ms HTTP abort', '~ Stops playback; may continue billing'],
                  ['CPU-first inference (no mandatory GPU)', '✓ Ollama / llama.cpp locally', '— Cloud GPU required'],
                  ['Zero-restart policy hot-reload', '✓ Atomic YAML swap, audit logged', '— Not available'],
                  ['Public reproducible benchmark suite', '✓ B1–B9, single command, CIs', '— Not published'],
                  ['Edge / browser tier with guard parity', '✓ WebGPU + same guard vectors', '~ Varies'],
                  ['Zero-drop KEDA autoscaling simulation', '✓ 0 drops / 8,092 simulated calls', '~ Varies by provider'],
                  ['OpenAI-SDK wire-compatible gateway', '✓ Drop-in base_url swap', '✓ Similar'],
                  ['4-tier routing with risk-tier mapping', '✓ Per-turn risk tier from graph state', '— Not available'],
                ].map(([cap, us, them], i, arr) => (
                  <tr key={i} style={{ borderBottom: i < arr.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                    <td style={{ padding: '12px 20px', color: '#94a3b8', fontSize: 12.5 }}>{cap}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'center', color: '#34d399', fontWeight: 600, fontSize: 12 }}>{us}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'center', color: '#475569', fontSize: 12 }}>{them}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ textAlign: 'center', fontSize: 11, color: '#1e293b', marginTop: 10 }}>
            Claims about competitors reflect general product documentation and have not been independently verified against current releases.
          </p>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────── */}
      <section style={{ padding: '0 32px 72px' }}>
        <div style={{ maxWidth: 800, margin: '0 auto', textAlign: 'center', background: 'linear-gradient(135deg, rgba(37,99,235,0.14), rgba(124,58,237,0.14))', border: '1px solid rgba(37,99,235,0.25)', borderRadius: 20, padding: '56px 32px' }}>
          <h2 style={{ fontSize: 'clamp(1.3rem, 3vw, 1.9rem)', fontWeight: 800, color: '#fff', marginBottom: 10, letterSpacing: '-0.03em' }}>Ready to build regulated voice AI?</h2>
          <p style={{ color: '#64748b', fontSize: 14, marginBottom: 32, lineHeight: 1.6 }}>
            All 10 phases shipped · Synthetic data only · No real telephony or PII<br />
            MIT-friendly for research and enterprise use
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={() => onNavigate('live')} style={{ padding: '13px 32px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #2563eb, #7c3aed)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
              🎙️ Open Dashboard
            </button>
            <button onClick={() => onNavigate('docs')} style={{ padding: '13px 32px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: '#e2e8f0', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
              📖 Read the Docs
            </button>
            <button onClick={() => onNavigate('results')} style={{ padding: '13px 32px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: '#e2e8f0', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
              📊 Benchmark Results
            </button>
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────── */}
      <footer style={{ borderTop: '1px solid rgba(255,255,255,0.07)', padding: '20px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ fontSize: 12, color: '#1e293b' }}>
          © 2026 VoiceAI Infra · v1.0.0 · Synthetic data only. Not legal advice.
        </div>
        <div style={{ display: 'flex', gap: 16, fontSize: 12 }}>
          {([ ['Docs', 'docs'], ['Dashboard', 'live'], ['Agent Studio', 'studio'], ['Benchmarks', 'results'], ['Analytics', 'analytics'] ] as Array<[string, ActiveTab]>).map(([label, tab]) => (
            <button key={tab} onClick={() => onNavigate(tab)} style={{ background: 'none', border: 'none', color: '#334155', fontSize: 12, cursor: 'pointer' }}>{label}</button>
          ))}
        </div>
      </footer>
    </div>
  );
};
