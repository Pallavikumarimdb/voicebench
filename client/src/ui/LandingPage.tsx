import React from 'react';
import { ActiveTab } from './Navbar.tsx';

interface LandingPageProps {
  onNavigate: (tab: ActiveTab) => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onNavigate }) => {
  return (
    <div className="landing-page" style={{ maxWidth: 1200, margin: '0 auto', paddingBottom: 60 }}>
      {/* Hero Section */}
      <div
        style={{
          padding: '64px 32px 48px',
          textAlign: 'center',
          background: 'radial-gradient(ellipse at 50% -20%, rgba(59, 130, 246, 0.15), transparent 70%)',
          borderRadius: 16,
          marginBottom: 32,
          border: '1px solid var(--border-subtle, #e5e7eb)'
        }}
      >
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '4px 12px',
            borderRadius: 20,
            background: 'rgba(59, 130, 246, 0.1)',
            color: '#2563eb',
            fontSize: '0.85rem',
            fontWeight: 600,
            marginBottom: 20
          }}
        >
          <span>🚀 VoiceBench v1.0.0 Public Release</span>
          <span style={{ opacity: 0.5 }}>•</span>
          <span>Regulated Voice Infrastructure</span>
        </div>

        <h1
          style={{
            fontSize: '2.75rem',
            fontWeight: 850,
            letterSpacing: '-0.03em',
            lineHeight: 1.15,
            color: 'var(--text-primary, #0f172a)',
            marginBottom: 18
          }}
        >
          Deterministic Voice AI Infrastructure <br />
          <span style={{ color: '#2563eb' }}>Sub-700ms Turn Latency · Zero-Drop Scale-In</span>
        </h1>

        <p
          style={{
            fontSize: '1.15rem',
            color: 'var(--text-secondary, #475569)',
            maxWidth: 780,
            margin: '0 auto 28px',
            lineHeight: 1.6
          }}
        >
          An enterprise streaming voice platform and public inference benchmark suite. Built with deterministic
          regulatory guards outside the prompt, true upstream barge-in cancellation, tamper-evident Ed25519 hash chaining,
          and a CPU-first local inference ladder.
        </p>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            className="btn btn-primary"
            onClick={() => onNavigate('live')}
            style={{ padding: '12px 24px', fontSize: '1rem', fontWeight: 650, borderRadius: 8 }}
          >
            🎙️ Start Live Voice Call
          </button>
          <button
            className="btn"
            onClick={() => onNavigate('results')}
            style={{ padding: '12px 24px', fontSize: '1rem', fontWeight: 650, borderRadius: 8 }}
          >
            📊 View B1–B7 Benchmarks
          </button>
          <button
            className="btn"
            onClick={() => onNavigate('docs')}
            style={{ padding: '12px 24px', fontSize: '1rem', fontWeight: 650, borderRadius: 8 }}
          >
            📖 Developer Documentation
          </button>
        </div>
      </div>

      {/* Metrics Anatomy Ribbon */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 16,
          marginBottom: 48
        }}
      >
        <div className="card card-pad" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: '#059669' }}>652.5 ms</div>
          <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>Turn Latency ($p_{50}$ CPU)</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>Sherpa SenseVoice + Silero VAD</div>
        </div>
        <div className="card card-pad" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: '#2563eb' }}>&lt; 5 ms</div>
          <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>Tier 0 Exact Fast Path</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>Regex & exact-hash response cache</div>
        </div>
        <div className="card card-pad" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: '#7c3aed' }}>0.0% Drops</div>
          <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>Zero-Drop Scale-In</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>900s grace period + preStop drain</div>
        </div>
        <div className="card card-pad" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: '#d97706' }}>100% Guarded</div>
          <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>Regulation Outside Prompt</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>Kanji, Zenkaku, statutory hours</div>
        </div>
      </div>

      {/* Pillars Section */}
      <div style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: '1.75rem', fontWeight: 800, textAlign: 'center', marginBottom: 28 }}>
          Why VoiceAI Infra & VoiceBench?
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 }}>
          <div className="card card-pad">
            <div style={{ fontSize: '1.5rem', marginBottom: 12 }}>🛡️</div>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: '0 0 8px' }}>
              Deterministic Compliance Outside Prompt
            </h3>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              LLM system prompts drift and hallucinate under adversarial jailbreaks. VoiceAI Infra enforces Japanese
              statutory calling hours (08:00–21:00 JST), third-party disclosure prohibitions, and pre-verification debt shields
              outside the model in pure code. 0.0% failure rate with guards active vs 95.0% violation rate when ablated.
            </p>
          </div>

          <div className="card card-pad">
            <div style={{ fontSize: '1.5rem', marginBottom: 12 }}>⚡</div>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: '0 0 8px' }}>
              True Upstream Barge-In Cancellation
            </h3>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Commercial voice gateways stop speaking but keep billing cloud tokens in the background. When the caller speaks,
              our gateway immediately flushes the client audio queue and cancels in-flight LLM HTTP generation upstream in
              &lt; 25 ms, conserving GPU memory and reducing token waste.
            </p>
          </div>

          <div className="card card-pad">
            <div style={{ fontSize: '1.5rem', marginBottom: 12 }}>📜</div>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: '0 0 8px' }}>
              Tamper-Evident Ed25519 Audit Chain
            </h3>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Every spoken turn appends an immutable Schema v2 record chained via SHA-256 hashes and digitally signed
              at call completion with Ed25519. Modifying a single character or timestamp invalidates the chain. Verified
              with the built-in CLI verifier.
            </p>
          </div>

          <div className="card card-pad">
            <div style={{ fontSize: '1.5rem', marginBottom: 12 }}>📉</div>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: '0 0 8px' }}>
              CPU-First Local Fallback Ladder
            </h3>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Traverse seamlessly from Tier 0 (Fast Path / Cache) to Tier 1 (Local CPU Ollama/vLLM) to Tier 2 (Remote Frontier)
              and Tier 3 (Deterministic Safe-Mode Scripted FSM). Includes an edge browser WebGPU tier using WebLLM and Wasm Zipformer.
            </p>
          </div>

          <div className="card card-pad">
            <div style={{ fontSize: '1.5rem', marginBottom: 12 }}>☸️</div>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: '0 0 8px' }}>
              Zero-Drop KEDA Autoscaling
            </h3>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Scales against active concurrent voice sessions (target: 4 calls / pod) with a 1000ms TTFA latency guard.
              During scale-in, a preStop HTTP drain hook flips readiness to 503 to halt incoming routing, allowing active
              calls up to 900s to finish naturally without dropping.
            </p>
          </div>

          <div className="card card-pad">
            <div style={{ fontSize: '1.5rem', marginBottom: 12 }}>🔄</div>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: '0 0 8px' }}>
              Zero-Restart Dynamic Policy Hot-Reload
            </h3>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Modify routing thresholds, TTFT budgets, exact cache rules, and model tiers via the in-UI Agent Studio Policy Panel.
              Changes hot-reload into the LLM Gateway instantly without container restarts, with atomic file swap and last-known-good rollback.
            </p>
          </div>
        </div>
      </div>

      {/* Quickstart Callout */}
      <div
        className="card card-pad"
        style={{
          background: 'var(--surface-dark, #0f172a)',
          color: '#f8fafc',
          borderRadius: 12,
          padding: 24,
          display: 'flex',
          flexDirection: 'column',
          gap: 16
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>Single-Command Quickstart</h3>
            <div style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
              Start the full 6-microservice pipeline with one terminal command.
            </div>
          </div>
          <button
            className="btn btn-sm"
            onClick={() => onNavigate('docs')}
            style={{ background: '#3b82f6', color: '#fff', border: 'none' }}
          >
            Read Integration Guide →
          </button>
        </div>

        <pre
          className="mono"
          style={{
            margin: 0,
            padding: '14px 18px',
            background: '#020617',
            borderRadius: 8,
            fontSize: '0.9rem',
            color: '#38bdf8',
            overflowX: 'auto'
          }}
        >
          {`# Clone & run all services locally (Agent + Gateway + STT + TTS + LLM Gateway + Client)
npm start

# Or run in full containerized Docker environment:
npm run dev:docker`}
        </pre>
      </div>
    </div>
  );
};
