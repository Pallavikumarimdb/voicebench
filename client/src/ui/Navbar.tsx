import React from 'react';
import { Icons } from './primitives.tsx';

export type ActiveTab = 'home' | 'docs' | 'live' | 'studio' | 'tools' | 'telephony' | 'calls' | 'results' | 'label' | 'translate' | 'analytics';

interface NavbarProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  onNavigateExternal?: (tab: ActiveTab) => void;
  apiOnline: boolean;
}

const GROUPS: { section: string; items: { id: ActiveTab; label: string; desc: string }[] }[] = [
  {
    section: 'Build',
    items: [
      { id: 'live', label: 'Live call', desc: 'Run & monitor' },
      { id: 'studio', label: 'Agent studio', desc: 'No-code builder' },
      { id: 'tools', label: 'Tools', desc: 'Webhooks & APIs' },
      { id: 'telephony', label: 'Telephony', desc: 'Twilio & SIP PSTN' },
      { id: 'translate', label: 'Translate', desc: 'Realtime demo' },
    ],
  },
  {
    section: 'Review',
    items: [
      { id: 'calls', label: 'Calls', desc: 'Inspector' },
      { id: 'label', label: 'Labeling', desc: 'Human ratings' },
    ],
  },
  {
    section: 'Measure',
    items: [
      { id: 'analytics', label: 'Analytics', desc: 'KPIs & Dispositions' },
      { id: 'results', label: 'Results', desc: 'Eval suite' },
    ],
  },
];

const TITLES: Record<ActiveTab, { crumb: string; title: string }> = {
  home: { crumb: 'Public', title: 'Platform Overview' },
  docs: { crumb: 'Public', title: 'Developer Documentation' },
  live: { crumb: 'Build', title: 'Live call' },
  studio: { crumb: 'Build', title: 'Agent Studio' },
  tools: { crumb: 'Build', title: 'Tools & Webhooks' },
  telephony: { crumb: 'Build', title: 'Telephony & SIP Bridge' },
  translate: { crumb: 'Build', title: 'Translate' },
  calls: { crumb: 'Review', title: 'Calls' },
  label: { crumb: 'Review', title: 'Labeling' },
  analytics: { crumb: 'Measure', title: 'Analytics & Dispositions' },
  results: { crumb: 'Measure', title: 'Results' },
};

export const Navbar: React.FC<NavbarProps> = ({ activeTab, onSelectTab, onNavigateExternal, apiOnline }) => {
  return (
    <>
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 30, height: 30, borderRadius: 8, background: '#fff', color: '#0c111d',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14,
              }}
            >
              V
            </div>
            <div>
              <div style={{ color: '#fff', fontWeight: 700, fontSize: 14, letterSpacing: '-0.01em', lineHeight: 1.1 }}>
                Voicebench
              </div>
              <div style={{ fontSize: 11, color: '#667085' }}>Voice agent benchmark</div>
            </div>
          </div>
        </div>

        <nav className="sidebar-nav">
          {GROUPS.map((g) => (
            <div key={g.section}>
              <div className="sidebar-section">{g.section}</div>
              {g.items.map((item) => (
                <button
                  key={item.id}
                  className={`sidebar-item ${activeTab === item.id ? 'active' : ''}`}
                  onClick={() => onSelectTab(item.id)}
                >
                  {Icons[item.id]}
                  <span style={{ flex: 1 }}>{item.label}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-foot">
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 8, fontSize: 12,
              padding: '8px 10px', borderRadius: 8,
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
              color: apiOnline ? '#a6f4c5' : '#fedf89',
            }}
          >
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'currentColor', flexShrink: 0 }} />
            <span style={{ fontWeight: 600 }}>{apiOnline ? 'API · :8443' : 'API unreachable'}</span>
          </div>

          <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <button
              onClick={() => onNavigateExternal?.('home')}
              style={{
                background: 'none', border: 'none', color: '#94a3b8', fontSize: 12,
                cursor: 'pointer', textAlign: 'left', padding: '4px 6px', borderRadius: 4,
                display: 'flex', alignItems: 'center', gap: 8, transition: 'all 0.15s ease'
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#fff')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#94a3b8')}
            >
              <span>🌐</span> Platform Home ↗
            </button>
            <button
              onClick={() => onNavigateExternal?.('docs')}
              style={{
                background: 'none', border: 'none', color: '#94a3b8', fontSize: 12,
                cursor: 'pointer', textAlign: 'left', padding: '4px 6px', borderRadius: 4,
                display: 'flex', alignItems: 'center', gap: 8, transition: 'all 0.15s ease'
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#fff')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#94a3b8')}
            >
              <span>📖</span> Developer Docs ↗
            </button>
          </div>
        </div>
      </aside>
    </>
  );
};

export const Topbar: React.FC<{
  activeTab: ActiveTab;
  apiOnline: boolean;
  onHome: () => void;
  onDocs: () => void;
  onSelectTab: (t: ActiveTab) => void;
}> = ({
  activeTab,
  apiOnline,
  onHome,
  onDocs,
  onSelectTab,
}) => {
  const t = TITLES[activeTab] || { crumb: 'Console', title: 'Dashboard' };
  const ids: ActiveTab[] = ['live', 'studio', 'tools', 'telephony', 'calls', 'analytics', 'results', 'label', 'translate'];
  const labels: Record<ActiveTab, string> = { home: 'Home', docs: 'Docs', live: 'Live', studio: 'Studio', tools: 'Tools', telephony: 'Telephony', calls: 'Calls', analytics: 'Analytics', results: 'Results', label: 'Label', translate: 'Translate' };
  return (
    <div className="topbar">
      <button onClick={onHome} className="btn btn-sm" title="View Public Landing Page" style={{ padding: '4px 10px' }}>
        Voicebench
      </button>
      <span className="topbar-crumb">
        {t.crumb} <span style={{ margin: '0 4px' }}>/</span>
      </span>
      <span className="topbar-title">{t.title}</span>
      <nav className="topbar-nav" aria-label="Primary">
        {ids.map((id) => (
          <button key={id} className={activeTab === id ? 'active' : ''} onClick={() => onSelectTab(id)}>
            {labels[id]}
          </button>
        ))}
      </nav>
      <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
        <button
          onClick={onDocs}
          className="btn btn-sm"
          style={{ padding: '4px 10px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}
        >
          <span>📖</span> Docs
        </button>
        {!apiOnline ? (
          <span className="badge badge-warning">API offline</span>
        ) : (
          <span className="badge badge-success"><span className="dot" />Live</span>
        )}
        <span className="badge badge-neutral mono">p50 target &lt; 500ms</span>
      </div>
    </div>
  );
};
