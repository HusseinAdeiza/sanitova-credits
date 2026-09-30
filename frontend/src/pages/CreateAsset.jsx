import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../context/AuthContext';
import { ArrowLeft, Plus } from 'lucide-react';

export default function CreateAsset() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    asset_type: 'Sanitation Inspection Certificate',
    title: '',
    description: '',
    location: '',
    metadata: '',
    issued_at: new Date().toISOString().split('T')[0],
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [assetTypes, setAssetTypes] = useState([]);

  useEffect(() => {
    apiFetch('/assets/types')
      .then(res => res.ok ? res.json() : Promise.reject(res))
      .then(types => {
        setAssetTypes(types.map(t => t.value));
        setForm(f => ({ ...f, asset_type: types[0]?.value || f.asset_type }));
      })
      .catch(() => setError('Unable to load asset types. Refresh and try again.'));
  }, []);

  function update(field) {
    return e => setForm(f => ({ ...f, [field]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (loading || success || !assetTypes.length) return;
    setError('');
    setLoading(true);
    try {
      if (!form.title.trim()) throw new Error('Enter an asset title.');
      let metadata;
      try {
        metadata = form.metadata ? JSON.parse(form.metadata) : {};
      } catch {
        throw new Error('Metadata must be valid JSON, for example {"inspection_score": 94}.');
      }
      if (!metadata || Array.isArray(metadata) || typeof metadata !== 'object') {
        throw new Error('Metadata must be a JSON object, not a list or single value.');
      }

      const res = await apiFetch('/assets', {
        method: 'POST',
        body: JSON.stringify({
          asset_type: form.asset_type,
          title: form.title.trim(),
          description: form.description,
          location: form.location,
          metadata,
          issued_at: form.issued_at ? new Date(form.issued_at) : new Date(),
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create asset');
      }

      const asset = await res.json();
      setSuccess(true);
      setTimeout(() => navigate(`/assets/${asset.id}`), 800);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button className="btn btn-secondary btn-sm" onClick={() => navigate('/assets')} style={{ marginBottom: 16 }}>
        <ArrowLeft size={16} /> Back to Assets
      </button>

      <div className="page-header">
        <div>
          <h1 className="page-title">Create Compliance Asset</h1>
          <p className="page-subtitle">Issue a new compliance asset on the SanitovaCredits platform</p>
        </div>
      </div>

      <div className="card" style={{ maxWidth: 720, margin: '0 auto' }}>
        <div className="card-body">
          {error && <div style={{ background: '#fee2e2', color: '#991b1b', padding: '10px 14px', borderRadius: 8, fontSize: 13, marginBottom: 16 }}>{error}</div>}

          <form onSubmit={handleSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 8 }}>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label className="form-label" htmlFor="asset-type">Asset Type <span style={{ color: '#dc2626' }}>*</span></label>
                <select id="asset-type" className="form-select" value={form.asset_type} onChange={update('asset_type')}>
                  {assetTypes.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label className="form-label" htmlFor="asset-title">Title <span style={{ color: '#dc2626' }}>*</span></label>
                <input id="asset-title" className="form-input" value={form.title} onChange={update('title')} placeholder="e.g. Q3 2026 Sanitation Compliance - Facility A" required />
                <div className="form-hint">A clear, descriptive title for this compliance asset.</div>
              </div>

              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label className="form-label" htmlFor="asset-description">Description</label>
                <textarea id="asset-description" className="form-textarea" value={form.description} onChange={update('description')} placeholder="Describe the compliance asset, what was verified, standards applied, etc." style={{ minHeight: 100 }} />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="asset-location">Location</label>
                <input id="asset-location" className="form-input" value={form.location} onChange={update('location')} placeholder="e.g. Zurich, Switzerland" />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="asset-issued">Issue Date</label>
                <input id="asset-issued" type="date" className="form-input" value={form.issued_at} onChange={update('issued_at')} />
              </div>

              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label className="form-label" htmlFor="asset-metadata">Metadata (JSON, optional)</label>
                <textarea id="asset-metadata"
                  className="form-textarea"
                  value={form.metadata}
                  onChange={update('metadata')}
                  placeholder='{"inspection_date": "2026-09-15", "standards_applied": ["WHO-GWQS-2025"], "inspector_id": "usr_clara"}'
                  style={{ minHeight: 80, fontFamily: 'monospace', fontSize: 13 }}
                />
                <div className="form-hint">Structured data about this asset — inspection scores, standards, dates, etc.</div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 8, paddingTop: 16, borderTop: '1px solid #e2e8f0' }}>
              <button type="button" className="btn btn-secondary" onClick={() => navigate('/assets')}>Cancel</button>
              <button type="submit" className="btn btn-primary btn-lg" disabled={loading || success || !assetTypes.length}>
                {loading ? 'Creating…' : <><Plus size={18} /> Create Asset</>}
              </button>
            </div>
          </form>
        </div>
      </div>

      {success && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, background: '#16a34a', color: 'white', padding: '10px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 200 }}>
          ✅ Asset created! Redirecting…
        </div>
      )}
    </div>
  );
}
