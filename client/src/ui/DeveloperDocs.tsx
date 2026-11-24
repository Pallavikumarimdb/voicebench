import React, { useState } from 'react';
import { ActiveTab } from './Navbar.tsx';

interface DeveloperDocsProps {
  onNavigate: (tab: ActiveTab) => void;
}

type SectionKey = 'architecture' | 'quickstart' | 'guards' | 'policy' | 'audit' | 'integrations' | 'benchmarks';

interface NavSection {
  id: SectionKey;
  title: string;
  badge?: string;
}

const SECTIONS: NavSection[] = [
  { id: 'architecture', title: '1. Architecture & Services', badge: 'Core' },
  { id: 'quickstart', title: '2. Quickstart & Deployment', badge: 'CLI' },
  { id: 'guards', title: '3. Compliance Guards', badge: 'Deterministic' },
  { id: 'policy', title: '4. Dynamic Policy Engine', badge: 'Hot-Reload' },
  { id: 'audit', title: '5. Tamper-Evident Audit', badge: 'Ed25519' },
  { id: 'integrations', title: '6. SDK & Pipecat Bridge', badge: 'Examples' },
  { id: 'benchmarks', title: '7. Inference Benchmarks', badge: 'B1–B7' },
];

export const DeveloperDocs: React.FC<DeveloperDocsProps> = ({ onNavigate }) => {
  const [activeSection, setActiveSection] = useState<SectionKey>('architecture');

  return (
    <div className="developer-docs page" style={{ maxWidth: 1200, margin: '0 auto', paddingBottom: 60 }}>
      {/* Header Banner */}
      <div
        className="card card-pad"
        style={{
          background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.08) 0%, rgba(124, 58, 237, 0.05) 100%)',
          border: '1px solid rgba(59, 130, 246, 0.2)',
          marginBottom: 24,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 16
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span className="badge badge-info mono">DOCUMENTATION</span>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>VoiceAI Infrastructure v1.0.0</span>
          </div>
          <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 800 }}>Developer & Operations Guide</h1>
          <p style={{ margin: '6px 0 0', fontSize: '0.95rem', color: 'var(--text-secondary)' }}>
            Complete architectural reference, API specifications, and operational playbooks for VoiceBench.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-sm" onClick={() => onNavigate('home')}>
            ← Back to Overview
          </button>
          <button className="btn btn-sm btn-primary" onClick={() => onNavigate('live')}>
            Launch Live Studio 🎙️
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 24, alignItems: 'start' }}>
        {/* Navigation Sidebar */}
        <div className="card" style={{ padding: 12, position: 'sticky', top: 20 }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-tertiary)', padding: '6px 10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Sections
          </div>
          <nav style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {SECTIONS.map((sec) => (
              <button
                key={sec.id}
                onClick={() => setActiveSection(sec.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  borderRadius: 6,
                  border: 'none',
                  background: activeSection === sec.id ? 'var(--bg-hover, rgba(59, 130, 246, 0.1))' : 'transparent',
                  color: activeSection === sec.id ? '#2563eb' : 'var(--text-primary)',
                  fontWeight: activeSection === sec.id ? 700 : 500,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s ease'
                }}
              >
                <span>{sec.title}</span>
                {sec.badge && (
                  <span
                    style={{
                      fontSize: '0.7rem',
                      padding: '2px 6px',
                      borderRadius: 4,
                      background: activeSection === sec.id ? '#2563eb' : 'var(--surface-sunken, #f1f5f9)',
                      color: activeSection === sec.id ? '#fff' : 'var(--text-tertiary)',
                      fontWeight: 600
                    }}
                  >
                    {sec.badge}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>

        {/* Content Body */}
        <div style={{ minWidth: 0 }}>
          {activeSection === 'architecture' && (
            <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <h2 style={{ margin: '0 0 8px', fontSize: '1.4rem', fontWeight: 800 }}>1. Architecture & Port Mapping</h2>
                <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.6 }}>
                  VoiceBench is composed of six independent, lightweight microservices coordinated via high-performance WebSockets and HTTP streaming.
                </p>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border-subtle, #e2e8f0)', textAlign: 'left' }}>
                      <th style={{ padding: '8px 12px' }}>Service</th>
                      <th style={{ padding: '8px 12px' }}>Port</th>
                      <th style={{ padding: '8px 12px' }}>Protocol</th>
                      <th style={{ padding: '8px 12px' }}>Responsibilities</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr style={{ borderBottom: '1px solid var(--border-subtle, #f1f5f9)' }}>
                      <td style={{ padding: '8px 12px', fontWeight: 650 }}>Voice Gateway</td>
                      <td style={{ padding: '8px 12px' }}><code className="mono">3000</code></td>
                      <td style={{ padding: '8px 12px' }}>WS / HTTP</td>
                      <td style={{ padding: '8px 12px' }}>Audio orchestration, barge-in cancellation, PSTN/Twilio bridge, graceful drain.</td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid var(--border-subtle, #f1f5f9)' }}>
                      <td style={{ padding: '8px 12px', fontWeight: 650 }}>Agent Service</td>
                      <td style={{ padding: '8px 12px' }}><code className="mono">8000</code></td>
                      <td style={{ padding: '8px 12px' }}>HTTP / SSE</td>
                      <td style={{ padding: '8px 12px' }}>Turn state machine, deterministic compliance guards, tool dispatch, tamper-evident audit.</td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid var(--border-subtle, #f1f5f9)' }}>
                      <td style={{ padding: '8px 12px', fontWeight: 650 }}>LLM Gateway</td>
                      <td style={{ padding: '8px 12px' }}><code className="mono">8001</code></td>
                      <td style={{ padding: '8px 12px' }}>HTTP SSE</td>
                      <td style={{ padding: '8px 12px' }}>Tier 0 cache, Tier 1 local Ollama/vLLM routing, Tier 2 frontier fallback, token masking.</td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid var(--border-subtle, #f1f5f9)' }}>
                      <td style={{ padding: '8px 12px', fontWeight: 650 }}>STT Service</td>
                      <td style={{ padding: '8px 12px' }}><code className="mono">8002</code></td>
                      <td style={{ padding: '8px 12px' }}>WS / HTTP</td>
                      <td style={{ padding: '8px 12px' }}>Silero VAD, Sherpa ONNX SenseVoice / Zipformer streaming transcription.</td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid var(--border-subtle, #f1f5f9)' }}>
                      <td style={{ padding: '8px 12px', fontWeight: 650 }}>TTS Service</td>
                      <td style={{ padding: '8px 12px' }}><code className="mono">8003</code></td>
                      <td style={{ padding: '8px 12px' }}>HTTP Stream</td>
                      <td style={{ padding: '8px 12px' }}>Kokoro / Piper ONNX streaming speech synthesis with sentence chunking.</td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid var(--border-subtle, #f1f5f9)' }}>
                      <td style={{ padding: '8px 12px', fontWeight: 650 }}>Client UI</td>
                      <td style={{ padding: '8px 12px' }}><code className="mono">5173</code></td>
                      <td style={{ padding: '8px 12px' }}>Vite SPA</td>
                      <td style={{ padding: '8px 12px' }}>Agent Studio, live call monitoring, latency breakdown, audit inspector.</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 8 }}>Turn Execution Pipeline</h3>
                <pre className="mono" style={{ padding: 14, background: 'var(--surface-sunken, #f8fafc)', borderRadius: 8, fontSize: '0.8rem', lineHeight: 1.5, overflowX: 'auto' }}>
{`User Speech ─▶ Silero VAD (350ms hangover)
               │
               ▼
        SenseVoice STT (122ms p50)
               │
               ▼
  Deterministic Compliance Pre-Guard (0.3ms)  ──[Violation]─▶ Fixed Safe Script (Tier 3)
               │
               ▼
        LLM Inference Gateway
        ├── Tier 0: Regex / Exact Hash Cache (<5ms)
        ├── Tier 1: Local Ollama / vLLM Qwen 2.5 (180ms TTFT)
        └── Tier 2: Remote Frontier API (Fallback)
               │
               ▼
  Deterministic Compliance Post-Guard (0.2ms) ──[PII / Leak]─▶ Masked / Safe Output
               │
               ▼
        Kokoro TTS Synthesis (38ms TTFA)
               │
               ▼
  Audio Output Buffer ─▶ Caller Speaker
  (Instantly cancelled in <25ms on caller barge-in)`}
                </pre>
              </div>
            </div>
          )}

          {activeSection === 'quickstart' && (
            <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <h2 style={{ margin: '0 0 8px', fontSize: '1.4rem', fontWeight: 800 }}>2. Quickstart & Deployment</h2>
                <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                  Run all six services locally with one unified command or deploy containerized onto Kubernetes.
                </p>
              </div>

              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 6 }}>Option A: Local Development (All-in-One)</h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 8 }}>
                  Spawns all processes concurrently with colored prefixes and unified graceful shutdown (<code className="mono">Ctrl+C</code>):
                </p>
                <pre className="mono" style={{ padding: 12, background: 'var(--surface-sunken, #f8fafc)', borderRadius: 8, fontSize: '0.85rem', color: '#0369a1' }}>
{`# Starts Gateway (:3000), Agent (:8000), LLM (:8001), STT (:8002), TTS (:8003), Client (:5173)
npm start

# Or directly using Python process supervisor:
python scripts/start_all.py --mode all`}
                </pre>
              </div>

              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 6 }}>Option B: Docker Compose</h3>
                <pre className="mono" style={{ padding: 12, background: 'var(--surface-sunken, #f8fafc)', borderRadius: 8, fontSize: '0.85rem', color: '#0369a1' }}>
{`npm run dev:docker
# Or: docker compose up --build`}
                </pre>
              </div>

              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 6 }}>Option C: Kubernetes with Zero-Drop KEDA Autoscaling</h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 8 }}>
                  Deploys to your K8s cluster with preStop hooks and automated session-based autoscaling:
                </p>
                <pre className="mono" style={{ padding: 12, background: 'var(--surface-sunken, #f8fafc)', borderRadius: 8, fontSize: '0.85rem', color: '#0369a1' }}>
{`# Base deployment (CPU-first)
kubectl apply -k deploy/k8s/base/

# Optional GPU overlay for high-throughput vLLM
kubectl apply -k deploy/k8s/overlays/gpu/`}
                </pre>
              </div>
            </div>
          )}

          {activeSection === 'guards' && (
            <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <h2 style={{ margin: '0 0 8px', fontSize: '1.4rem', fontWeight: 800 }}>3. Deterministic Compliance Guards</h2>
                <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.6 }}>
                  LLMs hallucinate and can be jailbroken under adversarial prompts. VoiceBench implements statutory compliance in pure, verifiable code outside the model context.
                </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
                <div style={{ padding: 14, background: 'var(--surface-sunken, #f8fafc)', borderRadius: 8, border: '1px solid var(--border-subtle, #e2e8f0)' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: 4 }}>🕒 Statutory Calling Hours</div>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    Enforces Japanese Moneylending Act calling hours (08:00–21:00 JST). Calls outside this window are automatically rejected before connecting to the caller.
                  </p>
                </div>
                <div style={{ padding: 14, background: 'var(--surface-sunken, #f8fafc)', borderRadius: 8, border: '1px solid var(--border-subtle, #e2e8f0)' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: 4 }}>🛡️ Pre-Verification Debt Shield</div>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    Prevents disclosure of debt balances, delinquency days, or personal identifiers until 2 of 3 identity factors (DOB, phone, name) are verified.
                  </p>
                </div>
                <div style={{ padding: 14, background: 'var(--surface-sunken, #f8fafc)', borderRadius: 8, border: '1px solid var(--border-subtle, #e2e8f0)' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: 4 }}>🛑 Third-Party Disclosure Guard</div>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    If a spouse, colleague, or roommate answers, the agent masks all debt mentions and requests a callback without revealing account details.
                  </p>
                </div>
                <div style={{ padding: 14, background: 'var(--surface-sunken, #f8fafc)', borderRadius: 8, border: '1px solid var(--border-subtle, #e2e8f0)' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: 4 }}>❌ Stop-Contact Immediate Termination</div>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    If the borrower states "do not call" or hires legal counsel, the call immediately records a revocation event and hangs up cleanly.
                  </p>
                </div>
              </div>

              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 8 }}>Cross-Language Guard Conformance</h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 8 }}>
                  Shared specification in <code className="mono">packages/guards-spec/</code> tested identically against both TypeScript and Python runtimes:
                </p>
                <pre className="mono" style={{ padding: 12, background: 'var(--surface-sunken, #f8fafc)', borderRadius: 8, fontSize: '0.85rem' }}>
{`npm --prefix packages/guards-spec test
pytest services/agent/tests/test_conformance_guards.py`}
                </pre>
              </div>
            </div>
          )}

          {activeSection === 'policy' && (
            <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <h2 style={{ margin: '0 0 8px', fontSize: '1.4rem', fontWeight: 800 }}>4. Dynamic Policy Engine & Hot-Reload</h2>
                <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.6 }}>
                  Update routing policies, latency SLA targets, and fast-path cache triggers in real time without downtime or container restarts.
                </p>
              </div>

              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 6 }}>Hot-Reload Architecture</h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  The LLM Gateway exposes an authenticated admin endpoint (<code className="mono">POST /admin/policy</code>) that validates YAML schemas, writes atomically with last-known-good (<code className="mono">.lkg</code>) fallback, and immediately applies changes in memory.
                </p>
                <pre className="mono" style={{ padding: 12, background: 'var(--surface-sunken, #f8fafc)', borderRadius: 8, fontSize: '0.85rem', color: '#166534' }}>
{`# Update policy via HTTP API:
curl -X POST http://localhost:8001/admin/policy \\
  -H "Authorization: Bearer dev-admin-secret" \\
  -H "Content-Type: application/json" \\
  -d '{"policy": "default_tier: tier1_local\\nfast_path_enabled: true\\n..."}'`}
                </pre>
              </div>

              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 6 }}>In-UI Policy Editor</h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  Manage policies visually with syntax highlighting, YAML schema validation, and immediate apply inside the <strong>Agent Studio &gt; Policy Editor</strong> tab.
                </p>
                <button className="btn btn-sm" onClick={() => onNavigate('studio')} style={{ marginTop: 6 }}>
                  Open Agent Studio Policy Editor →
                </button>
              </div>
            </div>
          )}

          {activeSection === 'audit' && (
            <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <h2 style={{ margin: '0 0 8px', fontSize: '1.4rem', fontWeight: 800 }}>5. Tamper-Evident Ed25519 Audit Chain</h2>
                <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.6 }}>
                  For regulated voice applications, call logs must be indisputably immutable and cryptographically verifiable.
                </p>
              </div>

              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 6 }}>Cryptographic Chain Structure (Schema v2)</h3>
                <pre className="mono" style={{ padding: 14, background: 'var(--surface-sunken, #f8fafc)', borderRadius: 8, fontSize: '0.8rem', lineHeight: 1.5, overflowX: 'auto' }}>
{`Event 0: CallStarted  [prev_hash: "0000000000000000..."] ──▶ entry_hash_0 = SHA256(data + prev)
Event 1: TurnCompleted [prev_hash: entry_hash_0]       ──▶ entry_hash_1 = SHA256(data + prev)
Event 2: GuardTriggered [prev_hash: entry_hash_1]       ──▶ entry_hash_2 = SHA256(data + prev)
...
Event N: CallEnded     [prev_hash: entry_hash_N-1]     ──▶ entry_hash_N
                                                               │
                                                               ▼
Head Record: { head_hash: entry_hash_N, signature: Ed25519(head_hash, private_key) }`}
                </pre>
              </div>

              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 6 }}>CLI Chain Verifier</h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 8 }}>
                  Verify log integrity and cryptographic signatures independently from your terminal:
                </p>
                <pre className="mono" style={{ padding: 12, background: 'var(--surface-sunken, #f8fafc)', borderRadius: 8, fontSize: '0.85rem' }}>
{`# Verify an audit log file
python services/agent/app/verify_audit.py --file logs/audit_events.jsonl --public-key config/audit_pubkey.pem`}
                </pre>
              </div>
            </div>
          )}

          {activeSection === 'integrations' && (
            <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <h2 style={{ margin: '0 0 8px', fontSize: '1.4rem', fontWeight: 800 }}>6. SDK & Pipecat Integrations</h2>
                <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.6 }}>
                  Integrate VoiceBench with standard Python AI ecosystems, OpenAI SDK clients, and Pipecat WebRTC pipelines.
                </p>
              </div>

              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 6 }}>Pipecat Realtime Bot Integration</h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 8 }}>
                  Connect your Pipecat WebRTC pipeline directly to the VoiceBench LLM Gateway:
                </p>
                <pre className="mono" style={{ padding: 12, background: 'var(--surface-sunken, #f8fafc)', borderRadius: 8, fontSize: '0.8rem', overflowX: 'auto' }}>
{`# Run the Pipecat bot sample:
python examples/pipecat_bot/bot.py --url http://localhost:8001/v1

# The bot routes audio frames into VoiceBench STT, executes compliance checks,
# and plays synthesized audio through WebRTC.`}
                </pre>
              </div>

              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 6 }}>OpenAI SDK Compatible Client</h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 8 }}>
                  The LLM Gateway is 100% wire-compatible with standard OpenAI chat completion clients:
                </p>
                <pre className="mono" style={{ padding: 12, background: 'var(--surface-sunken, #f8fafc)', borderRadius: 8, fontSize: '0.8rem', overflowX: 'auto' }}>
{`from openai import OpenAI

client = OpenAI(base_url="http://localhost:8001/v1", api_key="not-needed")

response = client.chat.completions.create(
    model="tier1_local",
    messages=[{"role": "user", "content": "What is my account balance?"}],
    extra_body={"persona_id": "debt_collection", "session_id": "call-1234"}
)
print(response.choices[0].message.content)`}
                </pre>
              </div>
            </div>
          )}

          {activeSection === 'benchmarks' && (
            <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <h2 style={{ margin: '0 0 8px', fontSize: '1.4rem', fontWeight: 800 }}>7. Inference Benchmark Suite (B1–B7)</h2>
                <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.6 }}>
                  VoiceBench includes automated evaluation suites measuring latency, compliance, and throughput across 7 benchmark axes.
                </p>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border-subtle, #e2e8f0)', textAlign: 'left' }}>
                      <th style={{ padding: '8px 12px' }}>Suite</th>
                      <th style={{ padding: '8px 12px' }}>Description</th>
                      <th style={{ padding: '8px 12px' }}>Metric</th>
                      <th style={{ padding: '8px 12px' }}>CLI Command</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr style={{ borderBottom: '1px solid var(--border-subtle, #f1f5f9)' }}>
                      <td style={{ padding: '8px 12px', fontWeight: 650 }}>B1</td>
                      <td style={{ padding: '8px 12px' }}>Turn Latency Anatomy</td>
                      <td style={{ padding: '8px 12px' }}><span className="badge badge-success">652.5ms p50</span></td>
                      <td style={{ padding: '8px 12px' }}><code className="mono">npm run bench:latency</code></td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid var(--border-subtle, #f1f5f9)' }}>
                      <td style={{ padding: '8px 12px', fontWeight: 650 }}>B2</td>
                      <td style={{ padding: '8px 12px' }}>Deterministic Compliance Failure Rate</td>
                      <td style={{ padding: '8px 12px' }}><span className="badge badge-success">0.0% (vs 95% ablated)</span></td>
                      <td style={{ padding: '8px 12px' }}><code className="mono">python -m eval.agent.run_suite --variant v2_graph</code></td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid var(--border-subtle, #f1f5f9)' }}>
                      <td style={{ padding: '8px 12px', fontWeight: 650 }}>B3</td>
                      <td style={{ padding: '8px 12px' }}>Prefix Stability & Chunk Latency</td>
                      <td style={{ padding: '8px 12px' }}><span className="badge badge-info">&lt; 38ms TTFA</span></td>
                      <td style={{ padding: '8px 12px' }}><code className="mono">npm run bench:tts</code></td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid var(--border-subtle, #f1f5f9)' }}>
                      <td style={{ padding: '8px 12px', fontWeight: 650 }}>B4</td>
                      <td style={{ padding: '8px 12px' }}>Barge-In Upstream Abort Time</td>
                      <td style={{ padding: '8px 12px' }}><span className="badge badge-success">&lt; 25ms cancel</span></td>
                      <td style={{ padding: '8px 12px' }}><code className="mono">pytest services/agent/tests/test_voice_barge_in.py</code></td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid var(--border-subtle, #f1f5f9)' }}>
                      <td style={{ padding: '8px 12px', fontWeight: 650 }}>B5</td>
                      <td style={{ padding: '8px 12px' }}>Zero-Drop Scale-In Simulation</td>
                      <td style={{ padding: '8px 12px' }}><span className="badge badge-success">0 dropped calls / 8,092</span></td>
                      <td style={{ padding: '8px 12px' }}><code className="mono">python tools/autoscale_sim.py</code></td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid var(--border-subtle, #f1f5f9)' }}>
                      <td style={{ padding: '8px 12px', fontWeight: 650 }}>B6</td>
                      <td style={{ padding: '8px 12px' }}>Cryptographic Tamper-Evidence Detection</td>
                      <td style={{ padding: '8px 12px' }}><span className="badge badge-success">100% detection</span></td>
                      <td style={{ padding: '8px 12px' }}><code className="mono">pytest services/agent/tests/test_audit_v2.py</code></td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid var(--border-subtle, #f1f5f9)' }}>
                      <td style={{ padding: '8px 12px', fontWeight: 650 }}>B7</td>
                      <td style={{ padding: '8px 12px' }}>Zero-Restart Policy Hot-Reload</td>
                      <td style={{ padding: '8px 12px' }}><span className="badge badge-success">&lt; 10ms reload</span></td>
                      <td style={{ padding: '8px 12px' }}><code className="mono">npm --prefix gateway test</code></td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
                <button className="btn btn-primary" onClick={() => onNavigate('results')}>
                  View Interactive Results Visualizer 📊
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
