import React from 'react';

export type OperatingTier = 'cloud' | 'local_server' | 'safe_mode' | 'browser_tier';

interface DegradedModeBannerProps {
  currentTier: OperatingTier;
  reconnecting?: boolean;
  onRetryConnection?: () => void;
}

export const DegradedModeBanner: React.FC<DegradedModeBannerProps> = ({
  currentTier,
  reconnecting = false,
  onRetryConnection
}) => {
  if (currentTier === 'cloud') {
    return null; // Normal operating mode; no warning banner
  }

  const tierInfo = {
    local_server: {
      title: 'Operating on Local Server (Tier 1)',
      desc: 'Cloud frontier tier unreachable. Routing turns through local CPU/GPU inference. Full audit intact.',
      color: 'var(--amber-fg, #b45309)',
      bg: 'var(--amber-bg, #fffbeb)',
      border: 'var(--amber-border, #fcd34d)',
    },
    safe_mode: {
      title: 'Degraded Mode: Deterministic Script Fallback (Tier 0.5)',
      desc: 'Local model inference unavailable. Operating on hardcoded, regulatory-compliant state machine dialog.',
      color: 'var(--orange-fg, #c2410c)',
      bg: 'var(--orange-bg, #fff7ed)',
      border: 'var(--orange-border, #fdba74)',
    },
    browser_tier: {
      title: 'Offline Degraded Mode: Browser WebGPU / Edge Tier (Tier 0)',
      desc: 'Server disconnected. Running local client model with @voice/guards-spec. Turns will be marked client_generated.',
      color: 'var(--red-fg, #b91c1c)',
      bg: 'var(--red-bg, #fef2f2)',
      border: 'var(--red-border, #fca5a5)',
    }
  }[currentTier];

  return (
    <div
      role="alert"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 16px',
        marginBottom: '16px',
        borderRadius: '8px',
        backgroundColor: tierInfo.bg,
        border: `1px solid ${tierInfo.border}`,
        color: tierInfo.color,
        fontSize: '0.875rem',
        fontWeight: 500,
        boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span style={{ fontSize: '1.25rem' }}>⚠️</span>
        <div>
          <div style={{ fontWeight: 700 }}>{tierInfo.title}</div>
          <div style={{ fontSize: '0.8rem', opacity: 0.9 }}>{tierInfo.desc}</div>
        </div>
      </div>
      {onRetryConnection && (
        <button
          onClick={onRetryConnection}
          disabled={reconnecting}
          style={{
            padding: '6px 12px',
            borderRadius: '6px',
            border: `1px solid ${tierInfo.color}`,
            backgroundColor: 'transparent',
            color: tierInfo.color,
            cursor: reconnecting ? 'not-allowed' : 'pointer',
            fontSize: '0.75rem',
            fontWeight: 600
          }}
        >
          {reconnecting ? 'Reconnecting…' : 'Retry Server'}
        </button>
      )}
    </div>
  );
};
