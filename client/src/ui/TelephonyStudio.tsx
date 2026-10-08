import React, { useState, useEffect } from 'react';
import { Card, PageHeader, Badge } from './primitives.tsx';
import { apiClient } from '../data/apiClient.ts';
import { PhoneNumberConfig, TelephonyCallSession, StudioPersonaItem } from '../data/types.ts';

export const TelephonyStudio: React.FC = () => {
  const [numbers, setNumbers] = useState<PhoneNumberConfig[]>([]);
  const [calls, setCalls] = useState<TelephonyCallSession[]>([]);
  const [personas, setPersonas] = useState<StudioPersonaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Outbound Dialer state
  const [dialToPhone, setDialToPhone] = useState('+1 (555) 349-8120');
  const [dialFromPhone, setDialFromPhone] = useState('');
  const [dialPersona, setDialPersona] = useState('mirai_collections_ja');
  const [dialing, setDialing] = useState(false);
  const [activeCall, setActiveCall] = useState<TelephonyCallSession | null>(null);

  // Inspecting specific call
  const [inspectingCall, setInspectingCall] = useState<TelephonyCallSession | null>(null);

  // New number modal / form
  const [showAddNumber, setShowAddNumber] = useState(false);
  const [newNumber, setNewNumber] = useState('');
  const [newFriendlyName, setNewFriendlyName] = useState('');
  const [newPersona, setNewPersona] = useState('mirai_collections_ja');
  const [newProvider, setNewProvider] = useState<'twilio' | 'telnyx' | 'sip_trunk'>('twilio');

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [numRes, callsRes, personasRes] = await Promise.all([
        apiClient.getTelephonyNumbers().catch(() => ({ numbers: [] })),
        apiClient.getTelephonyCalls().catch(() => ({ calls: [] })),
        apiClient.getStudioPersonas().catch(() => ({ personas: [] })),
      ]);

      setNumbers(numRes.numbers || []);
      setCalls(callsRes.calls || []);
      setPersonas(personasRes.personas || []);
      if (!dialFromPhone && numRes.numbers?.[0]) {
        setDialFromPhone(numRes.numbers[0].phoneNumber);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load telephony data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleStartCall = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dialToPhone.trim()) return;
    setDialing(true);
    setError(null);
    try {
      const res = await apiClient.dispatchOutboundCall(dialToPhone, dialPersona, dialFromPhone);
      if (res.success && res.call) {
        setActiveCall(res.call);
        setCalls((prev) => [res.call, ...prev]);
        setInspectingCall(res.call);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to initiate outbound call.');
    } finally {
      setDialing(false);
    }
  };

  const handleHangup = async (callSid: string) => {
    try {
      await apiClient.hangupTelephonyCall(callSid);
      setActiveCall(null);
      fetchData();
    } catch (err: any) {
      setError(err?.message || 'Failed to hang up call.');
    }
  };

  const handleSaveNumber = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNumber.trim()) return;
    try {
      const res = await apiClient.saveTelephonyNumber({
        phoneNumber: newNumber.trim(),
        friendlyName: newFriendlyName.trim() || newNumber.trim(),
        personaId: newPersona,
        language: newPersona.includes('en') ? 'en' : 'ja',
        provider: newProvider,
        status: 'active',
        configuredAt: Date.now(),
      });
      if (res.success) {
        setShowAddNumber(false);
        setNewNumber('');
        setNewFriendlyName('');
        fetchData();
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to save telephone number.');
    }
  };

  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}m ${s < 10 ? '0' : ''}${s}s`;
  };

  return (
    <div className="page">
      <PageHeader
        eyebrow="Carrier Infrastructure & PSTN"
        title="Telephony & SIP Bridge"
        desc="Manage inbound carrier DIDs, SIP trunks, outbound dialer, and bi-directional Twilio media streams."
        right={
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button
              onClick={() => setShowAddNumber(true)}
              className="btn btn-primary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, height: 32 }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Provision Number
            </button>
            <button
              onClick={fetchData}
              disabled={loading}
              className="btn btn-secondary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, height: 32 }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
              {loading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        }
      />

      {error && (
        <div style={{ background: '#7f1d1d33', border: '1px solid #ef444455', color: '#fca5a5', padding: '12px 16px', borderRadius: 8, marginBottom: 20 }}>
          {error}
        </div>
      )}

      {/* Row 1: Dialer & Active Call Banner */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.8fr', gap: 16, marginBottom: 20 }}>
        {/* Outbound Web Dialer */}
        <Card pad>
          <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)', marginBottom: 4 }}>
            Outbound Telephone Dialer
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14 }}>
            Dispatch live automated phone call with AI voice agent
          </div>

          <form onSubmit={handleStartCall} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
                Recipient Phone Number (E.164)
              </label>
              <input
                type="text"
                value={dialToPhone}
                onChange={(e) => setDialToPhone(e.target.value)}
                placeholder="+1 (555) 000-0000"
                className="input"
                style={{ width: '100%', fontSize: 14 }}
                required
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
                  Outbound Caller ID
                </label>
                <select
                  value={dialFromPhone}
                  onChange={(e) => setDialFromPhone(e.target.value)}
                  className="select"
                  style={{ width: '100%', fontSize: 13 }}
                >
                  {numbers.map((n) => (
                    <option key={n.phoneNumber} value={n.phoneNumber}>
                      {n.phoneNumber} ({n.friendlyName.slice(0, 15)}…)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
                  Voice Agent Persona
                </label>
                <select
                  value={dialPersona}
                  onChange={(e) => setDialPersona(e.target.value)}
                  className="select"
                  style={{ width: '100%', fontSize: 13 }}
                >
                  <option value="mirai_collections_ja">Mirai (Collections JA)</option>
                  <option value="sarah_support_en">Sarah (Support EN)</option>
                  {personas.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.language.toUpperCase()})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ marginTop: 8, display: 'flex', gap: 10 }}>
              <button
                type="submit"
                disabled={dialing || activeCall?.status === 'in-progress' || activeCall?.status === 'ringing'}
                className="btn btn-primary"
                style={{ flex: 1, padding: '10px 16px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 650 }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                {dialing ? 'Connecting...' : 'Dispatch Call'}
              </button>

              {activeCall && (activeCall.status === 'ringing' || activeCall.status === 'in-progress') && (
                <button
                  type="button"
                  onClick={() => handleHangup(activeCall.callSid)}
                  className="btn btn-danger"
                  style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"/><line x1="23" y1="1" x2="1" y2="23"/></svg>
                  Hang Up
                </button>
              )}
            </div>
          </form>
        </Card>

        {/* Live Call Monitor / Webhook Info */}
        <Card pad>
          {activeCall && (activeCall.status === 'ringing' || activeCall.status === 'in-progress') ? (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'space-between' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="dot" style={{ width: 10, height: 10, borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
                    <span style={{ fontWeight: 700, fontSize: 15, color: '#10b981' }}>Live Call In Progress</span>
                    <Badge tone="info">{activeCall.callSid.slice(0, 14)}…</Badge>
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    {activeCall.fromPhone} &rarr; <strong>{activeCall.toPhone}</strong>
                  </span>
                </div>

                <div style={{ background: 'var(--bg-main)', padding: 12, borderRadius: 8, border: '1px solid var(--border)', marginBottom: 12 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>Live Transcript Feed:</div>
                  <div style={{ maxHeight: 120, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {activeCall.transcript.map((t, idx) => (
                      <div key={idx} style={{ fontSize: 13 }}>
                        <strong style={{ color: t.speaker === 'agent' ? '#38bdf8' : '#34d399' }}>
                          {t.speaker === 'agent' ? 'AI Agent: ' : 'Caller: '}
                        </strong>
                        <span style={{ color: 'var(--text-primary)' }}>{t.text}</span>
                      </div>
                    ))}
                    {activeCall.transcript.length === 0 && (
                      <div style={{ fontSize: 12, color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
                        Establishing media stream &amp; audio channel sync…
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  G.711 mu-law 8kHz bi-directional audio stream connected
                </span>
                <button
                  onClick={() => handleHangup(activeCall.callSid)}
                  className="btn btn-danger btn-sm"
                >
                  End Call
                </button>
              </div>
            </div>
          ) : (
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)', marginBottom: 4 }}>
                Twilio &amp; Carrier Webhook Configuration
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
                Connect your telephony numbers to our high-performance voice pipeline
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12 }}>
                <div>
                  <div style={{ color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 2 }}>
                    Twilio Voice Inbound Webhook URL (POST):
                  </div>
                  <div style={{ background: 'var(--bg-main)', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', fontFamily: 'monospace', color: '#38bdf8' }}>
                    {window.location.origin}/api/telephony/twilio/incoming
                  </div>
                </div>

                <div>
                  <div style={{ color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 2 }}>
                    Bi-Directional Audio Stream WebSocket URL:
                  </div>
                  <div style={{ background: 'var(--bg-main)', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', fontFamily: 'monospace', color: '#a78bfa' }}>
                    {window.location.origin.replace(/^http/, 'ws')}/telephony/stream
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                  <Badge tone="success" dot>G.711u / PCMU Supported</Badge>
                  <Badge tone="neutral">8kHz &harr; 16kHz Transcoder Active</Badge>
                  <Badge tone="info">Caller Interruption Clears Buffer</Badge>
                </div>
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Row 2: Provisioned Numbers Table */}
      <div style={{ marginBottom: 16 }}>
        <div className="card">
          <div className="card-header">
            <div>
              <h3 className="card-title">Carrier numbers &amp; routing</h3>
              <p className="card-sub">Assigned virtual phone numbers and default answering personas</p>
            </div>
          </div>

          <div className="table-wrap" style={{ border: 'none', borderRadius: 0, boxShadow: 'none' }}>
            <table className="grid">
              <thead>
                <tr>
                  <th>Phone number</th>
                  <th>Friendly name</th>
                  <th>Carrier / Provider</th>
                  <th>Assigned persona</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {numbers.map((n, idx) => (
                  <tr key={idx}>
                    <td style={{ fontWeight: 700, color: 'var(--text)' }}>
                      {n.phoneNumber}
                    </td>
                    <td>{n.friendlyName}</td>
                    <td>
                      <Badge tone="neutral">{n.provider.toUpperCase()}</Badge>
                    </td>
                    <td>
                      <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{n.personaId}</span>
                    </td>
                    <td>
                      <Badge tone={n.status === 'active' ? 'success' : 'warning'} dot>
                        {n.status}
                      </Badge>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        onClick={() => {
                          setDialToPhone(n.phoneNumber);
                        }}
                        className="btn btn-sm"
                        style={{ padding: '3px 8px', fontSize: 12 }}
                      >
                        Dial line
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Row 3: Call History & Inspector */}
      <div>
        <div className="card">
          <div className="card-header">
            <div>
              <h3 className="card-title">PSTN telephony call history</h3>
              <p className="card-sub">Inbound and outbound telephone interactions</p>
            </div>
          </div>

          <div className="table-wrap" style={{ border: 'none', borderRadius: 0, boxShadow: 'none' }}>
            <table className="grid">
              <thead>
                <tr>
                  <th>Call SID</th>
                  <th>Direction</th>
                  <th>Caller / Recipient</th>
                  <th>Persona</th>
                  <th>Duration</th>
                  <th>Turns</th>
                  <th>Disposition</th>
                  <th style={{ textAlign: 'right' }}>View</th>
                </tr>
              </thead>
              <tbody>
                {calls.map((c, idx) => (
                  <tr key={idx}>
                    <td className="mono" style={{ fontSize: 12 }}>
                      {c.callSid.slice(0, 16)}…
                    </td>
                    <td>
                      <Badge tone={c.direction === 'inbound' ? 'info' : 'neutral'}>
                        {c.direction}
                      </Badge>
                    </td>
                    <td>
                      <div style={{ fontSize: 12.5 }}>
                        <span style={{ color: 'var(--text-tertiary)' }}>{c.fromPhone}</span> &rarr; <strong>{c.toPhone}</strong>
                      </div>
                    </td>
                    <td>{c.personaId}</td>
                    <td className="mono">{formatDuration(c.durationSec || 0)}</td>
                    <td className="mono">{c.turns}</td>
                    <td>
                      <Badge tone={c.disposition === 'promise_secured' || c.disposition === 'resolved' ? 'success' : 'neutral'}>
                        {c.disposition || c.status}
                      </Badge>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        onClick={() => setInspectingCall(c)}
                        className="btn btn-sm"
                        style={{ padding: '3px 8px', fontSize: 12 }}
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Call Details Drawer Modal */}
      {inspectingCall && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: 20 }}>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, width: '100%', maxWidth: 640, maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-primary)' }}>
                  Call Transcript: {inspectingCall.callSid}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  {inspectingCall.direction.toUpperCase()} | {inspectingCall.fromPhone} &rarr; {inspectingCall.toPhone}
                </div>
              </div>
              <button
                onClick={() => setInspectingCall(null)}
                className="btn btn-secondary btn-sm"
              >
                Close
              </button>
            </div>

            <div style={{ padding: 20, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
              {inspectingCall.transcript?.length > 0 ? (
                inspectingCall.transcript.map((t, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: 10,
                      borderRadius: 8,
                      background: t.speaker === 'agent' ? 'rgba(56, 189, 248, 0.08)' : 'rgba(52, 211, 153, 0.08)',
                      border: `1px solid ${t.speaker === 'agent' ? 'rgba(56, 189, 248, 0.2)' : 'rgba(52, 211, 153, 0.2)'}`,
                    }}
                  >
                    <div style={{ fontSize: 11, fontWeight: 700, color: t.speaker === 'agent' ? '#38bdf8' : '#34d399', marginBottom: 4 }}>
                      {t.speaker === 'agent' ? 'Voice AI Agent' : 'Telephone Caller'}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>
                      {t.text}
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-tertiary)' }}>
                  No transcript entries recorded for this call.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Provision Number Modal */}
      {showAddNumber && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: 20 }}>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, width: '100%', maxWidth: 480, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>
                Configure Phone Number DID
              </div>
              <button
                onClick={() => setShowAddNumber(false)}
                className="btn btn-secondary btn-sm"
              >
                Cancel
              </button>
            </div>

            <form onSubmit={handleSaveNumber} style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
                  Phone Number (E.164 format)
                </label>
                <input
                  type="text"
                  value={newNumber}
                  onChange={(e) => setNewNumber(e.target.value)}
                  placeholder="+1 (800) 555-0199"
                  className="input"
                  style={{ width: '100%' }}
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
                  Friendly Label
                </label>
                <input
                  type="text"
                  value={newFriendlyName}
                  onChange={(e) => setNewFriendlyName(e.target.value)}
                  placeholder="Inbound Collections Line"
                  className="input"
                  style={{ width: '100%' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
                  Carrier / Gateway Provider
                </label>
                <select
                  value={newProvider}
                  onChange={(e) => setNewProvider(e.target.value as any)}
                  className="select"
                  style={{ width: '100%' }}
                >
                  <option value="twilio">Twilio Voice</option>
                  <option value="telnyx">Telnyx SIP</option>
                  <option value="sip_trunk">Generic SIP Trunk (FreeSWITCH / Asterisk)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
                  Assigned Agent Persona
                </label>
                <select
                  value={newPersona}
                  onChange={(e) => setNewPersona(e.target.value)}
                  className="select"
                  style={{ width: '100%' }}
                >
                  <option value="mirai_collections_ja">Mirai (Collections JA)</option>
                  <option value="sarah_support_en">Sarah (Support EN)</option>
                  {personas.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.language.toUpperCase()})
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => setShowAddNumber(false)}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                >
                  Save Configuration
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
