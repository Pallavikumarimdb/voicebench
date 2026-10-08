import React, { useState, useEffect } from 'react';
import { StudioPersonaItem, ToolItem, SimulationResult } from '../data/types.ts';
import { apiClient } from '../data/apiClient.ts';
import { PageHeader, Badge, EmptyState } from './primitives.tsx';

export const AgentStudio: React.FC = () => {
  const [personas, setPersonas] = useState<StudioPersonaItem[]>([]);
  const [selectedPersonaId, setSelectedPersonaId] = useState<string>('');
  const [availableTools, setAvailableTools] = useState<ToolItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // Form State for active persona
  const [formData, setFormData] = useState<Partial<StudioPersonaItem>>({});

  // Simulation Playground State
  const [testInput, setTestInput] = useState('');
  const [simulating, setSimulating] = useState(false);
  const [chatLog, setChatLog] = useState<Array<{ sender: 'user' | 'agent'; text: string; tools?: string[]; latencyMs?: number }>>([]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [pRes, tRes] = await Promise.all([
        apiClient.getStudioPersonas(),
        apiClient.getTools().catch(() => ({ tools: [] })),
      ]);
      setPersonas(pRes.personas || []);
      setAvailableTools(tRes.tools || []);

      if (pRes.personas && pRes.personas.length > 0) {
        const initial = pRes.personas[0];
        setSelectedPersonaId(initial.id);
        setFormData(JSON.parse(JSON.stringify(initial)));
        // Seed chat log with greeting
        if (initial.greeting) {
          setChatLog([{ sender: 'agent', text: initial.greeting }]);
        }
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load studio personas');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSelectPersona = (p: StudioPersonaItem) => {
    setSelectedPersonaId(p.id);
    setFormData(JSON.parse(JSON.stringify(p)));
    setSuccessMessage(null);
    if (p.greeting) {
      setChatLog([{ sender: 'agent', text: p.greeting }]);
    } else {
      setChatLog([]);
    }
  };

  const handleCreateNew = () => {
    const newId = `custom_agent_${Date.now()}`;
    const newPersona: StudioPersonaItem = {
      id: newId,
      name: 'New Custom Voice Agent',
      description: 'Custom conversational agent tailored for specialized workflows.',
      domain: 'custom',
      language: 'ja',
      system_prompt: 'You are a polite, helpful voice assistant.',
      greeting: 'お電話ありがとうございます。AIアシスタントでございます。ご用件をお伺いできますでしょうか。',
      voice_settings: {
        provider: 'kokoro',
        voice_id: 'ja_female_polite',
        speed: 1.0,
        pitch: 1.0,
        barge_in_sensitivity: 'normal',
        pause_threshold_ms: 480,
      },
      llm_settings: {
        provider: 'openai',
        model: 'gpt-4o-mini',
        temperature: 0.3,
        max_tokens: 250,
      },
      knowledge_snippets: [],
      assigned_tools: ['lookup_account', 'schedule_callback'],
      created_at: Date.now(),
      updated_at: Date.now(),
    };
    setPersonas([newPersona, ...personas]);
    setSelectedPersonaId(newId);
    setFormData(newPersona);
    setChatLog([{ sender: 'agent', text: newPersona.greeting }]);
  };

  const handleSave = async () => {
    if (!formData.id || !formData.name) return;
    try {
      setSaving(true);
      setError(null);
      setSuccessMessage(null);
      const res = await apiClient.saveStudioPersona(formData);
      setSuccessMessage(`Saved persona "${res.persona.name}" successfully!`);
      // Update in list
      setPersonas((prev) =>
        prev.map((p) => (p.id === res.persona.id ? res.persona : p))
      );
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      setError(err?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(`Delete persona "${formData.name}"?`)) return;
    try {
      await apiClient.deleteStudioPersona(id);
      const remaining = personas.filter((p) => p.id !== id);
      setPersonas(remaining);
      if (remaining.length > 0) {
        handleSelectPersona(remaining[0]);
      }
    } catch (err: any) {
      alert('Delete failed: ' + err.message);
    }
  };

  const handleSendSimulatorTurn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testInput.trim() || !formData.id) return;
    const userText = testInput.trim();
    setTestInput('');
    setChatLog((prev) => [...prev, { sender: 'user', text: userText }]);

    try {
      setSimulating(true);
      const res: SimulationResult = await apiClient.simulateTurn(formData.id, userText);
      setChatLog((prev) => [
        ...prev,
        {
          sender: 'agent',
          text: res.agent_response,
          tools: res.triggered_tools,
          latencyMs: res.latency_ms,
        },
      ]);
    } catch (err: any) {
      setChatLog((prev) => [
        ...prev,
        { sender: 'agent', text: '⚠️ [Simulation error: ' + (err?.message || 'Failed') + ']' },
      ]);
    } finally {
      setSimulating(false);
    }
  };

  const toggleToolAssignment = (toolName: string) => {
    const current = formData.assigned_tools || [];
    const updated = current.includes(toolName)
      ? current.filter((t) => t !== toolName)
      : [...current, toolName];
    setFormData({ ...formData, assigned_tools: updated });
  };

  const addKnowledgeSnippet = () => {
    const list = formData.knowledge_snippets || [];
    setFormData({
      ...formData,
      knowledge_snippets: [
        ...list,
        { title: `Policy Document #${list.length + 1}`, text: 'Enter grounding reference facts or guidelines here...' },
      ],
    });
  };

  const removeKnowledgeSnippet = (idx: number) => {
    const list = formData.knowledge_snippets || [];
    setFormData({
      ...formData,
      knowledge_snippets: list.filter((_, i) => i !== idx),
    });
  };

  const filteredPersonas = personas.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.description.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="page" style={{ maxWidth: 1400 }}>
      <PageHeader
        eyebrow="Build · Visual Architect"
        title="No-Code Voice Agent Studio"
        desc="Visually design agent personas, tune LLM prompts, configure voice timbre, assign tools, and test live conversation turns."
        right={
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-sm btn-primary" onClick={handleCreateNew}>
              + New Persona
            </button>
            <button className="btn btn-sm" onClick={handleSave} disabled={saving} style={{ background: '#10b981', color: '#fff', border: 'none' }}>
              {saving ? 'Saving...' : '💾 Save Persona'}
            </button>
          </div>
        }
      />

      {error && (
        <div style={{ padding: 12, background: 'var(--danger-soft)', border: '1px solid var(--danger-border)', color: 'var(--danger)', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
          ⚠️ {error}
        </div>
      )}
      {successMessage && (
        <div style={{ padding: 12, background: 'var(--success-soft)', border: '1px solid var(--success-border)', color: 'var(--success)', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
          ✓ {successMessage}
        </div>
      )}

      {/* 3-Column Studio Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '260px minmax(0, 1.8fr) minmax(360px, 1.2fr)', gap: 16, alignItems: 'start' }}>
        
        {/* COLUMN 1: Persona Library List */}
        <div style={{ background: 'var(--surface)', borderRadius: 10, border: '1px solid var(--border)', padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-tertiary)' }}>
            Persona Library ({personas.length})
          </div>
          <input
            type="search"
            placeholder="Search personas…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12 }}
          />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 600, overflowY: 'auto' }}>
            {loading && <EmptyState title="Loading personas..." />}
            {!loading && filteredPersonas.length === 0 && <EmptyState title="No personas found" />}
            {filteredPersonas.map((p) => {
              const isSelected = p.id === selectedPersonaId;
              return (
                <div
                  key={p.id}
                  onClick={() => handleSelectPersona(p)}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 8,
                    background: isSelected ? 'var(--accent-soft)' : 'var(--bg-subtle)',
                    border: isSelected ? '1px solid var(--accent)' : '1px solid transparent',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 13, fontWeight: 650, color: isSelected ? 'var(--accent)' : 'var(--text-primary)' }}>
                      {p.name}
                    </span>
                    <span className="mono" style={{ fontSize: 10, padding: '1px 4px', borderRadius: 3, background: 'var(--surface)', border: '1px solid var(--border)' }}>
                      {p.language.toUpperCase()}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.description}
                  </div>
                  <div style={{ display: 'flex', gap: 4, marginTop: 2 }}>
                    <Badge tone="neutral">{p.domain}</Badge>
                    <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>
                      {(p.assigned_tools || []).length} tools
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* COLUMN 2: Prompt Architect & Persona Config */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Identity & Basic Details */}
          <div style={{ background: 'var(--surface)', borderRadius: 10, border: '1px solid var(--border)', padding: 18, boxShadow: 'var(--shadow-sm)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>Persona Identity & Domain</div>
              {formData.id && (
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => handleDelete(formData.id!)}
                  style={{ color: 'var(--danger)', fontSize: 11 }}
                >
                  Delete Persona
                </button>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                  Agent Name
                </label>
                <input
                  type="text"
                  value={formData.name || ''}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 13 }}
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                  Identifier (Slug)
                </label>
                <input
                  type="text"
                  value={formData.id || ''}
                  onChange={(e) => setFormData({ ...formData, id: e.target.value })}
                  className="mono"
                  style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12 }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                  Domain
                </label>
                <select
                  value={formData.domain || 'collections'}
                  onChange={(e) => setFormData({ ...formData, domain: e.target.value })}
                  style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 13 }}
                >
                  <option value="collections">Collections (金融・債権)</option>
                  <option value="screening">HR Screening (面談・採用)</option>
                  <option value="kyc">KYC & Support (本人確認)</option>
                  <option value="custom">Custom Enterprise</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                  Language
                </label>
                <select
                  value={formData.language || 'ja'}
                  onChange={(e) => setFormData({ ...formData, language: e.target.value as any })}
                  style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 13 }}
                >
                  <option value="ja">Japanese (日本語)</option>
                  <option value="en">English (US/UK)</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                  Summary / Role Description
                </label>
                <input
                  type="text"
                  value={formData.description || ''}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 13 }}
                />
              </div>
            </div>

            {/* First Utterance / Greeting */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                First Spoken Utterance (Greeting upon call connection)
              </label>
              <textarea
                rows={2}
                value={formData.greeting || ''}
                onChange={(e) => setFormData({ ...formData, greeting: e.target.value })}
                placeholder="Initial utterance delivered by TTS immediately when call connects..."
                style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 13, lineHeight: 1.5 }}
              />
            </div>
          </div>

          {/* System Instructions / Prompt */}
          <div style={{ background: 'var(--surface)', borderRadius: 10, border: '1px solid var(--border)', padding: 18, boxShadow: 'var(--shadow-sm)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>System Instructions & Tone of Voice</div>
              <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                {(formData.system_prompt || '').length} characters
              </span>
            </div>
            <textarea
              rows={8}
              value={formData.system_prompt || ''}
              onChange={(e) => setFormData({ ...formData, system_prompt: e.target.value })}
              placeholder="Define behavioral rules, compliance boundaries, tone of voice, negotiation criteria..."
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                fontSize: 13,
                lineHeight: 1.6,
                fontFamily: 'inherit',
              }}
            />
          </div>

          {/* Assigned Tools Selector */}
          <div style={{ background: 'var(--surface)', borderRadius: 10, border: '1px solid var(--border)', padding: 18, boxShadow: 'var(--shadow-sm)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>Assigned Capabilities & Tools</div>
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                  Select functions the LLM is authorized to call during the call.
                </div>
              </div>
              <Badge tone="neutral">
                {(formData.assigned_tools || []).length} of {availableTools.length} enabled
              </Badge>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8, marginTop: 10 }}>
              {availableTools.map((t) => {
                const isChecked = (formData.assigned_tools || []).includes(t.name);
                return (
                  <label
                    key={t.name}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 8,
                      padding: '8px 10px',
                      borderRadius: 6,
                      background: isChecked ? 'var(--accent-soft)' : 'var(--bg-subtle)',
                      border: isChecked ? '1px solid var(--accent)' : '1px solid var(--border)',
                      cursor: 'pointer',
                      fontSize: 12,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleToolAssignment(t.name)}
                      style={{ marginTop: 2 }}
                    />
                    <div>
                      <div className="mono" style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                        {t.name}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2, lineHeight: 1.3 }}>
                        {t.description}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Knowledge Base Snippets */}
          <div style={{ background: 'var(--surface)', borderRadius: 10, border: '1px solid var(--border)', padding: 18, boxShadow: 'var(--shadow-sm)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>Knowledge Base Grounding (RAG)</div>
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                  Injected reference documents and FAQ articles to ground agent answers.
                </div>
              </div>
              <button type="button" className="btn btn-sm btn-primary" onClick={addKnowledgeSnippet}>
                + Add Document
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {(formData.knowledge_snippets || []).length === 0 && (
                <div style={{ fontSize: 12, color: 'var(--text-dim)', fontStyle: 'italic', padding: 8 }}>
                  No knowledge snippets attached. Add policy or product FAQs above.
                </div>
              )}
              {(formData.knowledge_snippets || []).map((snip, idx) => (
                <div
                  key={idx}
                  style={{
                    background: 'var(--bg-subtle)',
                    borderRadius: 8,
                    padding: 12,
                    border: '1px solid var(--border)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <input
                      type="text"
                      value={snip.title}
                      onChange={(e) => {
                        const updated = [...(formData.knowledge_snippets || [])];
                        updated[idx].title = e.target.value;
                        setFormData({ ...formData, knowledge_snippets: updated });
                      }}
                      placeholder="Document title"
                      style={{ fontWeight: 700, fontSize: 12, background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)' }}
                    />
                    <button
                      type="button"
                      onClick={() => removeKnowledgeSnippet(idx)}
                      style={{ background: 'transparent', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: 12 }}
                    >
                      ✕ Remove
                    </button>
                  </div>
                  <textarea
                    rows={2}
                    value={snip.text}
                    onChange={(e) => {
                      const updated = [...(formData.knowledge_snippets || [])];
                      updated[idx].text = e.target.value;
                      setFormData({ ...formData, knowledge_snippets: updated });
                    }}
                    placeholder="Knowledge snippet content..."
                    style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12, background: 'var(--surface)' }}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* COLUMN 3: Voice / AI Tuning & Live Simulation Sandbox */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Voice & Acoustic Dynamics */}
          <div style={{ background: 'var(--surface)', borderRadius: 10, border: '1px solid var(--border)', padding: 16, boxShadow: 'var(--shadow-sm)' }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>
              🎙️ Voice & Acoustic Dynamics
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 2 }}>
                  Voice Provider
                </label>
                <select
                  value={formData.voice_settings?.provider || 'kokoro'}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      voice_settings: { ...(formData.voice_settings as any), provider: e.target.value },
                    })
                  }
                  style={{ width: '100%', padding: '5px 6px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12 }}
                >
                  <option value="kokoro">Kokoro 82M (Fastest)</option>
                  <option value="elevenlabs">ElevenLabs Turbo</option>
                  <option value="openai">OpenAI TTS</option>
                  <option value="local">Local Kokoro ONNX</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 2 }}>
                  Voice ID / Timbre
                </label>
                <select
                  value={formData.voice_settings?.voice_id || 'ja_female_polite'}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      voice_settings: { ...(formData.voice_settings as any), voice_id: e.target.value },
                    })
                  }
                  style={{ width: '100%', padding: '5px 6px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12 }}
                >
                  <option value="ja_female_polite">ja_female_polite (丁寧・女性)</option>
                  <option value="ja_male_calm">ja_male_calm (落ち着き・男性)</option>
                  <option value="alloy">alloy (Neutral)</option>
                  <option value="shimmer">shimmer (Warm)</option>
                  <option value="echo">echo (Authoritative)</option>
                  <option value="en_us_matthew">en_us_matthew (Professional)</option>
                </select>
              </div>
            </div>

            {/* Speed & Sensitivity Sliders */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 600 }}>
                  <span>Speaking Speed</span>
                  <span className="mono">{formData.voice_settings?.speed?.toFixed(2) || '1.00'}x</span>
                </div>
                <input
                  type="range"
                  min="0.8"
                  max="1.4"
                  step="0.05"
                  value={formData.voice_settings?.speed || 1.0}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      voice_settings: { ...(formData.voice_settings as any), speed: parseFloat(e.target.value) },
                    })
                  }
                  style={{ width: '100%', accentColor: 'var(--accent)' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 2 }}>
                    Barge-in Sensitivity
                  </label>
                  <select
                    value={formData.voice_settings?.barge_in_sensitivity || 'high'}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        voice_settings: { ...(formData.voice_settings as any), barge_in_sensitivity: e.target.value },
                      })
                    }
                    style={{ width: '100%', padding: '4px 6px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 11 }}
                  >
                    <option value="high">High (Instant break)</option>
                    <option value="normal">Normal</option>
                    <option value="low">Low (Resistant)</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 2 }}>
                    Pause Timeout (ms)
                  </label>
                  <input
                    type="number"
                    value={formData.voice_settings?.pause_threshold_ms || 450}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        voice_settings: { ...(formData.voice_settings as any), pause_threshold_ms: parseInt(e.target.value, 10) || 450 },
                      })
                    }
                    style={{ width: '100%', padding: '4px 6px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 11 }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* LLM Brain Tuning */}
          <div style={{ background: 'var(--surface)', borderRadius: 10, border: '1px solid var(--border)', padding: 16, boxShadow: 'var(--shadow-sm)' }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>
              🧠 LLM Brain Architecture
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 2 }}>
                  Provider
                </label>
                <select
                  value={formData.llm_settings?.provider || 'openai'}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      llm_settings: { ...(formData.llm_settings as any), provider: e.target.value },
                    })
                  }
                  style={{ width: '100%', padding: '5px 6px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12 }}
                >
                  <option value="openai">OpenAI</option>
                  <option value="local">Local Ollama / vLLM</option>
                  <option value="anthropic">Anthropic Claude</option>
                  <option value="gemini">Google Gemini</option>
                  <option value="template">Deterministic Rule Engine</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 2 }}>
                  Model
                </label>
                <input
                  type="text"
                  value={formData.llm_settings?.model || 'gpt-4o-mini'}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      llm_settings: { ...(formData.llm_settings as any), model: e.target.value },
                    })
                  }
                  className="mono"
                  style={{ width: '100%', padding: '5px 6px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12 }}
                />
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 600 }}>
                <span>Temperature (Randomness vs Compliance)</span>
                <span className="mono">{formData.llm_settings?.temperature?.toFixed(2) || '0.20'}</span>
              </div>
              <input
                type="range"
                min="0.0"
                max="1.0"
                step="0.05"
                value={formData.llm_settings?.temperature || 0.2}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    llm_settings: { ...(formData.llm_settings as any), temperature: parseFloat(e.target.value) },
                  })
                }
                style={{ width: '100%', accentColor: 'var(--accent)' }}
              />
            </div>
          </div>

          {/* Interactive Turn Simulator / Playground */}
          <div
            style={{
              background: '#090d16',
              borderRadius: 10,
              border: '1px solid #1e293b',
              padding: 16,
              boxShadow: 'var(--shadow-md)',
              color: '#f8fafc',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#38bdf8' }} />
                <span style={{ fontSize: 13, fontWeight: 700 }}>Interactive Playground</span>
              </div>
              <button
                type="button"
                className="btn btn-xs"
                onClick={() => setChatLog(formData.greeting ? [{ sender: 'agent', text: formData.greeting }] : [])}
                style={{ fontSize: 11, background: '#1e293b', border: '1px solid #334155', color: '#94a3b8' }}
              >
                Clear Chat
              </button>
            </div>

            {/* Chat Thread */}
            <div
              style={{
                height: 240,
                overflowY: 'auto',
                background: '#030712',
                borderRadius: 8,
                padding: 10,
                border: '1px solid #1e293b',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              {chatLog.map((c, idx) => (
                <div
                  key={idx}
                  style={{
                    alignSelf: c.sender === 'user' ? 'flex-end' : 'flex-start',
                    maxWidth: '85%',
                    background: c.sender === 'user' ? '#1e3a8a' : '#1e293b',
                    padding: '8px 12px',
                    borderRadius: 8,
                    fontSize: 12,
                    lineHeight: 1.5,
                  }}
                >
                  <div style={{ fontSize: 10, color: c.sender === 'user' ? '#93c5fd' : '#94a3b8', marginBottom: 2 }}>
                    {c.sender === 'user' ? 'Caller' : 'Agent'}
                    {c.latencyMs && ` · ${c.latencyMs}ms`}
                  </div>
                  <div>{c.text}</div>
                  {c.tools && c.tools.length > 0 && (
                    <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                      {c.tools.map((t) => (
                        <span key={t} className="mono" style={{ fontSize: 9, padding: '1px 4px', borderRadius: 3, background: '#0f172a', color: '#38bdf8' }}>
                          ⚡ {t}()
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {simulating && (
                <div style={{ alignSelf: 'flex-start', background: '#1e293b', padding: '6px 10px', borderRadius: 6, fontSize: 11, color: '#94a3b8' }}>
                  Generating response...
                </div>
              )}
            </div>

            {/* Test Input Form */}
            <form onSubmit={handleSendSimulatorTurn} style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                value={testInput}
                onChange={(e) => setTestInput(e.target.value)}
                placeholder="Test utterance (e.g. 1985年4月12日です or Can I pay next week?)..."
                style={{
                  flex: 1,
                  padding: '7px 10px',
                  borderRadius: 6,
                  border: '1px solid #334155',
                  background: '#0f172a',
                  color: '#f8fafc',
                  fontSize: 12,
                }}
              />
              <button
                type="submit"
                className="btn btn-sm btn-primary"
                disabled={simulating || !testInput.trim()}
                style={{ padding: '0 12px', fontSize: 12 }}
              >
                Send
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
