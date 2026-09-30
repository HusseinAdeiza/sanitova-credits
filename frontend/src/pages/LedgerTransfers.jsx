import { useEffect, useRef, useState } from 'react';
import { apiFetch, useAuth } from '../context/AuthContext';

export default function LedgerTransfers() {
  const { user } = useAuth();
  const issuer = user.role === 'issuer';
  const storageKey = `canton-transfer:${user.id}`;
  const [operation, setOperation] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem(storageKey)) || null; }
    catch { return { state: 'unknown' }; }
  });
  const [contractId, setContractId] = useState('');
  const [recipientUserId, setRecipientUserId] = useState('');
  const [recipients, setRecipients] = useState([]);
  const [snapshot, setSnapshot] = useState(null);
  const [agreed, setAgreed] = useState({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const generation = useRef(0);
  const blocked = busy || !!operation;

  async function inbox(next = false) {
    const requestId = ++generation.current;
    setLoading(true); setError('');
    const params = next && snapshot?.nextPageToken
      ? `?${new URLSearchParams({ pageToken: snapshot.nextPageToken, activeAtOffset: snapshot.activeAtOffset })}` : '';
    try {
      const response = await apiFetch(`/ledger/transfers${params}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Inbox unavailable');
      if (requestId === generation.current) setSnapshot(data);
    } catch (err) {
      if (requestId === generation.current) { setSnapshot(null); setError(err.message); }
    } finally {
      if (requestId === generation.current) setLoading(false);
    }
  }
  useEffect(() => {
    inbox();
    const controller = new AbortController();
    if (issuer) apiFetch('/ledger/transfer-recipients', { signal: controller.signal })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Recipient list unavailable');
        setRecipients(data.recipients);
      }).catch(err => { if (err.name !== 'AbortError') setError(err.message); });
    return () => { controller.abort(); generation.current++; };
  }, [user.id]);

  function save(value) {
    sessionStorage.setItem(storageKey, JSON.stringify(value));
    setOperation(value);
  }
  async function submit(kind, id) {
    if (submitting.current || operation) return;
    submitting.current = true; setBusy(true); setError('');
    const pending = { state: 'pending', kind, contractId: id, recipientUserId };
    try { save(pending); }
    catch {
      setError('Session storage unavailable. Enable it before submitting a transfer.');
      submitting.current = false; setBusy(false); return;
    }
    try {
      const response = await apiFetch(kind === 'propose' ? `/ledger/assets/${encodeURIComponent(id)}/transfers` : `/ledger/transfers/${encodeURIComponent(id)}/${kind === 'cancel' ? 'cancel' : 'accept'}`, {
        method: 'POST', body: JSON.stringify(kind === 'propose' ? { recipientUserId } : {}),
      });
      const receipt = await response.json();
      if (!response.ok) {
        save([400, 401, 403, 409].includes(response.status) ? null : { ...pending, state: 'unknown', commandId: receipt.commandId });
        setError(receipt.error || 'Transfer not confirmed');
        return;
      }
      if (!receipt.contractId || !receipt.updateId) throw new Error('Missing receipt');
      save({ ...pending, state: 'confirmed', receipt });
    } catch {
      setOperation({ ...pending, state: 'unknown' });
      setError('Confirmation could not be received or saved. Do not resubmit; reconcile with the ledger.');
    } finally { submitting.current = false; setBusy(false); }
  }
  const receipt = operation?.receipt;
  return <div style={{ maxWidth: 900 }}>
    <h1 className="page-title">Canton Transfers</h1>
    <p className="page-subtitle">Local ledger · explicit recipient consent</p>
    <p>Proposals consume the current asset contract and lock updates until accepted or cancelled by the issuer. Custody changes only when the recipient accepts. The issuer can withdraw a pending proposal from the inbox below; cancellation restores the asset with its previous holder.</p>
    {issuer && <div className="card"><div className="card-body">
      <form onSubmit={event => { event.preventDefault(); submit('propose', contractId.trim()); }}>
        <div className="form-group"><label className="form-label" htmlFor="transfer-source">Current contract ID</label>
          <textarea id="transfer-source" className="form-textarea" required value={contractId} disabled={blocked} onChange={event => setContractId(event.target.value)} /></div>
        <div className="form-group"><label className="form-label" htmlFor="transfer-recipient">Approved recipient</label>
          <select id="transfer-recipient" className="form-select" required value={recipientUserId} disabled={blocked} onChange={event => setRecipientUserId(event.target.value)}>
            <option value="">Select recipient</option>{recipients.map(item => <option key={item.userId} value={item.userId}>{item.label}</option>)}
          </select></div>
        <button className="btn btn-primary" disabled={blocked || !recipientUserId || !contractId.trim()}>Propose transfer</button>
      </form>
    </div></div>}
    {error && <p role="alert">{error}</p>}
    {operation && !receipt && <p role="status">Transfer outcome unresolved. Keep contract reference {operation.contractId} for reconciliation. Reloading will not resubmit.</p>}
    {receipt && <section className="card" style={{ overflowWrap: 'anywhere', marginTop: 20 }}><div className="card-body">
      <h2>{operation.kind === 'propose' ? 'Transfer proposal confirmed' : operation.kind === 'cancel' ? 'Transfer cancelled' : 'Custody accepted'}</h2>
      <p>{receipt.asset.title} · {receipt.asset.status}</p>
      <dl><dt>{operation.kind === 'propose' ? 'Proposal contract ID' : 'Replacement asset contract ID'}</dt><dd data-testid="transfer-contract">{receipt.contractId}</dd>
        <dt>Ledger update ID</dt><dd>{receipt.updateId}</dd><dt>Current holder party</dt><dd>{receipt.asset.holder}</dd></dl>
      <p>This receipt is saved for this tab only, not synchronized into PostgreSQL. Save it before closing the tab.</p>
      <button className="btn btn-secondary" onClick={() => { try { save(null); setContractId(''); setAgreed({}); } catch { setError('Could not clear the saved receipt'); } }}>Receipt saved — start another transfer</button>
    </div></section>}
    <section style={{ marginTop: 24 }}>
      <h2>{issuer ? 'Outstanding proposals' : 'Incoming custody proposals'}</h2>
      <button className="btn btn-secondary" onClick={() => inbox()} disabled={loading}>Refresh inbox</button>
      {loading && <p role="status">Loading ledger snapshot…</p>}
      {snapshot && <p>Snapshot offset: {snapshot.activeAtOffset}. Refresh for the latest state.</p>}
      {!loading && snapshot?.transfers.length === 0 && <p>No pending proposals on this page.</p>}
      {snapshot?.transfers.map(item => <article className="card" key={item.contractId} style={{ marginTop: 16, overflowWrap: 'anywhere' }}><div className="card-body">
        <h3>{item.asset.title}</h3><p>Status: {item.asset.status}</p><p>Asset ID: {item.asset.assetId}</p>
        <p>Issuer: {item.asset.issuer}</p><p>Current holder: {item.asset.holder}</p><p>Recipient: {item.recipient}</p><p>Proposal: {item.contractId}</p>
        {issuer && <><label><input type="checkbox" checked={!!agreed[item.contractId]} disabled={blocked || loading} onChange={event => setAgreed({ ...agreed, [item.contractId]: event.target.checked })} /> I confirm withdrawal of this proposal</label>
          <div style={{ marginTop: 12 }}><button className="btn btn-secondary" disabled={blocked || loading || !agreed[item.contractId]} onClick={() => submit('cancel', item.contractId)}>Cancel proposal</button></div></>}
        {!issuer && <><label><input type="checkbox" checked={!!agreed[item.contractId]} disabled={blocked || loading} onChange={event => setAgreed({ ...agreed, [item.contractId]: event.target.checked })} /> I agree to accept custody</label>
          <div style={{ marginTop: 12 }}><button className="btn btn-primary" disabled={blocked || loading || !agreed[item.contractId]} onClick={() => submit('accept', item.contractId)}>Accept custody</button></div></>}
      </div></article>)}
      {snapshot?.nextPageToken && <button className="btn btn-secondary" disabled={loading} onClick={() => inbox(true)}>Next page</button>}
    </section>
  </div>;
}
