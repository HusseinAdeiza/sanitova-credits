import { useState, useEffect } from 'react';
import { apiFetch, useAuth } from '../context/AuthContext';
import { TrendingUp, FileCheck, AlertTriangle, Users } from 'lucide-react';

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

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch('/dashboard/stats')
      .then(r => r.ok ? r.json() : Promise.reject(r))
      .then(setStats)
      .catch(() => setError('Failed to load dashboard data'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>Loading dashboard…</div>;
  if (error) return <div style={{ padding: 40, textAlign: 'center', color: '#dc2626' }}>{error}</div>;
  if (!stats) return null;

  const totalAssets = stats.total_assets || 0;
  const verifiedCount = stats.asset_status_counts?.find(s => s.status === 'verified')?.count || 0;
  const pendingCount = stats.asset_status_counts?.filter(s => ['pending_review', 'in_review'].includes(s.status)).reduce((sum, s) => sum + Number(s.count), 0) || 0;
  const totalEvents = stats.event_type_counts?.reduce((sum, e) => sum + Number(e.count), 0) || 0;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Overview of your compliance assets and activity</p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Total Assets</div>
          <div className="stat-value">{totalAssets}</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <span className="stat-badge badge-verified">{verifiedCount} verified</span>
            <span className="stat-badge badge-pending_review">{pendingCount} pending</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Audit Events</div>
          <div className="stat-value">{totalEvents}</div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>Total event log entries</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Asset Types</div>
          <div className="stat-value">{stats.asset_type_counts?.length || 0}</div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
            {stats.asset_type_counts?.map(t => t.asset_type).join(', ') || 'None'}
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Your Role</div>
          <div className="stat-value" style={{ fontSize: 18, fontWeight: 600 }}>
            <span style={{ textTransform: 'capitalize' }}>
              {user?.role?.replace('_', ' ') || 'Active'}
            </span>
          </div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 4, textTransform: 'capitalize' }}>
            Active session · compliance management
          </div>
        </div>
      </div>

      {/* Status Breakdown */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <h3>Asset Status Breakdown</h3>
        </div>
        <div className="card-body">
          {stats.asset_status_counts && stats.asset_status_counts.length > 0 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
              {stats.asset_status_counts.map(s => (
                <div key={s.status} style={{ textAlign: 'center', minWidth: 90 }}>
                  <div style={{ fontSize: 24, fontWeight: 700, color: '#0c4a6e' }}>{s.count}</div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>
                    <Badge label={s.status.replace('_', ' ')} type={s.status} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: '#64748b', textAlign: 'center', padding: 20 }}>No assets yet</p>
          )}
        </div>
      </div>

      {/* Asset Type Breakdown */}
      {stats.asset_type_counts && stats.asset_type_counts.length > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header">
            <h3>By Asset Type</h3>
          </div>
          <div className="card-body">
            <table className="table">
              <thead>
                <tr><th>Type</th><th style={{ textAlign: 'right' }}>Count</th></tr>
              </thead>
              <tbody>
                {stats.asset_type_counts.map(t => (
                  <tr key={t.asset_type}>
                    <td>{t.asset_type}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{t.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Event Type Breakdown */}
      {stats.event_type_counts && stats.event_type_counts.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h3>Event Activity</h3>
          </div>
          <div className="card-body">
            <table className="table">
              <thead>
                <tr><th>Event Type</th><th style={{ textAlign: 'right' }}>Count</th></tr>
              </thead>
              <tbody>
                {stats.event_type_counts.map(e => (
                  <tr key={e.event_type}>
                    <td>{e.event_type.replace(/_/g, ' ')}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{e.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
