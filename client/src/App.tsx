import React, { useState, useEffect } from 'react';
import { Navbar, Topbar, ActiveTab } from './ui/Navbar.tsx';
import { LiveCallPanel } from './ui/LiveCallPanel.tsx';
import { CallList } from './ui/CallList.tsx';
import { CallInspector } from './ui/CallInspector.tsx';
import { ResultsViewer } from './ui/ResultsViewer.tsx';
import { LabelingScreen } from './ui/LabelingScreen.tsx';
import { TranslatePanel } from './ui/TranslatePanel.tsx';
import { apiClient } from './data/apiClient.ts';
import { CallSummaryItem, CallDetail } from './data/types.ts';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('live');
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);
  const [activeCallDetail, setActiveCallDetail] = useState<CallDetail | null>(null);
  const [calls, setCalls] = useState<CallSummaryItem[]>([]);
  const [loadingCalls, setLoadingCalls] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [callsError, setCallsError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [apiOnline, setApiOnline] = useState(true);

  // Sync state from current URL
  useEffect(() => {
    function parseRoute() {
      const path = window.location.pathname;
      if (path.startsWith('/calls/')) {
        const id = path.replace('/calls/', '').trim();
        setActiveTab('calls');
        setSelectedCallId(id);
      } else if (path === '/calls') {
        setActiveTab('calls');
        setSelectedCallId(null);
      } else if (path === '/results') {
        setActiveTab('results');
        setSelectedCallId(null);
      } else if (path === '/label') {
        setActiveTab('label');
        setSelectedCallId(null);
      } else if (path === '/translate') {
        setActiveTab('translate');
        setSelectedCallId(null);
      } else {
        setActiveTab('live');
        setSelectedCallId(null);
      }
    }

    parseRoute();
    window.addEventListener('popstate', parseRoute);
    return () => window.removeEventListener('popstate', parseRoute);
  }, []);

  // Update URL history when navigation occurs
  const navigateTo = (tab: ActiveTab, callId?: string | null) => {
    setActiveTab(tab);
    setSelectedCallId(callId || null);

    let targetPath = `/${tab}`;
    if (tab === 'calls' && callId) {
      targetPath = `/calls/${encodeURIComponent(callId)}`;
    }
    if (window.location.pathname !== targetPath) {
      window.history.pushState({}, '', targetPath);
    }
  };

  const [selectedVariantFilter, setSelectedVariantFilter] = useState<string | null>(null);

  // Load calls list
  const fetchCalls = React.useCallback(async () => {
    setLoadingCalls(true);
    setCallsError(null);
    try {
      setCalls(await apiClient.getCalls());
      setApiOnline(true);
    } catch (err: any) {
      setCallsError(err?.message || 'Failed to load calls.');
      setApiOnline(false);
    } finally {
      setLoadingCalls(false);
    }
  }, []);

  useEffect(() => {
    fetchCalls();
  }, [fetchCalls]);

  // Load detail when selectedCallId changes
  useEffect(() => {
    async function fetchDetail() {
      if (!selectedCallId) {
        setActiveCallDetail(null);
        setDetailError(null);
        return;
      }
      setLoadingDetail(true);
      setDetailError(null);
      try {
        setActiveCallDetail(await apiClient.getCallDetail(selectedCallId));
      } catch (err: any) {
        setActiveCallDetail(null);
        setDetailError(err?.message || 'Failed to load call record.');
        console.error('Failed to load call detail:', err);
      } finally {
        setLoadingDetail(false);
      }
    }
    fetchDetail();
  }, [selectedCallId]);

  return (
    <div className="shell">
      {/* Sidebar */}
      <Navbar
        activeTab={activeTab}
        onSelectTab={(tab) => navigateTo(tab, null)}
        apiOnline={apiOnline}
      />

      <div className="main-col">
        <Topbar activeTab={activeTab} apiOnline={apiOnline} onHome={() => navigateTo('live', null)} onSelectTab={(tab) => navigateTo(tab, null)} />
        {/* Main View Router */}
        <main style={{ flex: 1, minWidth: 0 }}>
        {activeTab === 'live' && (
          <LiveCallPanel onInspectCall={(id) => navigateTo('calls', id)} />
        )}

        {activeTab === 'calls' && !selectedCallId && (
          <CallList
            calls={calls}
            onSelectCall={(id) => navigateTo('calls', id)}
            loading={loadingCalls}
            error={callsError}
            initialVariantFilter={selectedVariantFilter}
            onRefresh={fetchCalls}
          />
        )}

        {activeTab === 'calls' && selectedCallId && (
          loadingDetail ? (
            <div className="page"><div className="card card-pad" style={{ textAlign: 'center', color: 'var(--text-tertiary)' }}>
              Loading call record…
            </div></div>
          ) : activeCallDetail ? (
            <CallInspector
              call={activeCallDetail}
              onBack={() => navigateTo('calls', null)}
            />
          ) : (
            <div className="page"><div className="card card-pad" style={{ textAlign: 'center' }}>
              <div>{detailError || 'Call record not found.'}</div>
              <button className="btn" style={{ marginTop: 12 }} onClick={() => navigateTo('calls', null)}>
                Back to list
              </button>
            </div></div>
          )
        )}

        {activeTab === 'results' && (
          <ResultsViewer
            onSelectVariantFilter={(variant) => {
              setSelectedVariantFilter(variant);
              navigateTo('calls', null);
            }}
            onNavigateToLabeling={() => navigateTo('label', null)}
          />
        )}

        {activeTab === 'label' && (
          <LabelingScreen onInspectCall={(id) => navigateTo('calls', id)} />
        )}

        {activeTab === 'translate' && (
          <TranslatePanel />
        )}
        </main>
      </div>
    </div>
  );
};
