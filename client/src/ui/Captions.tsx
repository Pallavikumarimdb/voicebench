import React from 'react';
import { Badge } from './primitives.tsx';

export interface CaptionEntry {
  uttId: number;
  partialText?: string;
  finalText?: string;
  translation?: string;
  agentText?: string;
  agentNode?: string;
  interrupted?: boolean;
}

interface CaptionsProps {
  entries: CaptionEntry[];
}

export const Captions: React.FC<CaptionsProps> = ({ entries }) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {entries.map((entry) => (
        <div key={entry.uttId} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', background: '#fff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span className="mono" style={{ fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 700 }}>TURN {entry.uttId}</span>
            {entry.interrupted && <Badge tone="danger">Barge-in</Badge>}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(entry.finalText || entry.partialText || entry.uttId !== 0) && (
              <div style={{ borderLeft: '2px solid var(--border-strong)', paddingLeft: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-tertiary)' }}>Caller</div>
                <div style={{ fontSize: 14, fontStyle: entry.finalText ? 'normal' : 'italic', color: entry.finalText ? 'var(--text)' : 'var(--text-tertiary)' }}>
                  {entry.finalText || entry.partialText || 'Listening…'}
                </div>
              </div>
            )}

            {entry.translation && (
              <div style={{ marginLeft: 10, padding: '8px 10px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }}>
                {entry.translation}
              </div>
            )}

            {entry.agentText && (
              <div style={{ borderLeft: '2px solid var(--accent-border)', paddingLeft: 10 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--accent)' }}>Agent</span>
                  {entry.agentNode && <span className="mono" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{entry.agentNode}</span>}
                </div>
                <div style={{ fontSize: 14, color: entry.interrupted ? 'var(--text-tertiary)' : 'var(--text)', textDecoration: entry.interrupted ? 'line-through' : 'none' }}>
                  {entry.agentText}
                </div>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};
