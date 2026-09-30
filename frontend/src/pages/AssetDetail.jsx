import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiFetch, useAuth } from '../context/AuthContext';
import { MapPin, Calendar, ArrowLeft, Share2, RotateCcw } from 'lucide-react';

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

export default function AssetDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [holders, setHolders] = useState([]);
  const [holdersLoading, setHoldersLoading] = useState(false);
  const [statuses, setStatuses] = useState([]);
  const [nextStatus, setNextStatus] = useState('');
  const [savingStatus, setSavingStatus] = useState(false);
  const [statusError, setStatusError] = useState('');
  const navigate = useNavigate();
  const [asset, setAsset] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [transferModal, setTransferModal] = useState(false);
  const [transferHolder, setTransferHolder] = useState('');
  const [transferReason, setTransferReason] = useState('');
  const [transferring, setTransferring] = useState(false);
  const [transferError, setTransferError] = useState('');

  useEffect(() => {
    loadAsset();
  }, [id]);

  async function loadAsset() {
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch(`/assets/${id}`);
      if (!res.ok) throw new Error('Asset not found');
      const data = await res.json();
      setAsset(data);
      setNextStatus(data.status);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function openTransfer() {
    setTransferModal(true);
    setTransferError('');
    setHoldersLoading(true);
    try {
      const res = await apiFetch('/assets/holders');
      if (!res.ok) throw new Error('Unable to load holders. Close and try again.');
      setHolders(await res.json());
    } catch (err) {
      setTransferError(err.message);
    } finally {
      setHoldersLoading(false);
    }
  }

  useEffect(() => {
    if (user?.role !== 'inspector') return;
    apiFetch('/assets/statuses').then(async res => {
      if (!res.ok) throw new Error('Unable to load statuses');
      setStatuses(await res.json());
    }).catch(err => setStatusError(err.message));
  }, [user?.role]);

  async function handleStatus(event) {
    event.preventDefault();
    setSavingStatus(true);
    setStatusError('');
    try {
      const res = await apiFetch(`/assets/${id}`, {
        method: 'PATCH', body: JSON.stringify({ status: nextStatus }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Status update failed');
      }
      await loadAsset();
    } catch (err) {
      setStatusError(err.message);
    } finally {
      setSavingStatus(false);
    }
  }

  async function handleTransfer() {
    if (!transferHolder) return;
    setTransferring(true);
    setTransferError('');
    try {
      const res = await apiFetch(`/assets/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          holder_id: transferHolder,
          transfer_reason: transferReason,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Transfer failed');
      }
      await loadAsset();
      setTransferModal(false);
      setTransferHolder('');
      setTransferReason('');
    } catch (err) {
      setTransferError(err.message);
    } finally {
      setTransferring(false);
    }
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>Loading asset…</div>;
  if (error) return <div style={{ padding: 40, textAlign: 'center', color: '#dc2626' }}>{error}</div>;
  if (!asset) return null;

  const isIssuer = user?.role === 'issuer' && asset.issuer_id === user.id;

  return (
    <div>
      <button className="btn btn-secondary btn-sm" onClick={() => navigate('/assets')} style={{ marginBottom: 16 }}>
        <ArrowLeft size={16} /> Back to Assets
      </button>

      <div className="page-header">
        <div>
          <h1 className="page-title">{asset.title}</h1>
          <p className="page-subtitle">{asset.asset_type} · {formatDate(asset.created_at)}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Badge label={asset.status.replace('_', ' ')} type={asset.status} />
          {isIssuer && (
            <button className="btn btn-primary btn-sm" onClick={openTransfer}>
              <Share2 size={16} /> Transfer Asset
            </button>
          )}
        </div>
      </div>

      {user?.role === 'inspector' && (
        <form className="card" onSubmit={handleStatus} style={{ marginBottom: 20 }}>
          <div className="card-body">
            <label className="form-label" htmlFor="inspection-status">Inspection status</label>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <select id="inspection-status" className="form-input" style={{ flex: 1 }} value={nextStatus} onChange={e => setNextStatus(e.target.value)} disabled={savingStatus || !statuses.length}>
                {statuses.map(status => <option key={status.value} value={status.value}>{status.label}</option>)}
              </select>
              <button className="btn btn-primary" disabled={savingStatus || !statuses.length || nextStatus === asset.status}>{savingStatus ? 'Saving…' : 'Save Status'}</button>
            </div>
            {statusError && <p role="alert" style={{ color: '#dc2626' }}>{statusError}</p>}
          </div>
        </form>
      )}

      <div className="asset-detail-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(240px, 320px)', gap: 20 }}>
        {/* Main info */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-body">
            <div style={{ marginBottom: 20 }}>
              <p style={{ color: '#64748b', fontSize: 14, marginBottom: 8 }}>{asset.description}</p>
            </div>

            {/* Metadata */}
            {asset.metadata && typeof asset.metadata === 'object' && Object.keys(asset.metadata).length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 10, color: '#0c4a6e' }}>Details</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {Object.entries(asset.metadata).map(([key, val]) => {
                    const formattedKey = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                    const formattedVal = typeof val === 'object' ? JSON.stringify(val) : String(val);
                    return (
                      <div key={key} style={{ padding: '8px 12px', background: '#f8fafc', borderRadius: 6, border: '1px solid #e2e8f0' }}>
                        <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{formattedKey}</div>
                        <div style={{ fontSize: 13, color: '#0c4a6e', marginTop: 2, wordBreak: 'break-word' }}>{formattedVal}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Event Timeline */}
            <div>
              <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 10, color: '#0c4a6e' }}>Event History</h3>
              {asset.events && asset.events.length > 0 ? (
                <div className="timeline">
                  {asset.events.map(evt => (
                    <div key={evt.id} className="timeline-item">
                      <div className="timeline-content">
                        <div className="timeline-event-type">{evt.event_type.replace(/_/g, ' ')}</div>
                        <div className="timeline-description">{evt.event_description}</div>
                        <div className="timeline-meta">
                          <span>{evt.actor_name}</span>
                          <span>·</span>
                          <span>{evt.actor_role_label || evt.actor_role}</span>
                          <span>·</span>
                          <span>{formatDateTime(evt.created_at)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ color: '#94a3b8', fontSize: 13 }}>No events recorded yet.</p>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card">
            <div className="card-body">
              <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Issuer</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#0f766e', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, flexShrink: 0 }}>
                  {asset.issuer_name?.charAt(0)}
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{asset.issuer_name}</div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>{asset.issuer_email}</div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>{asset.issuer_org}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-body">
              <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Current Holder</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#0891b2', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, flexShrink: 0 }}>
                  {asset.holder_name?.charAt(0)}
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{asset.holder_name}</div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>{asset.holder_email}</div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>{asset.holder_org}</div>
                </div>
              </div>
            </div>
          </div>

          {asset.location && (
            <div className="card">
              <div className="card-body">
                <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Location</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#0c4a6e' }}>
                  <MapPin size={14} /> {asset.location}
                </div>
              </div>
            </div>
          )}

          {asset.issued_at && (
            <div className="card">
              <div className="card-body">
                <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Issued</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#0c4a6e' }}>
                  <Calendar size={14} /> {formatDateTime(asset.issued_at)}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Transfer Modal */}
      {transferModal && (
        <div className="modal-overlay" onClick={() => setTransferModal(false)}>
          <div className="modal" role="dialog" aria-modal="true" aria-label="Transfer Asset" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Transfer Asset</h2>
              <button className="modal-close" onClick={() => setTransferModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{ marginBottom: 16, padding: '12px 16px', background: '#fef3c7', borderRadius: 8, fontSize: 13, color: '#92400e' }}>
                <strong>Transferring:</strong> {asset.title}
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="transfer-holder">New Holder</label>
                <select id="transfer-holder" className="form-input" value={transferHolder} onChange={e => setTransferHolder(e.target.value)} disabled={holdersLoading || transferring}>
                  <option value="">{holdersLoading ? 'Loading holders…' : 'Select a holder'}</option>
                  {holders.filter(holder => holder.id !== asset.current_holder_id).map(holder => (
                    <option key={holder.id} value={holder.id}>{holder.full_name} — {holder.organization}</option>
                  ))}
                </select>
                <div className="form-hint">Select an active user to transfer asset ownership.</div>
              </div>
              <div className="form-group">
                <label className="form-label">Reason for Transfer (optional)</label>
                <input
                  className="form-input"
                  value={transferReason}
                  onChange={e => setTransferReason(e.target.value)}
                  placeholder="e.g. facility_relocation, operational_handoff"
                />
              </div>
              {transferError && <div style={{ color: '#dc2626', fontSize: 13, marginTop: 8 }}>{transferError}</div>}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setTransferModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleTransfer} disabled={transferring || !transferHolder}>
                {transferring ? 'Transferring…' : 'Confirm Transfer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function formatDate(dateStr) {
  try { return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); } catch { return dateStr; }
}
function formatDateTime(dateStr) {
  try { return new Date(dateStr).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return dateStr; }
}
