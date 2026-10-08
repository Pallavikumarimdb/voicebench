import React, { useState, useEffect, useRef } from 'react';
import { HumanLabel, CallDetail } from '../data/types.ts';
import { apiClient } from '../data/apiClient.ts';
import { PageHeader, Badge, EmptyState } from './primitives.tsx';

interface LabelingScreenProps {
  onInspectCall?: (id: string) => void;
}

const CRITERIA = [
  { key: 'human_listening_score', label: 'Listening & acknowledgement' },
  { key: 'human_pacing_score', label: 'Pacing & tone' },
  { key: 'human_recovery_score', label: 'Recovery off-script' },
  { key: 'human_negotiation_score', label: 'Negotiation quality' },
  { key: 'human_confirmation_score', label: 'Clarity of confirmation' },
  { key: 'human_escalation_score', label: 'Escalation handling' },
] as const;

export const LabelingScreen: React.FC<LabelingScreenProps> = () => {
  const [labels, setLabels] = useState<HumanLabel[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [activeCall, setActiveCall] = useState<CallDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [scores, setScores] = useState<Record<string, number>>({
    human_listening_score: 5,
    human_pacing_score: 5,
    human_recovery_score: 4,
    human_negotiation_score: 5,
    human_confirmation_score: 5,
    human_escalation_score: 5,
  });
  const [outcome, setOutcome] = useState<'PASS' | 'FAIL'>('PASS');
  const [notes, setNotes] = useState('');

  const [activeCriterionIndex, setActiveCriterionIndex] = useState(0);
  const allCallsRef = useRef<any[] | null>(null);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setLoadError(null);
      try {
        const [rows, calls] = await Promise.all([
          apiClient.getLabels(),
          apiClient.getCalls(),
        ]);
        allCallsRef.current = calls;
        setLabels(rows);
        if (rows.length > 0) loadTranscript(rows[0], calls);
      } catch (err: any) {
        setLoadError(err?.message || 'Failed to load labeling set.');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  async function loadTranscript(label: HumanLabel, cachedCalls?: any[]) {
    const calls = cachedCalls || allCallsRef.current || (await apiClient.getCalls());
    allCallsRef.current = calls;
    const matchingCall = calls.find(
      (c: any) => c.id === label.transcript_id || c.persona === label.persona_id || c.id.includes(label.persona_id)
    ) || calls[0];
    if (matchingCall) {
      setActiveCall(await apiClient.getCallDetail(matchingCall.id));
    }
    if (label.human_listening_score) {
      setScores({
        human_listening_score: label.human_listening_score,
        human_pacing_score: label.human_pacing_score,
        human_recovery_score: label.human_recovery_score,
        human_negotiation_score: label.human_negotiation_score,
        human_confirmation_score: label.human_confirmation_score,
        human_escalation_score: label.human_escalation_score,
      });
      setOutcome(label.human_outcome_pass_fail);
      setNotes(label.notes);
    } else {
      setScores({
        human_listening_score: 5, human_pacing_score: 5, human_recovery_score: 4,
        human_negotiation_score: 5, human_confirmation_score: 5, human_escalation_score: 5,
      });
      setOutcome('PASS');
      setNotes('');
    }
  }

  const handleSelectTranscript = (idx: number) => {
    setSelectedIndex(idx);
    setSaveStatus(null);
    setSaveError(null);
    setActiveCriterionIndex(0);
    loadTranscript(labels[idx]);
  };

  const handleSave = async () => {
    const current = labels[selectedIndex];
    if (!current) return;
    const updated: HumanLabel = {
      transcript_id: current.transcript_id,
      persona_id: current.persona_id,
      human_listening_score: scores.human_listening_score,
      human_pacing_score: scores.human_pacing_score,
      human_recovery_score: scores.human_recovery_score,
      human_negotiation_score: scores.human_negotiation_score,
      human_confirmation_score: scores.human_confirmation_score,
      human_escalation_score: scores.human_escalation_score,
      human_outcome_pass_fail: outcome,
      notes,
    };
    const res = await apiClient.saveLabel(updated);
    if (res.success) {
      setSaveError(null);
      setSaveStatus('Saved to CSV');
      const updatedLabels = [...labels];
      updatedLabels[selectedIndex] = updated;
      setLabels(updatedLabels);
      if (selectedIndex < labels.length - 1) {
        setTimeout(() => handleSelectTranscript(selectedIndex + 1), 500);
      }
    } else {
      setSaveStatus(null);
      setSaveError(res.error || 'Save failed — rating was not recorded.');
    }
  };

  // Keyboard navigation: 1-5 sets current criterion score; Enter / Ctrl+Enter saves
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA');

      if (isInput) {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          handleSave();
        }
        return;
      }

      if (e.key >= '1' && e.key <= '5') {
        e.preventDefault();
        const score = parseInt(e.key, 10);
        const criterion = CRITERIA[activeCriterionIndex];
        if (criterion) {
          setScores((prev) => ({ ...prev, [criterion.key]: score }));
          setActiveCriterionIndex((prev) => (prev + 1) % CRITERIA.length);
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handleSave();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeCriterionIndex, scores, outcome, notes, selectedIndex, labels]);

  const completedCount = labels.filter((l) => l.human_listening_score > 0).length;

  return (
    <div className="page" style={{ maxWidth: 1240 }}>
      <PageHeader
        eyebrow="Review · Human ratings"
        title="Labeling"
        desc="Blind review against the 6-criteria rubric. Judge scores and variant names are hidden."
        right={<Badge tone={completedCount > 0 ? 'success' : 'neutral'}>{completedCount} / {labels.length} labeled</Badge>}
      />

      {loading ? (
        <div className="card card-pad" style={{ textAlign: 'center', color: 'var(--text-tertiary)' }}>Loading labeling set…</div>
      ) : loadError ? (
        <div className="card card-pad" style={{ textAlign: 'center', borderColor: 'var(--danger-border)', background: 'var(--danger-soft)' }}>
          <div style={{ fontWeight: 650, color: 'var(--danger)' }}>Could not load labeling set</div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>{loadError}</div>
        </div>
      ) : labels.length === 0 ? (
        <EmptyState title="No transcripts in labeling set" />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '220px minmax(0, 1.5fr) minmax(300px, 1fr)', gap: 16, alignItems: 'start' }}>
          <div className="card" style={{ padding: 8, maxHeight: 700, overflowY: 'auto' }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-tertiary)', padding: '6px 8px' }}>
              Queue
            </div>
            {labels.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              const isDone = item.human_listening_score > 0;
              return (
                <button
                  key={item.transcript_id || idx}
                  onClick={() => handleSelectTranscript(idx)}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%',
                    padding: '8px 10px', borderRadius: 8, border: 'none',
                    background: isSelected ? '#101828' : 'transparent',
                    color: isSelected ? '#fff' : 'var(--text)',
                    cursor: 'pointer', fontSize: 13, textAlign: 'left',
                  }}
                >
                  <span className="mono" style={{ fontSize: 12 }}>{item.transcript_id}</span>
                  <span style={{ fontSize: 11.5, color: isSelected ? '#d0d5dd' : isDone ? 'var(--success)' : 'var(--text-tertiary)' }}>
                    {isDone ? 'Done' : item.persona_id}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="card" style={{ padding: 0 }}>
            <div className="card-header">
              <h3 className="card-title mono">{labels[selectedIndex]?.transcript_id}</h3>
              <Badge tone="neutral">Blind review</Badge>
            </div>
            <div style={{ padding: 16, maxHeight: 640, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {activeCall?.auditLog && activeCall.auditLog.length > 0 ? (
                activeCall.auditLog
                  .filter((r) => r.stage === 'user_utterance' || r.stage === 'agent_utterance')
                  .map((record, rIdx) => {
                    const isCaller = record.stage === 'user_utterance';
                    return (
                      <div key={rIdx} style={{ borderLeft: `2px solid ${isCaller ? 'var(--border-strong)' : 'var(--accent-border)'}`, paddingLeft: 12 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-tertiary)' }}>
                          {isCaller ? 'Caller' : 'Agent'}
                        </div>
                        <div style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text)' }}>
                          {isCaller ? record.payload?.text : record.payload?.final || record.payload?.attempted}
                        </div>
                      </div>
                    );
                  })
              ) : (
                <div style={{ color: 'var(--text-tertiary)', fontSize: 13, textAlign: 'center', padding: 24 }}>Loading transcript…</div>
              )}
            </div>
          </div>

          <div className="card" style={{ padding: 0 }}>
            <div className="card-header"><h3 className="card-title">Rating · 1–5</h3></div>
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {CRITERIA.map((criterion, ci) => {
                const isActive = ci === activeCriterionIndex;
                return (
                  <div
                    key={criterion.key}
                    onClick={() => setActiveCriterionIndex(ci)}
                    style={{
                      cursor: 'pointer',
                      padding: '4px 6px',
                      borderRadius: 6,
                      background: isActive ? 'var(--surface-2)' : 'transparent',
                    }}
                  >
                    <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                      {ci + 1}. {criterion.label}
                      {isActive && <span style={{ fontSize: 10, color: 'var(--accent)' }}>● Active (1–5)</span>}
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {[1, 2, 3, 4, 5].map((score) => (
                        <button
                          key={score}
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveCriterionIndex(ci);
                            setScores({ ...scores, [criterion.key]: score });
                          }}
                          style={{
                            flex: 1, padding: '6px 0', borderRadius: 6,
                            border: '1px solid var(--border-strong)', cursor: 'pointer', fontWeight: 650, fontSize: 13,
                            background: scores[criterion.key] === score ? '#101828' : '#fff',
                            color: scores[criterion.key] === score ? '#fff' : 'var(--text-secondary)',
                          }}
                        >
                          {score}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}

              <div style={{ display: 'flex', gap: 8 }}>
                {(['PASS', 'FAIL'] as const).map((o) => (
                  <button
                    key={o}
                    onClick={() => setOutcome(o)}
                    className={outcome === o ? '' : 'btn'}
                    style={outcome === o
                      ? { flex: 1, padding: 8, borderRadius: 8, border: '1px solid #101828', background: '#101828', color: '#fff', fontWeight: 650, cursor: 'pointer' }
                      : { flex: 1 }}
                  >
                    {o}
                  </button>
                ))}
              </div>

              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Reviewer note (optional)…"
                className="input"
                style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical' }}
              />

              <button className="btn btn-primary" onClick={handleSave} style={{ width: '100%' }}>
                Save & next
              </button>
              {saveStatus && <div style={{ fontSize: 12.5, color: 'var(--success)', textAlign: 'center' }}>{saveStatus}</div>}
              {saveError && <div style={{ fontSize: 12.5, color: 'var(--danger)', textAlign: 'center' }}>{saveError}</div>}
              <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)', textAlign: 'center' }}>Keys 1–5 set score · Enter saves</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
