import React, { useState, useEffect } from 'react';
import { ToolItem, ToolExecutionResult, ToolParam } from '../data/types.ts';
import { apiClient } from '../data/apiClient.ts';
import { PageHeader, Badge, EmptyState } from './primitives.tsx';

const StatCard: React.FC<{
  label: string;
  value: React.ReactNode;
  sub?: string;
  tone?: 'good' | 'bad' | 'warn' | 'neutral' | 'accent';
}> = ({ label, value, sub, tone }) => {
  const colorMap = {
    good: 'var(--success)',
    bad: 'var(--danger)',
    warn: 'var(--warning)',
    accent: 'var(--accent)',
    neutral: 'var(--text-primary)',
  };
  return (
    <div
      style={{
        background: 'var(--surface)',
        borderRadius: 8,
        padding: '12px 14px',
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
        {label}
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4, color: tone ? colorMap[tone] : 'var(--text-primary)' }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
};

export const ToolsPanel: React.FC = () => {
  const [tools, setTools] = useState<ToolItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'builtin' | 'webhook'>('all');

  // Test Runner State
  const [activeTestTool, setActiveTestTool] = useState<ToolItem | null>(null);
  const [testArgs, setTestArgs] = useState<Record<string, any>>({});
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<ToolExecutionResult | null>(null);

  // New Webhook Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newToolName, setNewToolName] = useState('');
  const [newToolUrl, setNewToolUrl] = useState('');
  const [newToolMethod, setNewToolMethod] = useState<'POST' | 'GET'>('POST');
  const [newToolDesc, setNewToolDesc] = useState('');
  const [newToolTimeout, setNewToolTimeout] = useState(3000);
  const [newToolFiller, setNewToolFiller] = useState('確認しておりますので、少々お待ちください。');
  const [newToolParams, setNewToolParams] = useState<ToolParam[]>([
    { name: 'customer_id', type: 'string', description: 'Customer identifier', required: true },
  ]);
  const [savingWebhook, setSavingWebhook] = useState(false);

  const fetchTools = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiClient.getTools();
      setTools(res.tools || []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load tools schema');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTools();
  }, []);

  const openTestDrawer = (tool: ToolItem) => {
    setActiveTestTool(tool);
    setTestResult(null);
    const initialArgs: Record<string, any> = {};
    tool.parameters.forEach((p) => {
      if (p.name === 'debtor_id' || p.name === 'customer_id') initialArgs[p.name] = 'deb_001';
      else if (p.name === 'amount') initialArgs[p.name] = 50000;
      else if (p.name === 'payment_date') initialArgs[p.name] = '2026-11-01';
      else if (p.name === 'phone') initialArgs[p.name] = '090-1234-5678';
      else if (p.name === 'template') initialArgs[p.name] = p.enum ? p.enum[0] : 'payment_link';
      else if (p.name === 'target_date') initialArgs[p.name] = '2026-10-15';
      else if (p.name === 'callback_time') initialArgs[p.name] = '明日14:00';
      else if (p.name === 'reason') initialArgs[p.name] = 'debtor_request';
      else initialArgs[p.name] = p.type === 'integer' || p.type === 'number' ? 0 : '';
    });
    setTestArgs(initialArgs);
  };

  const executeTest = async () => {
    if (!activeTestTool) return;
    try {
      setTesting(true);
      setTestResult(null);
      const res = await apiClient.executeTool(activeTestTool.name, testArgs);
      setTestResult(res);
    } catch (err: any) {
      setTestResult({
        success: false,
        tool: activeTestTool.name,
        error: err?.message || 'Execution error',
        latency_ms: 0,
      });
    } finally {
      setTesting(false);
    }
  };

  const handleCreateWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newToolName || !newToolUrl) return;
    try {
      setSavingWebhook(true);
      await apiClient.registerTool({
        name: newToolName,
        url: newToolUrl,
        method: newToolMethod,
        description: newToolDesc,
        timeout_ms: newToolTimeout,
        filler_phrase: newToolFiller,
        parameters: newToolParams,
      });
      setShowCreateModal(false);
      setNewToolName('');
      setNewToolUrl('');
      fetchTools();
    } catch (err: any) {
      alert('Failed to register webhook: ' + err.message);
    } finally {
      setSavingWebhook(false);
    }
  };

  const handleDeleteTool = async (name: string) => {
    if (!confirm(`Are you sure you want to delete custom webhook '${name}'?`)) return;
    try {
      await apiClient.deleteTool(name);
      if (activeTestTool?.name === name) setActiveTestTool(null);
      fetchTools();
    } catch (err: any) {
      alert('Delete failed: ' + err.message);
    }
  };

  const filteredTools = tools.filter((t) => {
    const matchesSearch =
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.description.toLowerCase().includes(search.toLowerCase());
    const matchesType = filterType === 'all' || t.tool_type === filterType;
    return matchesSearch && matchesType;
  });

  const builtinCount = tools.filter((t) => t.tool_type === 'builtin').length;
  const webhookCount = tools.filter((t) => t.tool_type === 'webhook').length;

  return (
    <div className="page" style={{ maxWidth: 1240 }}>
      <PageHeader
        eyebrow="Build · Function Calling"
        title="Dynamic Tools & Webhook Engine"
        desc="Register external CRM webhooks, define OpenAPI schemas, and test live function calling with low-latency fillers."
        right={
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-sm btn-primary" onClick={() => setShowCreateModal(true)}>
              + Register Webhook
            </button>
            <button className="btn btn-sm" onClick={fetchTools} disabled={loading}>
              ↻ Refresh
            </button>
          </div>
        }
      />

      {/* Metrics Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 16 }}>
        <StatCard label="Registered Tools" value={tools.length} sub="OpenAPI compatible schemas" />
        <StatCard label="Built-in Enterprise" value={builtinCount} tone="good" sub="Collections, KYC & CRM tools" />
        <StatCard label="Custom Webhooks" value={webhookCount} tone="accent" sub="Live external HTTP endpoints" />
        <StatCard label="Signature Security" value="HMAC-SHA256" tone="neutral" sub="X-Voice-Signature header" />
      </div>

      {/* Filter / Search Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          marginBottom: 16,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', gap: 6 }}>
          {(['all', 'builtin', 'webhook'] as const).map((t) => (
            <button
              key={t}
              className={`btn btn-sm ${filterType === t ? 'btn-primary' : ''}`}
              onClick={() => setFilterType(t)}
              style={{ textTransform: 'capitalize' }}
            >
              {t === 'all' ? `All (${tools.length})` : t === 'builtin' ? `Builtin (${builtinCount})` : `Webhooks (${webhookCount})`}
            </button>
          ))}
        </div>
        <input
          type="search"
          placeholder="Filter tools by name or description…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            padding: '6px 12px',
            borderRadius: 6,
            border: '1px solid var(--border)',
            background: 'var(--surface)',
            fontSize: 13,
            minWidth: 260,
          }}
        />
      </div>

      {error && (
        <div style={{ padding: 12, background: 'var(--danger-soft)', border: '1px solid var(--danger-border)', color: 'var(--danger)', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
          ⚠️ {error}
        </div>
      )}

      {/* Main Grid: Tools List + Test Runner Drawer */}
      <div style={{ display: 'grid', gridTemplateColumns: activeTestTool ? 'minmax(0, 1.4fr) minmax(360px, 1fr)' : '1fr', gap: 16 }}>
        {/* Tools Cards List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {loading && tools.length === 0 && <EmptyState title="Loading tool catalog..." />}
          {!loading && filteredTools.length === 0 && <EmptyState title="No tools matching criteria" />}

          {filteredTools.map((tool) => {
            const isWebhook = tool.tool_type === 'webhook';
            const isSelected = activeTestTool?.name === tool.name;

            return (
              <div
                key={tool.name}
                style={{
                  background: 'var(--surface)',
                  borderRadius: 10,
                  border: isSelected ? '2px solid var(--accent)' : '1px solid var(--border)',
                  padding: '16px 18px',
                  boxShadow: 'var(--shadow-sm)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                  transition: 'border-color 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="mono" style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                      {tool.name}
                    </span>
                    <Badge tone={isWebhook ? 'info' : 'neutral'} dot>
                      {tool.tool_type}
                    </Badge>
                    {isWebhook && tool.method && (
                      <span className="mono" style={{ fontSize: 11, padding: '2px 5px', borderRadius: 4, background: '#1e293b', color: '#38bdf8', fontWeight: 600 }}>
                        {tool.method}
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      className="btn btn-sm btn-primary"
                      onClick={() => openTestDrawer(tool)}
                      style={{ fontSize: 12, padding: '4px 10px' }}
                    >
                      ⚡ Test Tool
                    </button>
                    {isWebhook && (
                      <button
                        className="btn btn-sm"
                        onClick={() => handleDeleteTool(tool.name)}
                        style={{ fontSize: 12, padding: '4px 8px', color: 'var(--danger)' }}
                        title="Delete custom webhook"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>

                <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  {tool.description}
                </div>

                {isWebhook && tool.url && (
                  <div className="mono" style={{ fontSize: 12, color: 'var(--text-tertiary)', background: 'var(--bg-subtle)', padding: '4px 8px', borderRadius: 4, wordBreak: 'break-all' }}>
                    🔗 {tool.url}
                  </div>
                )}

                {/* Parameters */}
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
                    Parameters ({tool.parameters.length})
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {tool.parameters.map((p) => (
                      <span
                        key={p.name}
                        className="mono"
                        style={{
                          fontSize: 11,
                          padding: '2px 6px',
                          borderRadius: 4,
                          background: 'var(--bg-subtle)',
                          border: '1px solid var(--border)',
                          color: 'var(--text-secondary)',
                        }}
                        title={p.description}
                      >
                        <b style={{ color: 'var(--text-primary)' }}>{p.name}</b>: {p.type}
                        {p.required && <span style={{ color: 'var(--danger)' }}>*</span>}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Filler Phrase */}
                {tool.filler_phrase && (
                  <div style={{ fontSize: 12, color: 'var(--text-dim)', fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span>💬 Filler utterance:</span>
                    <span>"{tool.filler_phrase}"</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Interactive Test Sandbox Drawer */}
        {activeTestTool && (
          <div
            style={{
              background: 'var(--surface)',
              borderRadius: 10,
              border: '1px solid var(--border)',
              padding: 18,
              boxShadow: 'var(--shadow-md)',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
              position: 'sticky',
              top: 16,
              alignSelf: 'start',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--accent)', letterSpacing: '0.05em' }}>
                  Execution Sandbox
                </div>
                <div className="mono" style={{ fontSize: 15, fontWeight: 700 }}>
                  {activeTestTool.name}
                </div>
              </div>
              <button className="btn btn-sm" onClick={() => setActiveTestTool(null)}>
                Close ✕
              </button>
            </div>

            <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
              Configure test input parameters below and execute against the active agent pipeline.
            </div>

            {/* Parameter Inputs */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {activeTestTool.parameters.map((p) => (
                <div key={p.name}>
                  <label style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                    <span>
                      {p.name} {p.required && <span style={{ color: 'var(--danger)' }}>*</span>}
                    </span>
                    <span className="mono" style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                      {p.type}
                    </span>
                  </label>
                  {p.enum ? (
                    <select
                      value={testArgs[p.name] ?? ''}
                      onChange={(e) => setTestArgs({ ...testArgs, [p.name]: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '6px 8px',
                        borderRadius: 6,
                        border: '1px solid var(--border)',
                        background: 'var(--surface)',
                        fontSize: 13,
                      }}
                    >
                      {p.enum.map((opt: string) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={p.type === 'integer' || p.type === 'number' ? 'number' : 'text'}
                      value={testArgs[p.name] ?? ''}
                      onChange={(e) => {
                        const val =
                          p.type === 'integer'
                            ? parseInt(e.target.value, 10) || 0
                            : p.type === 'number'
                            ? parseFloat(e.target.value) || 0
                            : e.target.value;
                        setTestArgs({ ...testArgs, [p.name]: val });
                      }}
                      placeholder={p.description}
                      style={{
                        width: '100%',
                        padding: '6px 8px',
                        borderRadius: 6,
                        border: '1px solid var(--border)',
                        background: 'var(--surface)',
                        fontSize: 13,
                      }}
                    />
                  )}
                </div>
              ))}
            </div>

            <button
              className="btn btn-primary"
              onClick={executeTest}
              disabled={testing}
              style={{ width: '100%', justifyContent: 'center', marginTop: 4 }}
            >
              {testing ? 'Executing...' : '▶ Run Function Test'}
            </button>

            {/* Execution Result Box */}
            {testResult && (
              <div
                style={{
                  background: '#090d16',
                  borderRadius: 8,
                  padding: 12,
                  border: '1px solid #1e293b',
                  color: '#f8fafc',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: testResult.success ? '#10b981' : '#ef4444',
                      }}
                    />
                    <span style={{ fontSize: 12, fontWeight: 700 }}>
                      {testResult.success ? 'Success' : 'Execution Failed'}
                    </span>
                  </div>
                  <span
                    className="mono"
                    style={{
                      fontSize: 11,
                      padding: '2px 6px',
                      borderRadius: 4,
                      background: '#1e293b',
                      color: testResult.latency_ms < 100 ? '#38bdf8' : '#fbbf24',
                    }}
                  >
                    ⚡ {testResult.latency_ms} ms
                  </span>
                </div>

                <pre
                  style={{
                    margin: 0,
                    padding: 8,
                    background: '#030712',
                    borderRadius: 6,
                    fontSize: 11,
                    fontFamily: 'monospace',
                    overflowX: 'auto',
                    maxHeight: 220,
                    color: testResult.success ? '#93c5fd' : '#fca5a5',
                  }}
                >
                  {JSON.stringify(testResult.data || testResult.error || testResult, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal: Register Custom Webhook */}
      {showCreateModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: 16,
          }}
          onClick={() => setShowCreateModal(false)}
        >
          <div
            style={{
              background: 'var(--surface)',
              borderRadius: 12,
              padding: 24,
              maxWidth: 540,
              width: '100%',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
              border: '1px solid var(--border)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>Register Custom Webhook Tool</div>
              <button className="btn btn-sm" onClick={() => setShowCreateModal(false)}>
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateWebhook} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                  Tool Function Name (snake_case)
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. check_order_status"
                  value={newToolName}
                  onChange={(e) => setNewToolName(e.target.value)}
                  style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 13 }}
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                  Webhook Endpoint URL
                </label>
                <input
                  type="url"
                  required
                  placeholder="https://api.yourdomain.com/voice-webhooks"
                  value={newToolUrl}
                  onChange={(e) => setNewToolUrl(e.target.value)}
                  style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 13 }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                    HTTP Method
                  </label>
                  <select
                    value={newToolMethod}
                    onChange={(e) => setNewToolMethod(e.target.value as any)}
                    style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 13 }}
                  >
                    <option value="POST">POST</option>
                    <option value="GET">GET</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                    Timeout (ms)
                  </label>
                  <input
                    type="number"
                    value={newToolTimeout}
                    onChange={(e) => setNewToolTimeout(parseInt(e.target.value, 10) || 3000)}
                    style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 13 }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                  Description (Prompt for LLM Function Caller)
                </label>
                <textarea
                  rows={2}
                  required
                  placeholder="Queries CRM for latest order delivery tracking status"
                  value={newToolDesc}
                  onChange={(e) => setNewToolDesc(e.target.value)}
                  style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 13 }}
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                  Filler Utterance (Spoken while awaiting webhook)
                </label>
                <input
                  type="text"
                  placeholder="注文情報を確認しておりますので、少々お待ちください。"
                  value={newToolFiller}
                  onChange={(e) => setNewToolFiller(e.target.value)}
                  style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 13 }}
                />
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <label style={{ fontSize: 12, fontWeight: 600 }}>
                    Parameters ({newToolParams.length})
                  </label>
                  <button
                    type="button"
                    className="btn btn-sm"
                    style={{ fontSize: 11, padding: '2px 6px' }}
                    onClick={() =>
                      setNewToolParams([
                        ...newToolParams,
                        { name: `param_${newToolParams.length + 1}`, type: 'string', description: '', required: true },
                      ])
                    }
                  >
                    + Add Parameter
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {newToolParams.map((p, pIdx) => (
                    <div key={pIdx} style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr auto', gap: 6, alignItems: 'center' }}>
                      <input
                        type="text"
                        placeholder="param_name"
                        value={p.name}
                        onChange={(e) => {
                          const updated = [...newToolParams];
                          updated[pIdx] = { ...p, name: e.target.value };
                          setNewToolParams(updated);
                        }}
                        style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid var(--border)', fontSize: 12 }}
                      />
                      <select
                        value={p.type}
                        onChange={(e) => {
                          const updated = [...newToolParams];
                          updated[pIdx] = { ...p, type: e.target.value };
                          setNewToolParams(updated);
                        }}
                        style={{ padding: '4px 6px', borderRadius: 4, border: '1px solid var(--border)', fontSize: 12 }}
                      >
                        <option value="string">string</option>
                        <option value="integer">integer</option>
                        <option value="number">number</option>
                        <option value="boolean">boolean</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => setNewToolParams(newToolParams.filter((_, idx) => idx !== pIdx))}
                        style={{ background: 'transparent', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: 2 }}
                        title="Remove parameter"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                <button type="button" className="btn btn-sm" onClick={() => setShowCreateModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-sm btn-primary" disabled={savingWebhook}>
                  {savingWebhook ? 'Registering...' : 'Save Webhook Tool'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
