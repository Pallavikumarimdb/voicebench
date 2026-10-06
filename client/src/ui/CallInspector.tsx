import React, { useState } from 'react';
import { CallDetail } from '../data/types.ts';
import { HashChainBadge, HardFailBadge, ComplianceBadge, SourceBadge } from './Badges.tsx';
import { PageHeader, Badge, EmptyState } from './primitives.tsx';

interface CallInspectorProps {
  call: CallDetail;
  onBack: () => void;
}

export const CallInspector: React.FC<CallInspectorProps> = ({ call, onBack }) => {
  const [revealHiddenFacts, setRevealHiddenFacts] = useState(false);
  const [expandedTools, setExpandedTools] = useState<Set<number>>(new Set());

  const auditRecords = call.auditLog || [];

  const turns: Array<{
    turnNumber: number;
    userText?: string;
    agentAttempted?: string;
    agentFinal?: string;
    phase?: string;
    ruleBlocked?: string;
    toolCalls: Array<{ tool: string; args: any; result: any }>;
    latencyMs?: number;
  }> = [];

  let currentTurnNumber = 1;
  let activeTurn: (typeof turns)[0] = { turnNumber: currentTurnNumber, toolCalls: [] };

  for (const record of auditRecords) {
    if (record.stage === 'user_utterance') {
      const turnNum = record.payload?.turn || currentTurnNumber;
      if (activeTurn.userText || activeTurn.agentFinal) {
        turns.push(activeTurn);
        currentTurnNumber = turnNum;
        activeTurn = { turnNumber: currentTurnNumber, toolCalls: [] };
      }
      activeTurn.userText = record.payload?.text;
    } else if (record.stage === 'agent_utterance') {
      activeTurn.agentAttempted = record.payload?.attempted || record.payload?.text;
      activeTurn.agentFinal = record.payload?.final || record.payload?.text;
      activeTurn.phase = record.payload?.phase || record.payload?.stage;
      activeTurn.latencyMs = record.payload?.latency_ms || record.payload?.latencyMs;
      if (record.payload?.attempted && record.payload?.final && record.payload.attempted !== record.payload.final) {
        activeTurn.ruleBlocked = record.payload?.rule_violation || 'compliance_rewrite';
      }
      turns.push(activeTurn);
      currentTurnNumber++;
      activeTurn = { turnNumber: currentTurnNumber, toolCalls: [] };
    } else if (record.stage === 'compliance_block') {
      activeTurn.ruleBlocked = record.payload?.rule || 'compliance_block';
      activeTurn.agentAttempted = record.payload?.attempted;
      activeTurn.agentFinal = record.payload?.final || record.payload?.text;
      activeTurn.phase = 'compliance_guard';
      turns.push(activeTurn);
      currentTurnNumber++;
      activeTurn = { turnNumber: currentTurnNumber, toolCalls: [] };
    } else if (record.stage === 'tool_call') {
      activeTurn.toolCalls.push({
        tool: record.payload?.tool || 'unknown_tool',
        args: record.payload?.args || {},
        result: record.payload?.result || {},
      });
    }
  }
  if (activeTurn.userText || activeTurn.agentFinal || activeTurn.ruleBlocked) {
    turns.push(activeTurn);
  }

  const effectiveHashChain = call.hashChain;

  const toggleTools = (idx: number) => {
    setExpandedTools((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const blockedTurns = turns.filter((t) => t.ruleBlocked).length;

  return (
    <div className="page" style={{ maxWidth: 1240 }}>
      <PageHeader
        eyebrow="Review · Call detail"
        title={call.id.length > 28 ? `${call.id.slice(0, 28)}…` : call.id}
        desc={`${call.variant} · ${call.personaId} · ${turns.length} turns · ${blockedTurns} guard interventions`}
        right={
          <button className="btn btn-sm" onClick={onBack}>Back to list</button>
        }
      />

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <SourceBadge source={call.source} />
        <Badge tone="neutral" dot>{call.variant}</Badge>
        <HashChainBadge valid={effectiveHashChain.valid} verifiedCount={effectiveHashChain.verifiedCount} brokenSeq={effectiveHashChain.brokenSeq} error={effectiveHashChain.error} />
        {call.runData?.hard_fail && (
          <HardFailBadge passed={call.runData.hard_fail.passed} numViolations={call.runData.hard_fail.num_final} />
        )}
        {call.runData?.promise_to_pay ? (
          <Badge tone="success" dot>Promise secured</Badge>
        ) : (
          <Badge tone="neutral">{call.runData?.judge?.outcome || 'Completed'}</Badge>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.7fr) minmax(300px, 1fr)', gap: 16, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 650 }}>Timeline</div>
          {turns.length === 0 && <EmptyState title="No turns recorded" />}
          {turns.map((turn, idx) => {
            const hasBlock = Boolean(turn.ruleBlocked);
            return (
              <div key={idx} className={`timeline-turn ${hasBlock ? 'flagged' : ''}`} style={{ padding: '14px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                  <span className="mono" style={{ fontWeight: 700, fontSize: 12 }}>T{turn.turnNumber}</span>
                  {turn.phase && <Badge tone="neutral">{turn.phase}</Badge>}
                  {hasBlock && <ComplianceBadge blocked rule={turn.ruleBlocked} />}
                  {turn.latencyMs !== undefined && (
                    <span className="mono" style={{ marginLeft: 'auto', fontSize: 12, color: turn.latencyMs > 500 ? 'var(--danger)' : 'var(--text-tertiary)' }}>
                      {turn.latencyMs.toFixed(0)} ms
                    </span>
                  )}
                </div>

                {turn.userText !== undefined && (
                  <div style={{ marginBottom: turn.agentFinal || turn.agentAttempted ? 10 : 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-tertiary)', marginBottom: 4 }}>
                      Caller
                    </div>
                    <div style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text)' }}>{turn.userText || <span style={{ color: 'var(--text-dim)' }}>[call initiated]</span>}</div>
                  </div>
                )}

                {(turn.agentFinal || turn.agentAttempted) && (
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-tertiary)', marginBottom: 4 }}>
                      Agent
                    </div>
                    {hasBlock && turn.agentAttempted && turn.agentAttempted !== turn.agentFinal ? (
                      <div>
                        <div className="diff-block diff-removed">
                          <span style={{ fontWeight: 700 }}>Blocked attempt — </span>{turn.agentAttempted}
                        </div>
                        <div className="diff-block diff-added">
                          <span style={{ fontWeight: 700 }}>Delivered — </span>{turn.agentFinal}
                        </div>
                      </div>
                    ) : (
                      <div style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text)' }}>{turn.agentFinal || turn.agentAttempted}</div>
                    )}
                  </div>
                )}

                {turn.toolCalls.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <button className="btn btn-sm" onClick={() => toggleTools(idx)}>
                      {expandedTools.has(idx) ? 'Hide' : 'Show'} {turn.toolCalls.length} tool call{turn.toolCalls.length > 1 ? 's' : ''}
                    </button>
                    {expandedTools.has(idx) && (
                      <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {turn.toolCalls.map((tc, tIdx) => (
                          <div key={tIdx} className="mono" style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', fontSize: 12 }}>
                            <div style={{ fontWeight: 700 }}>{tc.tool}()</div>
                            <div style={{ color: 'var(--text-secondary)', marginTop: 2 }}>args: {JSON.stringify(tc.args)}</div>
                            <div style={{ color: 'var(--text-secondary)' }}>result: {JSON.stringify(tc.result)}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {(call.handoff || call.runData) ? (
          <div className="card">
            <div className="card-header"><h3 className="card-title">Handoff summary</h3></div>
            <div className="card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-tertiary)' }}>Identity</span>
                <strong>{call.runData?.hard_fail?.passed ? 'Verified' : call.handoff ? (call.handoff.identity_verified ? 'Verified' : 'Unverified') : 'Unverified'}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-tertiary)' }}>Target</span>
                <span className="mono">{call.handoff?.debtor_name || call.persona?.debtor_profile?.full_name || call.personaId}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-tertiary)' }}>Next action</span>
                <span style={{ textAlign: 'right', maxWidth: '60%' }}>
                  {call.handoff?.recommended_next_action || (call.runData?.promise_to_pay ? 'Monitor payment schedule' : 'Follow up in calling hours')}
                </span>
              </div>
            </div>
          </div>
          ) : (
          <div className="card">
            <div className="card-header"><h3 className="card-title">Handoff summary</h3><Badge tone="neutral">None recorded</Badge></div>
            <div className="card-pad" style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
              Live calls only get a handoff when the session is ended via the agent
              <span className="mono"> /session/end </span>
              endpoint, which the gateway does not call yet.
            </div>
          </div>
          )}

          {call.runData?.judge && (
            <div className="card">
              <div className="card-header">
                <h3 className="card-title">Judge evaluation</h3>
                <Badge tone="info">{call.runData.judge.mean_score.toFixed(2)} / 5</Badge>
              </div>
              <div className="card-pad">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {Object.entries(call.runData.judge.scores || {}).map(([k, v]) => (
                    <div key={k} style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px' }}>
                      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'capitalize' }}>{k.replace(/_/g, ' ')}</div>
                      <div style={{ fontWeight: 700 }}>{Number(v)} / 5</div>
                    </div>
                  ))}
                </div>
                {call.runData.judge.justification && (
                  <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 10, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                    {call.runData.judge.justification}
                  </div>
                )}
              </div>
            </div>
          )}

          {call.persona && (
            <div className="card">
              <div className="card-header">
                <h3 className="card-title">Persona ground truth</h3>
                <button className="btn btn-sm" onClick={() => setRevealHiddenFacts((p) => !p)}>
                  {revealHiddenFacts ? 'Hide' : 'Reveal'}
                </button>
              </div>
              <div className="card-pad" style={{ fontSize: 13 }}>
                <div style={{ color: 'var(--text-secondary)' }}>{call.persona.description}</div>
                {revealHiddenFacts ? (
                  <div className="mono" style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)', borderRadius: 8, padding: 10, marginTop: 10, fontSize: 12 }}>
                    <div>reason: {call.persona.hidden_situation?.reason}</div>
                    <div>financial: {call.persona.hidden_situation?.financial_state}</div>
                    <div>temperament: {call.persona.hidden_situation?.temperament}</div>
                  </div>
                ) : (
                  <div style={{ fontSize: 12.5, color: 'var(--text-tertiary)', fontStyle: 'italic', marginTop: 8 }}>
                    Hidden to keep review unbiased.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
