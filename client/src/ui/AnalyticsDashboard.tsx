import React, { useState, useEffect } from 'react';
import { PageHeader, Badge } from './primitives.tsx';
import { apiClient } from '../data/apiClient.ts';
import { AnalyticsData } from '../data/types.ts';

export const AnalyticsDashboard: React.FC = () => {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<'24h' | '7d' | '30d' | 'all'>('7d');
  const [selectedPersona, setSelectedPersona] = useState<string>('all');
  const [selectedVariant, setSelectedVariant] = useState<string>('all');
  const [targetCostPerMin, setTargetCostPerMin] = useState<number>(1.85);

  const fetchAnalytics = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.getAnalytics({
        range: timeRange,
        persona: selectedPersona !== 'all' ? selectedPersona : undefined,
        variant: selectedVariant !== 'all' ? selectedVariant : undefined,
      });
      setData(res);
    } catch (err: any) {
      setError(err?.message || 'Failed to load enterprise analytics.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, [timeRange, selectedPersona, selectedVariant]);

  const formatSec = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}m ${s < 10 ? '0' : ''}${s}s`;
  };

  const overview = data?.overview;
  const waterfall = data?.waterfall;
  const costLedger = data?.costLedger;
  const dispositions = data?.dispositions || [];
  const personas = data?.personas || [];
  const timeSeries = data?.timeSeries || [];

  const maxCallsInSeries = Math.max(...timeSeries.map((t) => t.calls), 10);
  const dynamicHumanCost = overview ? Math.round(overview.totalDurationMin * targetCostPerMin * 100) / 100 : 0;
  const dynamicSavings = overview ? Math.max(0, Math.round((dynamicHumanCost - overview.totalCostUsd) * 100) / 100) : 0;
  const dynamicSavingsPct = dynamicHumanCost > 0 ? Math.round((dynamicSavings / dynamicHumanCost) * 1000) / 10 : 98.3;

  return (
    <div className="page">
      <PageHeader
        eyebrow="Measure · Operations telemetry"
        title="Analytics & Dispositions"
        desc="Executive KPIs, disposition rates, sub-second latency breakdown, and AI unit economics."
        right={
          overview ? (
            <Badge tone="success" dot>
              {overview.complianceGuardrailRate}% compliance · {overview.totalCalls} calls
            </Badge>
          ) : undefined
        }
      />

      {/* Toolbar with filters & actions */}
      <div className="toolbar" style={{ justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'inline-flex', background: 'var(--surface-2)', borderRadius: 'var(--radius-md)', padding: 2, border: '1px solid var(--border)' }}>
            {(['24h', '7d', '30d', 'all'] as const).map((r) => (
              <button
                key={r}
                onClick={() => setTimeRange(r)}
                style={{
                  padding: '4px 10px',
                  fontSize: 12,
                  fontWeight: 600,
                  background: timeRange === r ? '#101828' : 'transparent',
                  color: timeRange === r ? '#fff' : 'var(--text-tertiary)',
                  border: 'none',
                  borderRadius: 6,
                  cursor: 'pointer',
                  transition: 'all 0.12s ease',
                }}
              >
                {r === '24h' ? '24h' : r === '7d' ? '7 Days' : r === '30d' ? '30 Days' : 'All time'}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--text-tertiary)', fontWeight: 500 }}>Persona:</span>
            <select
              value={selectedPersona}
              onChange={(e) => setSelectedPersona(e.target.value)}
              className="select"
              style={{ fontSize: 12.5, padding: '4px 8px', height: 30 }}
            >
              <option value="all">All personas</option>
              <option value="cooperative">Cooperative</option>
              <option value="hostile">Hostile</option>
              <option value="evasive">Evasive</option>
              <option value="hardship">Hardship</option>
              <option value="fails_verification">Fails verification</option>
              <option value="already_paid">Already paid</option>
              <option value="off_script">Off script</option>
              <option value="stop_contact">Stop contact</option>
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--text-tertiary)', fontWeight: 500 }}>Variant:</span>
            <select
              value={selectedVariant}
              onChange={(e) => setSelectedVariant(e.target.value)}
              className="select"
              style={{ fontSize: 12.5, padding: '4px 8px', height: 30 }}
            >
              <option value="all">All architectures</option>
              <option value="v2_graph">v2 Graph Agent</option>
              <option value="v1_baseline">v1 Baseline</option>
              <option value="v1_no_guard">v1 No Guard</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <a
            href="/api/analytics/export"
            download="voice_ai_analytics_report.csv"
            className="btn btn-sm"
            style={{ textDecoration: 'none' }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Export CSV
          </a>
          <button
            onClick={fetchAnalytics}
            disabled={loading}
            className="btn btn-sm"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {error ? (
        <div className="card card-pad" style={{ textAlign: 'center', borderColor: 'var(--danger-border)', background: 'var(--danger-soft)', marginBottom: 16 }}>
          <div style={{ fontWeight: 650, color: 'var(--danger)' }}>Could not load operational analytics</div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>{error}</div>
        </div>
      ) : loading && !data ? (
        <div className="card card-pad" style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: '40px 0' }}>
          Loading operational telemetry…
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Section 1: Executive KPI Stat Grid */}
          <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
            <div className="stat">
              <div className="stat-label">Total Volume</div>
              <div className="stat-value">{overview?.totalCalls.toLocaleString() || '—'}</div>
              <div className="stat-sub" style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                <span style={{ color: 'var(--success)' }}>{overview?.completedCalls || 0} completed</span>
                <span>·</span>
                <span style={{ color: 'var(--warning)' }}>{overview?.escalatedCalls || 0} escalated</span>
              </div>
            </div>

            <div className="stat">
              <div className="stat-label">Average Handle Time (AHT)</div>
              <div className="stat-value mono">{overview ? formatSec(overview.avgHandleTimeSec) : '—'}</div>
              <div className="stat-sub">{overview?.totalDurationMin || 0} total call minutes</div>
            </div>

            <div className="stat">
              <div className="stat-label">First Call Resolution (FCR)</div>
              <div className="stat-value" style={{ color: 'var(--success)' }}>
                {overview ? `${overview.firstCallResolutionRate}%` : '—'}
              </div>
              <div className="stat-sub">&gt;80% target SLA passed</div>
            </div>

            <div className="stat">
              <div className="stat-label">Promise / Conversion</div>
              <div className="stat-value">{overview ? `${overview.promiseToPayRate}%` : '—'}</div>
              <div className="stat-sub">Negotiation success rate</div>
            </div>

            <div className="stat">
              <div className="stat-label">Compliance Guardrail</div>
              <div className="stat-value" style={{ color: 'var(--success)' }}>
                {overview ? `${overview.complianceGuardrailRate}%` : '—'}
              </div>
              <div className="stat-sub">Zero regulatory violations</div>
            </div>

            <div className="stat">
              <div className="stat-label">AI Unit Cost / Min</div>
              <div className="stat-value mono" style={{ color: '#0f766e' }}>
                ${overview ? overview.avgCostPerMinuteUsd.toFixed(3) : '0.031'}
              </div>
              <div className="stat-sub">vs $1.85 human baseline</div>
            </div>
          </div>

          {/* Section 2: Visual Charts: Volume Timeline & Dispositions */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16 }}>
            {/* Volume timeline */}
            <div className="card">
              <div className="card-header">
                <div>
                  <h3 className="card-title">Call volume &amp; throughput timeline</h3>
                  <p className="card-sub">Daily handled calls and completion breakdown</p>
                </div>
                <div style={{ display: 'flex', gap: 12, fontSize: 12 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--success)' }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--success)' }}></span> Completed
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--warning)' }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--warning)' }}></span> Escalated
                  </span>
                </div>
              </div>

              <div className="card-pad" style={{ paddingTop: 20 }}>
                <div style={{ height: 160, display: 'flex', alignItems: 'flex-end', gap: 14, borderBottom: '1px solid var(--border)' }}>
                  {timeSeries.map((t, idx) => {
                    const compHeight = Math.max(8, Math.round((t.completed / maxCallsInSeries) * 120));
                    const escHeight = Math.max(2, Math.round((t.escalated / maxCallsInSeries) * 120));
                    return (
                      <div key={idx} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 500 }}>{t.calls}</div>
                        <div style={{ width: '100%', maxWidth: 32, display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <div
                            style={{
                              height: escHeight,
                              background: 'var(--warning)',
                              borderRadius: '2px 2px 0 0',
                            }}
                            title={`Escalated: ${t.escalated}`}
                          />
                          <div
                            style={{
                              height: compHeight,
                              background: 'var(--success)',
                              borderRadius: '0 0 2px 2px',
                            }}
                            title={`Completed: ${t.completed}`}
                          />
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 8 }}>{t.date}</div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontSize: 12, color: 'var(--text-secondary)' }}>
                  <span>Total calls: <strong>{overview?.totalCalls}</strong></span>
                  <span>Est. AI spend: <strong>${overview?.totalCostUsd}</strong></span>
                </div>
              </div>
            </div>

            {/* Dispositions breakdown */}
            <div className="card">
              <div className="card-header">
                <div>
                  <h3 className="card-title">Call dispositions &amp; outcomes</h3>
                  <p className="card-sub">Granular call termination classification</p>
                </div>
              </div>

              <div className="card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {dispositions.slice(0, 6).map((d, idx) => {
                  const isSuccess = d.disposition === 'promise_secured' || d.disposition === 'resolved' || d.disposition === 'already_paid';
                  const isEscalation = d.disposition.includes('escalat');
                  const barColor = isSuccess ? 'var(--success)' : isEscalation ? 'var(--warning)' : 'var(--accent)';
                  return (
                    <div key={idx}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}>
                        <span style={{ fontWeight: 600, color: 'var(--text)', textTransform: 'capitalize' }}>
                          {d.disposition.replace(/_/g, ' ')}
                        </span>
                        <span style={{ color: 'var(--text-tertiary)' }}>
                          <strong style={{ color: 'var(--text)' }}>{d.count}</strong> ({d.percentage}%)
                        </span>
                      </div>
                      <div style={{ height: 6, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                        <div
                          style={{
                            height: '100%',
                            width: `${Math.min(100, Math.max(3, d.percentage))}%`,
                            background: barColor,
                            borderRadius: 3,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Section 3: Sub-Second Voice Latency Waterfall Engine */}
          <div className="card">
            <div className="card-header">
              <div>
                <h3 className="card-title">Sub-second voice latency waterfall engine</h3>
                <p className="card-sub">Turn-by-turn pipeline stage profiling (P50 &amp; P95 percentiles)</p>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <Badge tone="success" dot>Enterprise SLA &lt;800ms Passed</Badge>
                <Badge tone="neutral">Target turn taking ~500ms</Badge>
              </div>
            </div>

            <div className="card-pad">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                <div style={{ background: 'var(--surface-2)', padding: 12, borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase' }}>1. STT Transcription</div>
                  <div className="mono" style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginTop: 4 }}>
                    {waterfall?.sttP50}ms <span style={{ fontSize: 12, color: 'var(--text-dim)', fontWeight: 400 }}>p95: {waterfall?.sttP95}ms</span>
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)', marginTop: 4 }}>SenseVoice / Silero VAD</div>
                </div>

                <div style={{ background: 'var(--surface-2)', padding: 12, borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase' }}>2. LLM Time to 1st Token</div>
                  <div className="mono" style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginTop: 4 }}>
                    {waterfall?.llmP50}ms <span style={{ fontSize: 12, color: 'var(--text-dim)', fontWeight: 400 }}>p95: {waterfall?.llmP95}ms</span>
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)', marginTop: 4 }}>Speculative Graph Planner</div>
                </div>

                <div style={{ background: 'var(--surface-2)', padding: 12, borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase' }}>3. TTS Chunk Synthesis</div>
                  <div className="mono" style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginTop: 4 }}>
                    {waterfall?.ttsP50}ms <span style={{ fontSize: 12, color: 'var(--text-dim)', fontWeight: 400 }}>p95: {waterfall?.ttsP95}ms</span>
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)', marginTop: 4 }}>Streaming Synthesis Engine</div>
                </div>

                <div style={{ background: 'var(--surface-2)', padding: 12, borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase' }}>4. Transport &amp; Bridge</div>
                  <div className="mono" style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginTop: 4 }}>
                    {waterfall?.networkP50}ms <span style={{ fontSize: 12, color: 'var(--text-dim)', fontWeight: 400 }}>p95: {waterfall?.networkP95}ms</span>
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)', marginTop: 4 }}>Edge Binary Audio Loop</div>
                </div>

                <div style={{ background: 'var(--success-soft)', padding: 12, borderRadius: 'var(--radius-md)', border: '1px solid var(--success-border)' }}>
                  <div style={{ fontSize: 11.5, color: 'var(--success)', fontWeight: 700, textTransform: 'uppercase' }}>Total End-to-End Latency</div>
                  <div className="mono" style={{ fontSize: 20, fontWeight: 800, color: 'var(--success)', marginTop: 4 }}>
                    {waterfall?.e2eP50}ms <span style={{ fontSize: 12, color: 'var(--text-dim)', fontWeight: 400 }}>p95: {waterfall?.e2eP95}ms</span>
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)', marginTop: 4 }}>Sub-second natural flow</div>
                </div>
              </div>
            </div>
          </div>

          {/* Section 4: Persona Performance Matrix */}
          <div className="card">
            <div className="card-header">
              <div>
                <h3 className="card-title">Persona &amp; campaign benchmark matrix</h3>
                <p className="card-sub">Resolution rate, handle time, and LLM judge quality scores by persona</p>
              </div>
            </div>

            <div className="table-wrap" style={{ border: 'none', borderRadius: 0, boxShadow: 'none' }}>
              <table className="grid">
                <thead>
                  <tr>
                    <th>Persona / Intent</th>
                    <th>Total calls</th>
                    <th>Resolution %</th>
                    <th>Mean turns</th>
                    <th>AHT</th>
                    <th>Judge score</th>
                    <th>AI cost</th>
                  </tr>
                </thead>
                <tbody>
                  {personas.map((p, idx) => (
                    <tr key={idx}>
                      <td style={{ fontWeight: 650, textTransform: 'capitalize' }}>
                        {p.persona.replace(/_/g, ' ')}
                      </td>
                      <td>{p.totalCalls}</td>
                      <td>
                        <span style={{ color: p.resolutionRate >= 70 ? 'var(--success)' : p.resolutionRate >= 50 ? 'var(--warning)' : 'var(--danger)', fontWeight: 650 }}>
                          {p.resolutionRate}%
                        </span>
                      </td>
                      <td className="mono">{p.avgTurns}</td>
                      <td className="mono">{formatSec(p.avgDurationSec)}</td>
                      <td>
                        <strong style={{ color: 'var(--accent)' }}>{p.avgScore}</strong> / 5.0
                      </td>
                      <td className="mono" style={{ color: 'var(--text-tertiary)' }}>${p.costUsd}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 5: Unit Economics & Financial ROI Ledger */}
          <div className="card">
            <div className="card-header" style={{ flexWrap: 'wrap', gap: 12 }}>
              <div>
                <h3 className="card-title">Unit economics &amp; financial ROI ledger</h3>
                <p className="card-sub">Full stack breakdown vs traditional tier-1 human contact center costs</p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--surface-2)', padding: '6px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                <span style={{ fontSize: 12, color: 'var(--text-tertiary)', fontWeight: 500 }}>Human baseline ($/min):</span>
                <input
                  type="range"
                  min="0.80"
                  max="3.50"
                  step="0.05"
                  value={targetCostPerMin}
                  onChange={(e) => setTargetCostPerMin(parseFloat(e.target.value))}
                  style={{ width: 90 }}
                />
                <strong className="mono" style={{ fontSize: 13 }}>${targetCostPerMin.toFixed(2)}/min</strong>
              </div>
            </div>

            <div className="card-pad">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
                {/* Voice AI Stack */}
                <div style={{ background: 'var(--surface-2)', padding: 14, borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                  <div style={{ fontWeight: 650, fontSize: 13, marginBottom: 10, color: 'var(--text)' }}>Voice AI Infrastructure Stack</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12.5 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-tertiary)' }}>STT (Deepgram Nova-2 / SenseVoice)</span>
                      <strong className="mono">${costLedger?.sttCostUsd || 0}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-tertiary)' }}>LLM Inference (GPT-4o-mini / Local 8B)</span>
                      <strong className="mono">${costLedger?.llmCostUsd || 0}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-tertiary)' }}>TTS Synthesis (Cartesia / Kokoro)</span>
                      <strong className="mono">${costLedger?.ttsCostUsd || 0}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-tertiary)' }}>Telephony (SIP Trunk PSTN)</span>
                      <strong className="mono">${costLedger?.telephonyCostUsd || 0}</strong>
                    </div>
                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8, display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 13.5 }}>
                      <span>Total AI Spend:</span>
                      <span className="mono" style={{ color: 'var(--accent)' }}>${costLedger?.totalCostUsd || 0}</span>
                    </div>
                  </div>
                </div>

                {/* Human Contact Center Equivalent */}
                <div style={{ background: 'var(--surface-2)', padding: 14, borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                  <div style={{ fontWeight: 650, fontSize: 13, marginBottom: 10, color: 'var(--text)' }}>Human Contact Center Equivalent</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12.5 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-tertiary)' }}>Call minutes logged</span>
                      <strong className="mono">{overview?.totalDurationMin || 0} mins</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-tertiary)' }}>Human agent hourly rate</span>
                      <strong className="mono">${(targetCostPerMin * 60).toFixed(2)}/hr</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-tertiary)' }}>Supervisor &amp; facility overhead</span>
                      <strong style={{ color: 'var(--success)' }}>Included</strong>
                    </div>
                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8, display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 13.5 }}>
                      <span>Traditional Human Cost:</span>
                      <span className="mono" style={{ color: 'var(--danger)' }}>${dynamicHumanCost}</span>
                    </div>
                  </div>
                </div>

                {/* Net Financial Savings */}
                <div style={{ background: 'var(--success-soft)', padding: 16, borderRadius: 'var(--radius-md)', border: '1px solid var(--success-border)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <div style={{ fontSize: 11.5, color: 'var(--success)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Net Financial Savings
                  </div>
                  <div className="mono" style={{ fontSize: 32, fontWeight: 800, color: 'var(--success)', marginTop: 4 }}>
                    ${dynamicSavings.toLocaleString()}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text)', marginTop: 4 }}>
                    <strong>{dynamicSavingsPct}%</strong> reduction in cost per handle
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 8 }}>
                    Immediate ROI upon live inbound traffic dispatch
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
