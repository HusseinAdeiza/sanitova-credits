import { useState } from 'react';
import { apiFetch } from '../context/AuthContext';

export default function LedgerInspection() {
  const [contractId, setContractId] = useState('');
  const [status, setStatus] = useState('Verified');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState(null);
  const [uncertain, setUncertain] = useState(false);
  async function submit(event) {
    event.preventDefault();
    if (busy || uncertain || receipt) return;
    setBusy(true); setError('');
    try {
      const response = await apiFetch(`/ledger/assets/${encodeURIComponent(contractId.trim())}/status`, {
        method: 'PATCH', body: JSON.stringify({ status }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || 'Status was not confirmed');
        setUncertain(response.status >= 500);
        return;
      }
      setReceipt(data);
    } catch {
      setError('Confirmation unavailable. Reconcile the contract before trying again.');
      setUncertain(true);
    } finally { setBusy(false); }
  }
  return <div style={{ maxWidth: 850 }}>
    <h1 className="page-title">Canton Inspection</h1>
    <p className="page-subtitle">Local sandbox · status changes are executed on the ledger</p>
    <div className="card"><div className="card-body">
      <p>Use the current contract ID from the issuer’s receipt. Only the inspector assigned in the contract can update it. Each successful update replaces the contract ID.</p>
      <form onSubmit={submit}>
        <label className="form-label" htmlFor="inspection-contract">Current Canton contract ID</label>
        <textarea id="inspection-contract" className="form-textarea" value={contractId} onChange={e => setContractId(e.target.value)} required disabled={busy || uncertain || !!receipt} />
        <label className="form-label" htmlFor="canton-status">New ledger status</label>
        <select id="canton-status" className="form-select" value={status} onChange={e => setStatus(e.target.value)} disabled={busy || uncertain || !!receipt}>
          {['PendingReview', 'Verified', 'Suspended', 'Created'].map(value => <option key={value}>{value}</option>)}
        </select>
        <button className="btn btn-primary" style={{ marginTop: 16 }} disabled={busy || uncertain || !!receipt || !contractId.trim()}>{busy ? 'Awaiting Canton…' : 'Update on Canton'}</button>
      </form>
      {error && <p role="alert">{error}</p>}
      {receipt && <section style={{ overflowWrap: 'anywhere' }}>
        <h2>Inspection confirmed</h2><p>{receipt.asset.title}: <strong>{receipt.asset.status}</strong></p>
        <dl><dt>Replacement contract ID</dt><dd data-testid="inspection-contract">{receipt.contractId}</dd><dt>Ledger update ID</dt><dd data-testid="inspection-update">{receipt.updateId}</dd></dl>
        <p>Save these references before leaving this page. Durable audit synchronization is not yet implemented.</p>
      </section>}
    </div></div>
  </div>;
}
