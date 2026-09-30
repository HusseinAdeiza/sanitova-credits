import { useEffect, useState } from 'react';
import { apiFetch, useAuth } from '../context/AuthContext';

const formatter = new Intl.DateTimeFormat();
function Checkpoint({ checkpoint }) {
  return <p style={{ marginTop: 12 }} role={checkpoint.stale ? 'alert' : undefined}>
    Ledger checkpoint offset {checkpoint.offset}
    {checkpoint.stale ? ' · synchronization is stale; records may be outdated' : ` · synchronized ${formatter.format(new Date(checkpoint.syncedAt))}`}
  </p>;
}
export default function CantonRecords() {
  const { user } = useAuth();
  const [tab, setTab] = useState('contracts');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    const controller = new AbortController();
    apiFetch(`/ledger/records${tab === 'events' ? '/events' : ''}?page=${page}`, { signal: controller.signal })
      .then(async response => {
        const body = await response.json();
        if (!active) return;
        if (!response.ok) throw new Error(body.error || 'Canton records are unavailable');
        setData(body);
      })
      .catch(err => { if (active && err.name !== 'AbortError') { setData(null); setError(err.message); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [tab, page, user.id]);
  // Tab-scoped rows: undefined until the matching response arrives, so a tab switch
  // can never render the previous tab's data shape.
  const rows = data ? (tab === 'events' ? data.events : data.contracts) : null;
  return <div style={{ maxWidth: 1000 }}>
    <h1 className="page-title">Canton Records</h1>
    <p className="page-subtitle">Durable ledger projection · scoped to your approved party</p>
    <p>These records are synchronized from the local Canton sandbox into PostgreSQL. Visibility follows ledger witness parties, not the legacy asset database. Unarchived contracts are shown as nothing yet synced; later ledger changes may not be reflected yet.</p>
    <div role="tablist" style={{ display: 'flex', gap: 12, margin: '16px 0' }}>
      <button role="tab" aria-selected={tab === 'contracts'} className={`btn ${tab === 'contracts' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => { setTab('contracts'); setPage(0); }}>Active contracts</button>
      <button role="tab" aria-selected={tab === 'events'} className={`btn ${tab === 'events' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => { setTab('events'); setPage(0); }}>Ledger events</button>
    </div>
    {error && <p role="alert">{error}</p>}
    {loading && <p role="status">Loading ledger records…</p>}
    {data && <Checkpoint checkpoint={data.checkpoint} />}
    {Array.isArray(rows) && <>
      {rows.length === 0 && !loading && <p>{tab === 'events' ? 'No ledger events for your party on this page.' : 'No active ledger contracts are visible to your party on this page.'}</p>}
      {tab === 'contracts' && rows.map(row => {
        const isProposal = row.template_id?.endsWith(':Main:TransferProposal');
        const payload = isProposal ? row.payload.asset : row.payload;
        return <article className="card" key={row.contract_id} style={{ marginTop: 16, overflowWrap: 'anywhere' }}><div className="card-body">
          <h3>{isProposal ? `Transfer proposal · ${payload.title}` : payload.title}</h3>
          <p>{isProposal
            ? <>Transfer proposal · recipient {row.payload.recipient}</>
            : <>Status: {payload.status} · Asset ID: {payload.assetId}</>}</p>
          <p>{isProposal
            ? <>Current holder: {payload.holder}</>
            : <>Holder: {payload.holder}</>}</p>
          <dl><dt>Contract ID</dt><dd>{row.contract_id}</dd><dt>Ledger update</dt><dd>{row.created_update_id}</dd><dt>Created at offset</dt><dd>{row.created_offset}</dd></dl>
        </div></article>;
      })}
      {tab === 'events' && rows.map(row => <article className="card" key={row.eventId} style={{ marginTop: 16, overflowWrap: 'anywhere' }}><div className="card-body">
        <h3>{row.title || row.contractId}</h3>
        <p>{row.eventType === 'created' ? 'Contract created' : 'Contract archived'} · status {row.status ?? 'n/a'}</p>
        <dl><dt>Contract ID</dt><dd>{row.contractId}</dd><dt>Update ID</dt><dd>{row.updateId}</dd><dt>Node</dt><dd>{row.nodeId}</dd><dt>Offset</dt><dd>{row.ledgerOffset}</dd></dl>
      </div></article>)}
      {data.nextPage !== null && <button className="btn btn-secondary" style={{ marginTop: 12 }} onClick={() => setPage(data.nextPage)}>{tab === 'events' ? 'Older events' : 'Older contracts'} (page {data.nextPage})</button>}
    </>}
  </div>;
}
