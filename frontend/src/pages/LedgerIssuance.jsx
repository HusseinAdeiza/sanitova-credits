import { useState } from 'react';
import { apiFetch, useAuth } from '../context/AuthContext';

export default function LedgerIssuance() {
  const { user } = useAuth();
  const storageKey = `canton-issuance:${user.id}`;
  const [draft, setDraft] = useState(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey));
      if (saved?.assetId) return saved;
    } catch { /* Corrupt browser storage is not ledger evidence. */ }
    return { assetId: crypto.randomUUID(), title: '', state: 'draft' };
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  function save(next) {
    // Persist pending before submission so a reload cannot silently resubmit.
    sessionStorage.setItem(storageKey, JSON.stringify(next));
    setDraft(next);
  }
  async function submit(event) {
    event.preventDefault();
    if (busy || draft.state !== 'draft' || !draft.title.trim()) return;
    setError('');
    setBusy(true);
    try {
      save({ ...draft, state: 'pending' });
    } catch {
      setError('Browser storage is unavailable. Enable session storage before issuing.');
      setBusy(false);
      return;
    }
    try {
      const res = await apiFetch('/ledger/assets', {
        method: 'POST', body: JSON.stringify({ assetId: draft.assetId, title: draft.title.trim() }),
      });
      const result = await res.json();
      if (!res.ok) {
        // Only explicit pre-submission rejections allow another attempt.
        const rejected = [400, 401, 403].includes(res.status) || result.error === 'Local Canton integration is disabled';
        save({ ...draft, state: rejected ? 'draft' : 'unknown', commandId: result.commandId });
        setError(result.error || 'Issuance was not confirmed.');
        return;
      }
      if (!result.contractId || !result.updateId) throw new Error('Missing receipt');
      save({ ...draft, state: 'confirmed', receipt: result });
    } catch {
      setDraft(current => ({ ...current, state: 'unknown' }));
      setError('Confirmation could not be saved or received. Do not resubmit; ask an operator to reconcile this asset ID.');
    } finally {
      setBusy(false);
    }
  }
  const unresolved = ['pending', 'unknown'].includes(draft.state);
  return (
    <div style={{ maxWidth: 850 }}>
      <div className="page-header"><div><h1 className="page-title">Canton Issuance</h1><p className="page-subtitle">Local ledger integration · separate from PostgreSQL assets</p></div></div>
      <div className="card"><div className="card-body">
        <p>This issues a real contract on the local Canton sandbox, not MainNet or DevNet. Your issuer, inspector and regulator parties must be approved by the operator.</p>
        <form onSubmit={submit} style={{ marginTop: 20 }}>
          <div className="form-group"><label className="form-label" htmlFor="ledger-title">Contract title</label>
            <input id="ledger-title" className="form-input" value={draft.title} maxLength={200} required disabled={draft.state !== 'draft' || busy} onChange={e => setDraft({ ...draft, title: e.target.value })} />
          </div>
          <p style={{ overflowWrap: 'anywhere', marginBottom: 16 }}>Asset ID: <code>{draft.assetId}</code></p>
          <button className="btn btn-primary" disabled={busy || draft.state !== 'draft' || !draft.title.trim()}>{busy ? 'Awaiting ledger confirmation…' : 'Issue on Canton'}</button>
        </form>
        {error && <p role="alert" style={{ color: '#dc2626', marginTop: 16 }}>{error}</p>}
        {unresolved && <p role="status">Issuance outcome is unresolved. Keep this asset ID for reconciliation. Reloading will not automatically resubmit.</p>}
        {draft.receipt && <section aria-label="Ledger receipt" style={{ marginTop: 24, overflowWrap: 'anywhere' }}>
          <h2>Issuance confirmed</h2><p>Confirmed by local Canton. Save these references; this browser receipt is not a database projection.</p>
          <dl><dt>Contract ID</dt><dd data-testid="ledger-contract">{draft.receipt.contractId}</dd><dt>Ledger update ID</dt><dd data-testid="ledger-update">{draft.receipt.updateId}</dd><dt>Command ID</dt><dd>{draft.receipt.commandId}</dd><dt>Ledger offset</dt><dd>{draft.receipt.offset}</dd></dl>
          <button className="btn btn-secondary" style={{ marginTop: 16 }} onClick={() => { save({ assetId: crypto.randomUUID(), title: '', state: 'draft' }); setError(''); }}>Start another asset</button>
        </section>}
      </div></div>
    </div>
  );
}
