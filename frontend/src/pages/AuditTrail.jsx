import { useState, useEffect } from 'react';
import { apiFetch } from '../context/AuthContext';
import { Download, Search, Filter, FileText, Shield } from 'lucide-react';

function Badge({ label, type }) {
  const cls = {
    created: 'badge-created',
    pending_review: 'badge-pending_review',
    in_review: 'badge-in_review',
    verified: 'badge-verified',
    suspended: 'badge-suspended',
    expired: 'badge-expired',
  }[type] || 'badge-created';
  return <span className={`badge ${cls}`}>{label}</span>;
}

export default function AuditTrail() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState(null);
  const [filters, setFilters] = useState({ asset_id: '', event_type: '', from_date: '', to_date: '' });
  const [showSummary, setShowSummary] = useState(true);

  useEffect(() => {
    loadEvents();
    loadSummary();
  }, [filters]);

  async function loadEvents() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.asset_id) params.set('asset_id', filters.asset_id);
      if (filters.event_type) params.set('event_type', filters.event_type);
      if (filters.from_date) params.set('from_date', filters.from_date);
      if (filters.to_date) params.set('to_date', filters.to_date);
      const res = await apiFetch(`/audit?${params}`);
      if (!res.ok) throw new Error('Failed to load audit trail');
      const data = await res.json();
      setEvents(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadSummary() {
    try {
      const res = await apiFetch('/audit/summary');
      if (res.ok) setSummary(await res.json());
    } catch {}
  }

  function handleExport() {
    const params = new URLSearchParams();
    if (filters.asset_id) params.set('asset_id', filters.asset_id);
    if (filters.event_type) params.set('event_type', filters.event_type);
    if (filters.from_date) params.set('from_date', filters.from_date);
    if (filters.to_date) params.set('to_date', filters.to_date);
    window.location.href = `/api/audit/export?${params}`;
  }

  const filteredEvents = events.filter(e => {
    if (filters.asset_id && e.asset_id !== filters.asset_id) return false;
    if (filters.event_type && e.event_type !== filters.event_type) return false;
    return true;
  });

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Audit Trail</h1>
          <p className="page-subtitle">Complete event log for compliance asset lifecycle</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowSummary(!showSummary)}>
            <Shield size={16} /> {showSummary ? 'Hide' : 'Show'} Summary
          </button>
          <button className="btn btn-primary btn-sm" onClick={handleExport}>
            <Download size={16} /> Export JSON
          </button>
        </div>
      </div>

      {/* Summary Card */}
      {showSummary && summary && (
        <div className="stats-grid" style={{ marginBottom: 20 }}>
          <div className="stat-card">
            <div className="stat-label">Total Events</div>
            <div className="stat-value">{summary.total_events}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Assets Tracked</div>
            <div className="stat-value">{summary.total_assets}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Unique Actors</div>
            <div className="stat-value">{summary.total_actors}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Event Types</div>
            <div className="stat-value" style={{ fontSize: 18 }}>{summary.event_types?.length || 0}</div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-body" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
            <Search size={16} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input style={{ paddingLeft: 34, padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, width: '100%', fontFamily: 'inherit' }}
              placeholder="Filter by asset ID..."
              value={filters.asset_id}
              onChange={e => setFilters(f => ({ ...f, asset_id: e.target.value }))}
            />
          </div>
          <select className="form-select" style={{ width: 160 }} value={filters.event_type} onChange={e => setFilters(f => ({ ...f, event_type: e.target.value }))}>
            <option value="">All events</option>
            <option value="created">Created</option>
            <option value="status_changed">Status Changed</option>
            <option value="transferred">Transferred</option>
          </select>
          <input type="date" className="form-input" style={{ width: 150 }} value={filters.from_date} onChange={e => setFilters(f => ({ ...f, from_date: e.target.value }))} placeholder="From" />
          <input type="date" className="form-input" style={{ width: 150 }} value={filters.to_date} onChange={e => setFilters(f => ({ ...f, to_date: e.target.value }))} placeholder="To" />
          {(filters.asset_id || filters.event_type || filters.from_date || filters.to_date) && (
            <button className="btn btn-secondary btn-sm" onClick={() => setFilters({ asset_id: '', event_type: '', from_date: '', to_date: '' })}>Clear</button>
          )}
        </div>
      </div>

      {/* Event Log */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>Loading audit trail…</div>
      ) : error ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#dc2626' }}>{error}</div>
      ) : filteredEvents.length === 0 ? (
        <div className="empty-state">
          <FileText size={48} />
          <h3>No events found</h3>
          <p>Try adjusting your filters or check back after assets are created and updated.</p>
        </div>
      ) : (
        <div className="card">
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Event</th>
                  <th>Asset</th>
                  <th>Actor</th>
                  <th>Role</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                {filteredEvents.map(evt => (
                  <tr key={evt.id}>
                    <td style={{ whiteSpace: 'nowrap', fontSize: 12, color: '#64748b' }}>{formatDateTime(evt.created_at)}</td>
                    <td>
                      <Badge label={evt.event_type.replace(/_/g, ' ')} type={evt.event_type} />
                    </td>
                    <td style={{ maxWidth: 200 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#0c4a6e' }}>{evt.asset_title || evt.asset_type}</div>
                      <div style={{ fontSize: 11, color: '#94a3b8' }}>{evt.asset_id}</div>
                    </td>
                    <td>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{evt.actor_name}</div>
                      <div style={{ fontSize: 11, color: '#94a3b8' }}>{evt.actor_email}</div>
                    </td>
                    <td style={{ fontSize: 12, color: '#64748b' }}>{evt.actor_role_label || evt.actor_role}</td>
                    <td style={{ fontSize: 13, color: '#475569' }}>{evt.event_description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Event type legend */}
      {summary?.event_types && summary.event_types.length > 0 && (
        <div className="card" style={{ marginTop: 20 }}>
          <div className="card-header">
            <h3>Event Type Breakdown</h3>
          </div>
          <div className="card-body">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
              {summary.event_types.map(t => (
                <div key={t.event_type} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', background: '#f8fafc', borderRadius: 6, border: '1px solid #e2e8f0' }}>
                  <Badge label={t.event_type.replace(/_/g, ' ')} type={t.event_type} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#0c4a6e' }}>{t.count} events</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function formatDateTime(dateStr) {
  try { return new Date(dateStr).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return dateStr; }
}
