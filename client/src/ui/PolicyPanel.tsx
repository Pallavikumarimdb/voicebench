import React, { useState, useEffect } from 'react';
import { apiClient } from '../data/apiClient.ts';
import { Badge } from './primitives.tsx';

export const PolicyPanel: React.FC = () => {
  const [policies, setPolicies] = useState<Array<{ id: string; filename: string; content: string }>>([]);
  const [selectedPolicyId, setSelectedPolicyId] = useState<string>('default');
  const [policyContent, setPolicyContent] = useState<string>('');
  const [originalContent, setOriginalContent] = useState<string>('');
  const [saving, setSaving] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [weakensCompliance, setWeakensCompliance] = useState<boolean>(false);
  const [confirmedWeakening, setConfirmedWeakening] = useState<boolean>(false);
  const [adminToken, setAdminToken] = useState<string>('dev-admin-secret-token');

  const fetchPolicies = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await apiClient.getPolicies();
      setPolicies(res.policies || []);
      const current = res.policies?.find((p) => p.id === selectedPolicyId) || res.policies?.[0];
      if (current) {
        setSelectedPolicyId(current.id);
        setPolicyContent(current.content);
        setOriginalContent(current.content);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to load policy profiles');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPolicies();
  }, []);

  const handleSelect = (id: string) => {
    setSelectedPolicyId(id);
    const p = policies.find((item) => item.id === id);
    if (p) {
      setPolicyContent(p.content);
      setOriginalContent(p.content);
      setStatusMessage(null);
      setErrorMessage(null);
    }
  };

  const hasChanges = policyContent !== originalContent;

  const handleSave = async () => {
    if (weakensCompliance && !confirmedWeakening) {
      alert('WARNING: You have flagged this policy change as weakening compliance. Please check the confirmation box before proceeding.');
      return;
    }

    setSaving(true);
    setStatusMessage(null);
    setErrorMessage(null);

    try {
      await apiClient.savePolicy(
        selectedPolicyId,
        policyContent,
        adminToken,
        'Updated via Agent Studio Policy Editor',
        weakensCompliance
      );
      setStatusMessage('Policy successfully saved and hot-reloaded across LLM Gateway!');
      setOriginalContent(policyContent);
      setWeakensCompliance(false);
      setConfirmedWeakening(false);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to save policy');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>LLM Gateway Routing & Compliance Policy</h3>
          <div style={{ fontSize: '0.825rem', color: 'var(--text-secondary)' }}>
            Declarative profile governing routing tiers, TTFT latency budgets, and exact-hash cache rules.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Badge tone={hasChanges ? 'warning' : 'neutral'}>
            {hasChanges ? 'Unsaved changes' : 'Synchronized'}
          </Badge>
          <button
            className="btn btn-sm btn-primary"
            onClick={handleSave}
            disabled={saving || !hasChanges}
          >
            {saving ? 'Saving…' : 'Save & Hot-Reload'}
          </button>
        </div>
      </div>

      {statusMessage && (
        <div style={{ padding: '8px 12px', background: 'rgba(16, 185, 129, 0.1)', color: '#059669', borderRadius: 6, fontSize: '0.85rem' }}>
          ✓ {statusMessage}
        </div>
      )}

      {errorMessage && (
        <div style={{ padding: '8px 12px', background: 'rgba(239, 68, 68, 0.1)', color: '#dc2626', borderRadius: 6, fontSize: '0.85rem' }}>
          ✕ {errorMessage}
        </div>
      )}

      <div style={{ display: 'flex', gap: 12 }}>
        <div style={{ width: 220, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-tertiary)' }}>
            POLICY PROFILES {loading && '(Loading…)'}
          </span>
          {policies.map((p) => (
            <button
              key={p.id}
              onClick={() => handleSelect(p.id)}
              style={{
                textAlign: 'left',
                padding: '8px 12px',
                borderRadius: 6,
                border: '1px solid var(--border-subtle)',
                background: selectedPolicyId === p.id ? 'var(--bg-card-active, #f3f4f6)' : 'transparent',
                fontWeight: selectedPolicyId === p.id ? 700 : 500,
                fontSize: '0.85rem',
                cursor: 'pointer'
              }}
            >
              📄 {p.id}.yaml
            </button>
          ))}

          <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-tertiary)' }}>ADMIN AUTHORIZATION</span>
            <input
              type="password"
              placeholder="Admin Bearer Token"
              value={adminToken}
              onChange={(e) => setAdminToken(e.target.value)}
              style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border-subtle)', fontSize: '0.75rem' }}
            />
          </div>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              Editing: <code style={{ color: 'var(--primary)' }}>config/policies/{selectedPolicyId}.yaml</code>
            </span>
          </div>

          <textarea
            value={policyContent}
            onChange={(e) => setPolicyContent(e.target.value)}
            rows={22}
            style={{
              width: '100%',
              fontFamily: 'Consolas, Monaco, "Courier New", monospace',
              fontSize: '0.825rem',
              lineHeight: 1.5,
              padding: 12,
              borderRadius: 8,
              border: '1px solid var(--border-strong)',
              background: 'var(--bg-editor, #1e1e1e)',
              color: 'var(--text-editor, #d4d4d4)',
              resize: 'vertical'
            }}
          />

          <div style={{ padding: 12, borderRadius: 8, background: 'var(--bg-subtle, #f9fafb)', border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={weakensCompliance}
                onChange={(e) => setWeakensCompliance(e.target.checked)}
              />
              <span style={{ fontWeight: 600, color: weakensCompliance ? '#b91c1c' : 'inherit' }}>
                This update weakens or modifies regulatory compliance rules / token masks
              </span>
            </label>

            {weakensCompliance && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', color: '#b91c1c', marginLeft: 24, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={confirmedWeakening}
                  onChange={(e) => setConfirmedWeakening(e.target.checked)}
                />
                I explicitly confirm and authorize weakening compliance guards. This event will be permanently written to the signed tamper-evident policy audit trail.
              </label>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
