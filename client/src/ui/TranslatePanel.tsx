import React, { useState, useEffect, useRef } from 'react';
import { SessionManager, SessionState } from '../session/SessionManager';
import { GatewayMessage } from '@voice/protocol';
import { Captions, CaptionEntry } from './Captions';
import { LatencyHUD } from './LatencyHUD';
import { PageHeader, Badge } from './primitives.tsx';

export const TranslatePanel: React.FC = () => {
  const [state, setState] = useState<SessionState>('idle');
  const [srcLang, setSrcLang] = useState('ja');
  const [tgtLang, setTgtLang] = useState('en');
  const [entries, setEntries] = useState<CaptionEntry[]>([]);
  const [hudData, setHudData] = useState<{ queueDepth: number; gpuUtil: number | null; rtf: number | null }>({ queueDepth: 0, gpuUtil: null, rtf: null });
  const [asrCommitMs, setAsrCommitMs] = useState<number | undefined>();
  const [mtDurationMs, setMtDurationMs] = useState<number | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const sessionManagerRef = useRef<SessionManager | null>(null);

  useEffect(() => {
    const envWs = (import.meta as any).env?.VITE_GATEWAY_WS_URL;
    const gatewayProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const gatewayHost = window.location.hostname || 'localhost';
    const gatewayUrl = envWs || (window.location.port === '8443'
      ? `${gatewayProtocol}//${window.location.host}/session`
      : `${gatewayProtocol}//${gatewayHost}:8443/session`);

    sessionManagerRef.current = new SessionManager(gatewayUrl, {
      onStateChange: (newState) => setState(newState),
      onError: (err) => setError(err),
      onMessage: (msg: GatewayMessage) => {
        if (msg.type === 'status') {
          setNotice(msg.status === 'stt_restored' ? null : (msg.message || 'Speech recognition reconnecting…'));
          return;
        }
        if (msg.type === 'error') {
          setError(msg.message || msg.code || 'Translation pipeline error');
          sessionManagerRef.current?.stop();
          return;
        }
        if (msg.type === 'hud') {
          setHudData({ queueDepth: msg.queueDepth, gpuUtil: msg.gpuUtil, rtf: msg.rtf });
        } else if (msg.type === 'partial') {
          setEntries((prev) => {
            const index = prev.findIndex((e) => e.uttId === msg.uttId);
            if (index >= 0) { const u = [...prev]; u[index] = { ...u[index], partialText: msg.text }; return u; }
            return [...prev, { uttId: msg.uttId, partialText: msg.text }];
          });
        } else if (msg.type === 'final') {
          if (msg.tCapture && msg.tFinal) setAsrCommitMs(msg.tFinal - msg.tCapture);
          setEntries((prev) => {
            const index = prev.findIndex((e) => e.uttId === msg.uttId);
            if (index >= 0) { const u = [...prev]; u[index] = { ...u[index], finalText: msg.text, partialText: undefined }; return u; }
            return [...prev, { uttId: msg.uttId, finalText: msg.text }];
          });
        } else if (msg.type === 'translated') {
          if (msg.ttftMs && msg.decodeMs) setMtDurationMs(Math.round(msg.ttftMs + msg.decodeMs));
          setEntries((prev) => {
            const index = prev.findIndex((e) => e.uttId === msg.uttId);
            if (index >= 0) { const u = [...prev]; u[index] = { ...u[index], translation: msg.translation }; return u; }
            return [...prev, { uttId: msg.uttId, translation: msg.translation }];
          });
        }
      },
    });
    return () => { sessionManagerRef.current?.stop(); };
  }, []);

  const handleToggle = () => {
    if (state === 'idle') {
      setError(null);
      setNotice(null);
      sessionManagerRef.current?.start(srcLang, tgtLang, 'translate');
    } else {
      sessionManagerRef.current?.stop();
    }
  };

  return (
    <div className="page">
      <PageHeader
        eyebrow="Build · Realtime demo"
        title="Translate"
        desc="Streaming speech-to-text plus continuous-batched translation. Target p50 under 500 ms."
        right={<Badge tone={state === 'streaming' ? 'success' : 'neutral'} dot>{state === 'streaming' ? 'Streaming' : state}</Badge>}
      />

      <div className="card card-pad" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <button className={state === 'streaming' ? 'btn btn-danger' : 'btn btn-primary'} onClick={handleToggle}>
          {state === 'streaming' ? 'Stop' : state === 'connecting' ? 'Connecting…' : 'Start speaking'}
        </button>
        <label style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>Source
          <select className="select" value={srcLang} onChange={(e) => setSrcLang(e.target.value)} disabled={state !== 'idle'} style={{ marginLeft: 6 }}>
            <option value="ja">Japanese</option>
            <option value="en">English</option>
          </select>
        </label>
        <label style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>Target
          <select className="select" value={tgtLang} onChange={(e) => setTgtLang(e.target.value)} disabled={state !== 'idle'} style={{ marginLeft: 6 }}>
            <option value="en">English</option>
            <option value="ja">Japanese</option>
          </select>
        </label>
        <Badge tone="neutral">vLLM batched</Badge>
      </div>

      <div style={{ marginBottom: 12 }}>
        <LatencyHUD
          queueDepth={hudData.queueDepth} gpuUtil={hudData.gpuUtil} rtf={hudData.rtf}
          mode="translate" lastCaptureToFinalMs={asrCommitMs} lastMtDurationMs={mtDurationMs}
        />
      </div>

      {notice && (
        <div className="card card-pad" style={{ borderColor: 'var(--accent-border)', background: 'var(--accent-soft)', color: 'var(--accent)', marginBottom: 12, fontSize: 13 }}>{notice}</div>
      )}

      {error && (
        <div className="card card-pad" style={{ borderColor: 'var(--danger-border)', background: 'var(--danger-soft)', color: 'var(--danger)', marginBottom: 12, fontSize: 13 }}>{error}</div>
      )}

      <div className="card card-pad">
        {entries.length === 0 ? (
          <div style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--text-tertiary)' }}>
            <div style={{ fontWeight: 650, color: 'var(--text)' }}>Feed inactive</div>
            <div style={{ fontSize: 13 }}>Start speaking — partial captions and translations appear here in realtime.</div>
          </div>
        ) : (
          <Captions entries={entries} />
        )}
      </div>
    </div>
  );
};
