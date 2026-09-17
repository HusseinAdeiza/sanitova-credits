import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiFetch, useAuth } from '../context/AuthContext';
import { Plus, MapPin, Search, FileCheck } from 'lucide-react';

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

export default function Assets() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    loadAssets(controller.signal);
    return () => controller.abort();
  }, [statusFilter, typeFilter]);

  async function loadAssets(signal) {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (typeFilter) params.set('type', typeFilter);
      const res = await apiFetch(`/assets?${params}`, { signal });
      if (!res.ok) throw new Error('Failed to load assets');
      const data = await res.json();
      setAssets(data);
    } catch (err) {
      if (!signal?.aborted) setError(err.message);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }

  const filtered = assets.filter(a =>
    !search || a.title.toLowerCase().includes(search.toLowerCase()) ||
    a.asset_type.toLowerCase().includes(search.toLowerCase()) ||
    a.location?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Compliance Assets</h1>
          <p className="page-subtitle">{assets.length} asset{assets.length !== 1 ? 's' : ''} total</p>
        </div>
        {user?.role === 'issuer' && (
          <button className="btn btn-primary" onClick={() => navigate('/create-asset')}>
            <Plus size={18} /> New Asset
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-body" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
            <Search size={16} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input
              className="form-input"
              placeholder="Search assets..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ paddingLeft: 34 }}
            />
          </div>
          <select className="form-select" style={{ width: 180 }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">All statuses</option>
            {['created','pending_review','in_review','verified','suspended','expired'].map(s => (
              <option key={s} value={s}>{s.replace('_', ' ')}</option>
            ))}
          </select>
          <select className="form-select" style={{ width: 220 }} value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
            <option value="">All types</option>
            {['Sanitation Inspection Certificate','WASH Facility Verification','Waste Compliance Certificate','Environmental Health Audit Asset','Water Quality Compliance','Food Safety Certification'].map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          {(statusFilter || typeFilter) && (
            <button className="btn btn-secondary btn-sm" onClick={() => { setStatusFilter(''); setTypeFilter(''); }}>
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Asset Cards */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>Loading assets…</div>
      ) : error ? (
        <div role="alert" style={{ textAlign: 'center', padding: 40, color: '#dc2626' }}>{error}<br /><button className="btn btn-secondary" onClick={() => loadAssets()}>Retry loading assets</button></div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <FileCheck size={48} />
          <h3>No assets found</h3>
          <p>{search ? 'Try adjusting your search or filters.' : 'Create your first compliance asset to get started.'}</p>
          {user?.role === 'issuer' && !search && (
            <button className="btn btn-primary" onClick={() => navigate('/create-asset')}>
              <Plus size={18} /> Create Asset
            </button>
          )}
        </div>
      ) : (
        <div className="assets-grid">
          {filtered.map(asset => (
            <Link key={asset.id} className="asset-card" to={`/assets/${asset.id}`}>
              <div className="asset-card-type">{asset.asset_type}</div>
              <div className="asset-card-title">{asset.title}</div>
              <div className="asset-card-desc">{asset.description || 'No description provided'}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <Badge label={asset.status.replace('_', ' ')} type={asset.status} />
              </div>
              {asset.location && (
                <div className="asset-card-meta">
                  <span className="asset-card-location">
                    <MapPin size={12} /> {asset.location}
                  </span>
                  <span>{formatDate(asset.created_at)}</span>
                </div>
              )}
              <div style={{ marginTop: 10, display: 'flex', gap: 8, fontSize: 11, color: '#94a3b8' }}>
                <span>Issued by {asset.issuer_name}</span>
                <span>·</span>
                <span>Held by {asset.holder_name}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function formatDate(dateStr) {
  try {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return dateStr; }
}
