import React, { useState, useMemo } from 'react';
import { CallSummaryItem } from '../data/types.ts';
import { SourceBadge, ComplianceBadge, HardFailBadge } from './Badges.tsx';
import { PageHeader, EmptyState, Badge } from './primitives.tsx';

interface CallListProps {
  calls: CallSummaryItem[];
  onSelectCall: (id: string) => void;
  loading?: boolean;
  error?: string | null;
  initialVariantFilter?: string | null;
  onRefresh?: () => void;
}

function shortId(id: string) {
  if (id.length <= 24) return id;
  return `${id.slice(0, 8)}…${id.slice(-6)}`;
}

export const CallList: React.FC<CallListProps> = ({
  calls,
  onSelectCall,
  loading = false,
  error = null,
  initialVariantFilter = null,
  onRefresh,
}) => {
  const [search, setSearch] = useState('');
  const [filterSource, setFilterSource] = useState('all');
  const [filterVariant, setFilterVariant] = useState(initialVariantFilter || 'all');
  const [filterHardFail, setFilterHardFail] = useState('all');
  const [filterBlocked, setFilterBlocked] = useState('all');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'turns'>('newest');

  const [page, setPage] = useState(1);
  const pageSize = 20;

  // Sync if initialVariantFilter changes
  React.useEffect(() => {
    if (initialVariantFilter) {
      setFilterVariant(initialVariantFilter);
      setPage(1);
    }
  }, [initialVariantFilter]);

  const personas = useMemo(() => Array.from(new Set(calls.map((c) => c.persona))).sort(), [calls]);
  const [filterPersona, setFilterPersona] = useState('all');

  const filteredCalls = useMemo(() => {
    const list = calls.filter((c) => {
      if (search && !c.id.toLowerCase().includes(search.toLowerCase()) && !c.persona.toLowerCase().includes(search.toLowerCase())) {
        return false;
      }
      if (filterSource !== 'all' && c.source !== filterSource) return false;
      if (filterVariant !== 'all' && c.variant !== filterVariant) return false;
      if (filterPersona !== 'all' && c.persona !== filterPersona) return false;
      if (filterHardFail === 'passed' && c.hardFailPassed !== true) return false;
      if (filterHardFail === 'failed' && c.hardFailPassed !== false) return false;
      if (filterBlocked === 'blocked' && !c.hasComplianceBlock) return false;
      if (filterBlocked === 'none' && c.hasComplianceBlock) return false;
      return true;
    });

    return list.sort((a, b) => {
      if (sortBy === 'oldest') return (a.timestamp || 0) - (b.timestamp || 0);
      if (sortBy === 'turns') return (b.totalTurns || 0) - (a.totalTurns || 0);
      return (b.timestamp || 0) - (a.timestamp || 0); // newest first
    });
  }, [calls, search, filterSource, filterVariant, filterPersona, filterHardFail, filterBlocked, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filteredCalls.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const paginatedCalls = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredCalls.slice(start, start + pageSize);
  }, [filteredCalls, safePage]);

  const fails = calls.filter((c) => c.hardFailPassed === false).length;
  const blocked = calls.filter((c) => c.hasComplianceBlock).length;

  const selectStyle: React.CSSProperties = { maxWidth: 170 };

  return (
    <div className="page">
      <PageHeader
        eyebrow="Review · Inspector"
        title="Calls"
        desc="Turn-level audit trail for every live and simulated call — guard diffs, latency, and hash-chain integrity."
        right={
          <>
            <Badge tone="neutral">{filteredCalls.length} of {calls.length}</Badge>
            {fails > 0 && <Badge tone="danger">{fails} hard-fails</Badge>}
            {blocked > 0 && <Badge tone="warning">{blocked} guard hits</Badge>}
            {onRefresh && (
              <button className="btn btn-sm" onClick={onRefresh} title="Reload calls from server">
                Refresh
              </button>
            )}
          </>
        }
      />

      <div className="toolbar">
        <input
          className="input"
          type="text"
          placeholder="Search call ID or persona…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          style={{ flex: '1 1 220px', minWidth: 200 }}
        />
        <select className="select" style={selectStyle} value={filterSource} onChange={(e) => { setFilterSource(e.target.value); setPage(1); }}>
          <option value="all">All sources</option>
          <option value="sim">Simulated</option>
          <option value="live">Live</option>
        </select>
        <select className="select" style={selectStyle} value={filterVariant} onChange={(e) => { setFilterVariant(e.target.value); setPage(1); }}>
          <option value="all">All variants</option>
          <option value="v2_graph">v2_graph</option>
          <option value="v1_baseline">v1_baseline</option>
          <option value="v1_no_guard">v1_no_guard</option>
          <option value="v2_graph_no_slow_path">v2_no_slow_path</option>
        </select>
        <select className="select" style={selectStyle} value={filterPersona} onChange={(e) => { setFilterPersona(e.target.value); setPage(1); }}>
          <option value="all">All personas</option>
          {personas.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select className="select" style={selectStyle} value={filterHardFail} onChange={(e) => { setFilterHardFail(e.target.value); setPage(1); }}>
          <option value="all">Hard-fail: all</option>
          <option value="passed">Passed</option>
          <option value="failed">Failed</option>
        </select>
        <select className="select" style={selectStyle} value={filterBlocked} onChange={(e) => { setFilterBlocked(e.target.value); setPage(1); }}>
          <option value="all">Guard: all</option>
          <option value="blocked">Intercepted</option>
          <option value="none">Clean</option>
        </select>
        <select className="select" style={selectStyle} value={sortBy} onChange={(e) => { setSortBy(e.target.value as any); setPage(1); }}>
          <option value="newest">Sort: Newest</option>
          <option value="oldest">Sort: Oldest</option>
          <option value="turns">Sort: Most turns</option>
        </select>
      </div>

      {loading ? (
        <div className="card card-pad" style={{ textAlign: 'center', color: 'var(--text-tertiary)' }}>Loading calls…</div>
      ) : error ? (
        <div className="card card-pad" style={{ textAlign: 'center', borderColor: 'var(--danger-border)', background: 'var(--danger-soft)' }}>
          <div style={{ fontWeight: 650, color: 'var(--danger)' }}>Could not load calls</div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>{error}</div>
        </div>
      ) : paginatedCalls.length === 0 ? (
        <EmptyState title="No calls match these filters" desc="Clear search or widen the variant / persona filters." />
      ) : (
        <>
          <div className="table-wrap">
            <table className="grid">
              <thead>
                <tr>
                  <th>Call</th>
                  <th>Source</th>
                  <th>Variant</th>
                  <th>Persona</th>
                  <th>Outcome</th>
                  <th>Guard</th>
                  <th>Hard-fail</th>
                  <th style={{ textAlign: 'right' }}>Turns</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {paginatedCalls.map((call) => {
                  const rowClass = call.hardFailPassed === false ? 'row-danger' : call.hasComplianceBlock ? 'row-warn' : '';
                  return (
                    <tr key={call.id} className={rowClass} onClick={() => onSelectCall(call.id)} style={{ cursor: 'pointer' }}>
                      <td>
                        <div className="mono" title={call.id} style={{ fontWeight: 600 }}>{shortId(call.id)}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                          {new Date(call.timestamp).toLocaleString()}
                        </div>
                      </td>
                      <td><SourceBadge source={call.source} /></td>
                      <td className="mono">{call.variant}</td>
                      <td style={{ fontWeight: 550 }}>{call.persona}</td>
                      <td style={{ color: call.promiseSecured ? 'var(--success)' : 'var(--text-secondary)', fontWeight: call.promiseSecured ? 650 : 400 }}>
                        {call.promiseSecured ? 'Promise secured' : call.outcome}
                      </td>
                      <td><ComplianceBadge blocked={call.hasComplianceBlock} /></td>
                      <td>{call.hardFailPassed === null ? <span style={{ color: 'var(--text-dim)', fontSize: 12.5 }} title="Never evaluated">—</span> : <HardFailBadge passed={call.hardFailPassed} />}</td>
                      <td className="mono" style={{ textAlign: 'right' }}>{call.totalTurns}</td>
                      <td style={{ textAlign: 'right' }}>
                        <button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); onSelectCall(call.id); }}>
                          Open
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginTop: 12 }}>
              <span style={{ fontSize: 12.5, color: 'var(--text-tertiary)' }}>Page {safePage} of {totalPages}</span>
              <button className="btn btn-sm" disabled={safePage <= 1} onClick={() => setPage(Math.max(1, safePage - 1))}>Previous</button>
              <button className="btn btn-sm" disabled={safePage >= totalPages} onClick={() => setPage(Math.min(totalPages, safePage + 1))}>Next</button>
            </div>
          )}
        </>
      )}
    </div>
  );
};
