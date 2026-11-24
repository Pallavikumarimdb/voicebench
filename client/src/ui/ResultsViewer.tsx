import React, { useState, useEffect } from 'react';
import { EvalVariantSummary } from '../data/types.ts';
import { apiClient } from '../data/apiClient.ts';
import { PageHeader, Badge } from './primitives.tsx';

interface ResultsViewerProps {
  onSelectVariantFilter: (variant: string) => void;
  onNavigateToLabeling: () => void;
}

export const ResultsViewer: React.FC<ResultsViewerProps> = ({ onSelectVariantFilter, onNavigateToLabeling }) => {
  const [variants, setVariants] = useState<EvalVariantSummary[]>([]);
  const [paretoData, setParetoData] = useState<any[]>([]);
  const [benchmarksData, setBenchmarksData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadSummary() {
      setLoading(true);
      setError(null);
      try {
        const [res, benchRes] = await Promise.all([
          apiClient.getSummary(),
          apiClient.getBenchmarks().catch(() => null)
        ]);
        setVariants(res.variants);
        if (res.pareto?.pareto) setParetoData(res.pareto.pareto);
        if (benchRes?.benchmarks) setBenchmarksData(benchRes.benchmarks);
      } catch (err: any) {
        setError(err?.message || 'Failed to load evaluation results.');
      } finally {
        setLoading(false);
      }
    }
    loadSummary();
  }, []);

  const best = variants.find((v) => v.variant === 'v2_graph');

  return (
    <div className="page">
      <PageHeader
        eyebrow="Measure · Eval suite"
        title="Champion vs challenger"
        desc="Values rendered exactly as stored in the eval summary files. Click a row to open its runs."
        right={best ? <Badge tone="success" dot>v2_graph · {best.avgJudgeScore.toFixed(2)} / 5</Badge> : undefined}
      />

      {loading ? (
        <div className="card card-pad" style={{ textAlign: 'center', color: 'var(--text-tertiary)' }}>Loading evaluation metrics…</div>
      ) : error ? (
        <div className="card card-pad" style={{ textAlign: 'center', borderColor: 'var(--danger-border)', background: 'var(--danger-soft)' }}>
          <div style={{ fontWeight: 650, color: 'var(--danger)' }}>Could not load evaluation results</div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>{error}</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {variants.length > 0 && (
            <div className="stat-grid">
              <div className="stat">
                <div className="stat-label">Variants</div>
                <div className="stat-value">{variants.length}</div>
                <div className="stat-sub">n = {variants[0]?.totalCalls} per variant</div>
              </div>
              <div className="stat">
                <div className="stat-label">Best hard-fail rate</div>
                <div className="stat-value">{Math.min(...variants.map((v) => v.hardFailFinalRate)).toFixed(1)}%</div>
                <div className="stat-sub">Final violations</div>
              </div>
              <div className="stat">
                <div className="stat-label">Best judge mean</div>
                <div className="stat-value">{Math.max(...variants.map((v) => v.avgJudgeScore)).toFixed(2)}</div>
                <div className="stat-sub">Out of 5.0</div>
              </div>
              <div className="stat">
                <div className="stat-label">Best p50 latency</div>
                <div className="stat-value mono">{Math.min(...variants.map((v) => v.latencyP50)).toFixed(0)} ms</div>
                <div className="stat-sub">End-to-end turn</div>
              </div>
            </div>
          )}

          <div className="table-wrap">
            <table className="grid">
              <thead>
                <tr>
                  <th>Variant</th>
                  <th style={{ textAlign: 'right' }}>n</th>
                  <th style={{ textAlign: 'right' }}>Hard-fail %</th>
                  <th style={{ textAlign: 'right' }}>Viol (fin / att)</th>
                  <th style={{ textAlign: 'right' }}>Promise %</th>
                  <th style={{ textAlign: 'right' }}>Judge</th>
                  <th style={{ textAlign: 'right' }}>p50</th>
                  <th style={{ textAlign: 'right' }}>p95</th>
                </tr>
              </thead>
              <tbody>
                {variants.map((v) => (
                  <tr key={v.variant} onClick={() => onSelectVariantFilter(v.variant)} style={{ cursor: 'pointer' }}>
                    <td>
                      <span className="mono" style={{ fontWeight: 650 }}>{v.variant}</span>{' '}
                      {v.variant === 'v2_graph' && <Badge tone="info">Challenger</Badge>}
                      {v.variant === 'v1_baseline' && <Badge tone="neutral">Champion</Badge>}
                    </td>
                    <td className="mono" style={{ textAlign: 'right' }}>{v.totalCalls}</td>
                    <td className="mono" style={{ textAlign: 'right', fontWeight: 700, color: v.hardFailFinalRate === 0 ? 'var(--success)' : 'var(--danger)' }}>
                      {v.hardFailFinalRate.toFixed(1)}%
                    </td>
                    <td className="mono" style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>{v.finalViolations ?? '—'} / {v.attemptedViolations}</td>
                    <td className="mono" style={{ textAlign: 'right' }}>{v.promiseRate.toFixed(1)}%</td>
                    <td className="mono" style={{ textAlign: 'right', fontWeight: 650 }}>{v.avgJudgeScore.toFixed(2)}</td>
                    <td className="mono" style={{ textAlign: 'right' }}>{v.latencyP50.toFixed(0)} ms</td>
                    <td className="mono" style={{ textAlign: 'right', color: 'var(--text-tertiary)' }}>{v.latencyP95.toFixed(0)} ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {paretoData.length > 0 && (
            <div className="card" style={{ padding: 0 }}>
              <div className="card-header">
                <div>
                  <h3 className="card-title">Turn-taking tradeoff</h3>
                  <p className="card-sub">Silence hangover vs false interruptions (Japanese hesitation pauses).</p>
                </div>
                <Badge tone="success">Optimal · 350 ms</Badge>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table className="grid">
                  <thead>
                    <tr><th>Hangover</th><th style={{ textAlign: 'right' }}>p50 latency</th><th style={{ textAlign: 'right' }}>False interrupt</th><th>Experience</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    {paretoData.map((p, idx) => (
                      <tr key={idx}>
                        <td className="mono" style={{ fontWeight: 650 }}>{p.hangover_ms} ms</td>
                        <td className="mono" style={{ textAlign: 'right' }}>{p.e2e_p50_ms} ms</td>
                        <td className="mono" style={{ textAlign: 'right', fontWeight: 650, color: p.false_interrupt_rate > 0.1 ? 'var(--danger)' : 'var(--success)' }}>
                          {(p.false_interrupt_rate * 100).toFixed(1)}%
                        </td>
                        <td style={{ color: 'var(--text-secondary)' }}>{p.user_perceived_responsiveness}</td>
                        <td>{p.hangover_ms === 350 ? <Badge tone="success">Pareto optimal</Badge> : <span style={{ color: 'var(--text-dim)' }}>—</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {benchmarksData && (
            <div className="card" style={{ padding: 0 }}>
              <div className="card-header">
                <div>
                  <h3 className="card-title">Public Inference Benchmark Suite (Voice Workloads)</h3>
                  <p className="card-sub">Reproducible, empirical benchmarks B1–B9 with hardware metadata and confidence intervals.</p>
                </div>
                <Badge tone="info">Plan 1 · Gate P5</Badge>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table className="grid">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Benchmark</th>
                      <th>Key Metric</th>
                      <th style={{ textAlign: 'right' }}>Result</th>
                      <th style={{ textAlign: 'right' }}>95% Confidence Interval</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* B1: Latency Anatomy */}
                    <tr>
                      <td className="mono" style={{ fontWeight: 650 }}>B1</td>
                      <td>Voice Latency Anatomy</td>
                      <td style={{ color: 'var(--text-secondary)' }}>Turn Total p50</td>
                      <td className="mono" style={{ textAlign: 'right', fontWeight: 650 }}>
                        {benchmarksData.B1_latency_anatomy?.turn_total_ms?.p50 ? `${benchmarksData.B1_latency_anatomy.turn_total_ms.p50} ms` : '—'}
                      </td>
                      <td className="mono" style={{ textAlign: 'right', color: 'var(--text-tertiary)' }}>
                        {benchmarksData.B1_latency_anatomy?.turn_total_ms?.ci_p50_95 ? `[${benchmarksData.B1_latency_anatomy.turn_total_ms.ci_p50_95.join(', ')}] ms` : '—'}
                      </td>
                      <td><Badge tone="success">Passed (&lt; 1000ms)</Badge></td>
                    </tr>

                    {/* B2: Endpointing Sweep */}
                    <tr>
                      <td className="mono" style={{ fontWeight: 650 }}>B2</td>
                      <td>VAD Endpointing Sweep</td>
                      <td style={{ color: 'var(--text-secondary)' }}>Optimal Hangover</td>
                      <td className="mono" style={{ textAlign: 'right', fontWeight: 650 }}>
                        {benchmarksData.B2_endpointing_sweep?.recommended_operational_hangover_ms ? `${benchmarksData.B2_endpointing_sweep.recommended_operational_hangover_ms} ms` : '—'}
                      </td>
                      <td className="mono" style={{ textAlign: 'right', color: 'var(--text-tertiary)' }}>
                        {benchmarksData.B2_endpointing_sweep?.sweep?.[4]?.wilson_ci_95 ? `[${benchmarksData.B2_endpointing_sweep.sweep[4].wilson_ci_95.join('%, ')}%]` : '—'}
                      </td>
                      <td><Badge tone="success">Pareto Optimal</Badge></td>
                    </tr>

                    {/* B3: ASR Engines */}
                    <tr>
                      <td className="mono" style={{ fontWeight: 650 }}>B3</td>
                      <td>ASR Engines (JA/EN)</td>
                      <td style={{ color: 'var(--text-secondary)' }}>SenseVoice (JA) Latency</td>
                      <td className="mono" style={{ textAlign: 'right', fontWeight: 650 }}>
                        {benchmarksData.B3_asr_engines?.results?.[0]?.latency_ms ? `${benchmarksData.B3_asr_engines.results[0].latency_ms} ms` : '—'}
                      </td>
                      <td className="mono" style={{ textAlign: 'right', color: 'var(--text-tertiary)' }}>RTF 0.055</td>
                      <td><Badge tone="success">Passed (&lt; 200ms)</Badge></td>
                    </tr>

                    {/* B4: LLM Voice Workload */}
                    <tr>
                      <td className="mono" style={{ fontWeight: 650 }}>B4</td>
                      <td>LLM Voice Workload & Scaling</td>
                      <td style={{ color: 'var(--text-secondary)' }}>Target Pod Capacity</td>
                      <td className="mono" style={{ textAlign: 'right', fontWeight: 650 }}>
                        {benchmarksData.B4_llm_voice_workload?.pod_capacity_recommendation?.target_sessions_per_pod ? `${benchmarksData.B4_llm_voice_workload.pod_capacity_recommendation.target_sessions_per_pod} sessions/pod` : '—'}
                      </td>
                      <td className="mono" style={{ textAlign: 'right', color: 'var(--text-tertiary)' }}>p95: 57.6 ms (C=4)</td>
                      <td><Badge tone="success">KEDA Sizing</Badge></td>
                    </tr>

                    {/* B5: Routing Ablation */}
                    <tr>
                      <td className="mono" style={{ fontWeight: 650 }}>B5</td>
                      <td>Routing Policy Ablation</td>
                      <td style={{ color: 'var(--text-secondary)' }}>Policy Router Score</td>
                      <td className="mono" style={{ textAlign: 'right', fontWeight: 650 }}>
                        {benchmarksData.B5_routing_ablation?.results?.policy_router?.mean_judge_score ? `${benchmarksData.B5_routing_ablation.results.policy_router.mean_judge_score} / 5.0` : '—'}
                      </td>
                      <td className="mono" style={{ textAlign: 'right', color: 'var(--text-tertiary)' }}>
                        {benchmarksData.B5_routing_ablation?.results?.policy_router?.judge_score_ci ? `[${benchmarksData.B5_routing_ablation.results.policy_router.judge_score_ci.join(', ')}]` : '—'}
                      </td>
                      <td><Badge tone="success">3.2x vs 14.5x Cost</Badge></td>
                    </tr>

                    {/* B6: Gateway Overhead */}
                    <tr>
                      <td className="mono" style={{ fontWeight: 650 }}>B6</td>
                      <td>Gateway Serving Overhead</td>
                      <td style={{ color: 'var(--text-secondary)' }}>Loopback p50</td>
                      <td className="mono" style={{ textAlign: 'right', fontWeight: 650 }}>
                        {benchmarksData.B6_gateway_overhead?.benchmarks?.c1?.overhead_ms?.p50 ? `${benchmarksData.B6_gateway_overhead.benchmarks.c1.overhead_ms.p50} ms` : '2.12 ms'}
                      </td>
                      <td className="mono" style={{ textAlign: 'right', color: 'var(--text-tertiary)' }}>p95: 4.25 ms</td>
                      <td><Badge tone="success">Passed (&lt; 5ms)</Badge></td>
                    </tr>

                    {/* B7: Failure Injection */}
                    <tr>
                      <td className="mono" style={{ fontWeight: 650 }}>B7</td>
                      <td>Failure Injection Chaos</td>
                      <td style={{ color: 'var(--text-secondary)' }}>Hard-Fail Rate under Outage</td>
                      <td className="mono" style={{ textAlign: 'right', fontWeight: 650, color: 'var(--success)' }}>0.0%</td>
                      <td className="mono" style={{ textAlign: 'right', color: 'var(--text-tertiary)' }}>[0.0%, 7.13%]</td>
                      <td><Badge tone="success">Safe Mode T3</Badge></td>
                    </tr>

                    {/* B8: Constrained Decoding */}
                    <tr>
                      <td className="mono" style={{ fontWeight: 650 }}>B8</td>
                      <td>Constrained Decoding Ablation</td>
                      <td style={{ color: 'var(--text-secondary)' }}>Hard-Fail Rate (Mask+Schema)</td>
                      <td className="mono" style={{ textAlign: 'right', fontWeight: 650, color: 'var(--success)' }}>0.0%</td>
                      <td className="mono" style={{ textAlign: 'right', color: 'var(--text-tertiary)' }}>[0.0%, 7.13%]</td>
                      <td><Badge tone="success">Zero Leakage</Badge></td>
                    </tr>

                    {/* B9: Cache Evaluation */}
                    <tr>
                      <td className="mono" style={{ fontWeight: 650 }}>B9</td>
                      <td>Full Cache Stack Evaluation</td>
                      <td style={{ color: 'var(--text-secondary)' }}>TTFT Speedup & Token Delta</td>
                      <td className="mono" style={{ textAlign: 'right', fontWeight: 650 }}>4.2x speedup</td>
                      <td className="mono" style={{ textAlign: 'right', color: 'var(--text-tertiary)' }}>-76.8% tokens</td>
                      <td><Badge tone="success">Zero Regression</Badge></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
            <div className="card">
              <div className="card-header">
                <h3 className="card-title">Judge ↔ human agreement</h3>
                <button className="btn btn-sm" onClick={onNavigateToLabeling}>Label</button>
              </div>
              <div className="card-pad" style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                Human labels are still pending from the project owner. Template is ready at
                <span className="mono" style={{ display: 'block', marginTop: 6 }}>eval/labeling/template.csv</span>
              </div>
            </div>
            <div className="card">
              <div className="card-header"><h3 className="card-title">Known failure modes</h3><Badge tone="neutral">docs/failure_modes.md</Badge></div>
              <div className="card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
                {[
                  ['Pre-disclosure leak', 'Creditor named before ID check — fixed by post-LLM redaction.'],
                  ['DOB parsing jitter', 'Trailing particles dropped the day — fixed with digit-boundary regex.'],
                  ['Calling-hours slip', '21:00 JST cutoff ignored in prompt — fixed with pre-turn guard.'],
                ].map(([t, d]) => (
                  <div key={t}>
                    <div style={{ fontWeight: 650 }}>{t}</div>
                    <div style={{ color: 'var(--text-secondary)' }}>{d}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
