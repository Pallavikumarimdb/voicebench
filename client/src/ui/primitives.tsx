import React from 'react';

export const Badge: React.FC<{
  tone?: 'neutral' | 'success' | 'danger' | 'warning' | 'info';
  children: React.ReactNode;
  dot?: boolean;
  title?: string;
}> = ({ tone = 'neutral', children, dot, title }) => (
  <span className={`badge badge-${tone}`} title={title}>
    {dot && <span className="dot" />}
    {children}
  </span>
);

export const PageHeader: React.FC<{
  eyebrow: string;
  title: string;
  desc?: string;
  right?: React.ReactNode;
}> = ({ eyebrow, title, desc, right }) => (
  <div className="page-head" style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
    <div>
      <div className="page-eyebrow">{eyebrow}</div>
      <h1 className="page-title">{title}</h1>
      {desc && <p className="page-desc">{desc}</p>}
    </div>
    {right && <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>{right}</div>}
  </div>
);

export const Card: React.FC<{ children: React.ReactNode; style?: React.CSSProperties; pad?: boolean }> = ({
  children,
  style,
  pad = true,
}) => (
  <div className="card" style={style}>
    <div className={pad ? 'card-pad' : undefined} style={pad ? undefined : { padding: 0 }}>{children}</div>
  </div>
);

export const EmptyState: React.FC<{ title: string; desc?: string; action?: React.ReactNode }> = ({
  title,
  desc,
  action,
}) => (
  <div className="card card-pad" style={{ textAlign: 'center', padding: '40px 24px' }}>
    <div style={{ fontSize: 14, fontWeight: 650 }}>{title}</div>
    {desc && <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>{desc}</div>}
    {action && <div style={{ marginTop: 12 }}>{action}</div>}
  </div>
);

export const Icons = {
  live: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="22" /></svg>
  ),
  calls: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 5h18" /><path d="M3 10h18" /><path d="M3 15h12" /><path d="M3 20h8" /></svg>
  ),
  results: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 3v18h18" /><path d="M7 15l4-5 3 3 5-7" /></svg>
  ),
  label: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 13l-7 7-9-9V4h7z" /><circle cx="8.5" cy="8.5" r="1.2" /></svg>
  ),
  translate: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3c2.5 2.6 3.8 5.7 3.8 9S14.5 18.4 12 21c-2.5-2.6-3.8-5.7-3.8-9S9.5 5.6 12 3z" /></svg>
  ),
  tools: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
  ),
  studio: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
  ),
};
