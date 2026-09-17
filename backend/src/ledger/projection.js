const { getClient } = require('../db');
const ledger = 'http://127.0.0.1:7575/v2';

async function read(path, body) {
  const response = await fetch(`${ledger}${path}`, {
    method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`Ledger projection read failed (${response.status}); checkpoint unchanged`);
  return response.json();
}
function offset(value) {
  const number = Number(value);
  if (value == null || !Number.isSafeInteger(number) || number < 0) throw new Error('Invalid ledger offset');
  return number;
}

async function syncPage({ source, parties, pageSize = 50 }) {
  if (process.env.NODE_ENV === 'production') throw new Error('Local projection is disabled in production');
  if (typeof source !== 'string' || !source || !Array.isArray(parties) || !parties.length ||
      parties.some(party => typeof party !== 'string' || !party) || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    throw new Error('Invalid projection scope');
  }
  const scope = [...new Set(parties)].sort();
  const client = await getClient();
  try {
    await client.query('BEGIN');
    // One worker per source, including first initialization. Writes and checkpoint commit together.
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`canton:${source}`]);
    const identity = await read('/parties/participant-id');
    if (typeof identity.participantId !== 'string' || !identity.participantId) throw new Error('Missing participant identity');
    await client.query('INSERT INTO canton_projection_sources(source, participant_id, parties) VALUES($1,$2,$3) ON CONFLICT DO NOTHING', [source, identity.participantId, scope]);
    const state = (await client.query('SELECT * FROM canton_projection_sources WHERE source=$1 FOR UPDATE', [source])).rows[0];
    if (state.participant_id !== identity.participantId || JSON.stringify(state.parties) !== JSON.stringify(scope)) {
      throw new Error('Projection identity or scope changed; create a reviewed new source');
    }
    const begin = offset(state.last_offset);
    const pruned = offset((await read('/state/latest-pruned-offsets')).participantPrunedUpToInclusive);
    const end = offset((await read('/state/ledger-end')).offset);
    if (begin < pruned || end < begin) throw new Error('Ledger pruned or reset; operator reconciliation required');
    if (end === begin) {
      await client.query('UPDATE canton_projection_sources SET synced_at=NOW() WHERE source=$1', [source]);
      await client.query('COMMIT');
      return { source, offset: String(begin), ledgerEnd: String(end), caughtUp: true, updates: 0 };
    }
    const filters = { cumulative: ['ComplianceAsset', 'TransferProposal'].map(name => ({
      identifierFilter: { TemplateFilter: { value: { templateId: `#canton-main:Main:${name}` } } },
    })) };
    const page = await read('/updates/get-updates-page', {
      beginOffsetExclusive: begin, endOffsetInclusive: end, maxPageSize: pageSize, descendingOrder: false,
      updateFormat: { includeTransactions: { transactionShape: 'TRANSACTION_SHAPE_ACS_DELTA',
        eventFormat: { verbose: true, filtersByParty: Object.fromEntries(scope.map(party => [party, filters])) },
      } },
    });
    const highest = offset(page.highestPageOffsetInclusive);
    if (highest < begin || highest > end || !Array.isArray(page.updates || [])) throw new Error('Invalid projection page');
    let previous = begin;
    for (const update of page.updates || []) {
      const tx = update.update?.Transaction?.value;
      if (!tx?.updateId || !Array.isArray(tx.events)) throw new Error('Unsupported ledger update; checkpoint unchanged');
      const position = offset(tx.offset);
      if (position <= previous || position > highest) throw new Error('Ledger updates not strictly ordered');
      previous = position;
      for (const wrapper of tx.events) {
        const event = wrapper.CreatedEvent || wrapper.ArchivedEvent;
        const created = !!wrapper.CreatedEvent;
        if (!event?.contractId || !Number.isInteger(event.nodeId) || !Array.isArray(event.witnessParties) ||
            event.packageName !== 'canton-main' || !/:Main:(ComplianceAsset|TransferProposal)$/.test(event.templateId)) {
          throw new Error('Unexpected ledger event; checkpoint unchanged');
        }
        const witnesses = event.witnessParties.filter(party => scope.includes(party));
        if (!witnesses.length) throw new Error('Event outside projection scope');
        await client.query(`INSERT INTO canton_events(source, update_id, node_id, ledger_offset, contract_id, event_type, witnesses, payload)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING`,
        [source, tx.updateId, event.nodeId, position, event.contractId, created ? 'created' : 'archived', witnesses, event]);
        if (created) {
          if (!event.createArgument) throw new Error('Missing contract payload');
          // Replay must not resurrect a contract already archived by a later event.
          await client.query(`INSERT INTO canton_contracts(source, contract_id, template_id, payload, witnesses, created_offset, created_update_id)
            VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`,
          [source, event.contractId, event.templateId, event.createArgument, witnesses, position, tx.updateId]);
        } else {
          const result = await client.query(`UPDATE canton_contracts SET archived_offset=$3 WHERE source=$1 AND contract_id=$2`, [source, event.contractId, position]);
          if (result.rowCount !== 1) throw new Error('Archive has no projected creation; reconciliation required');
        }
      }
    }
    // No token means the bounded interval has been fully read, including filtered-out offsets.
    const checkpoint = page.nextPageToken ? highest : end;
    if (checkpoint <= begin) throw new Error('Projection made no progress');
    await client.query('UPDATE canton_projection_sources SET last_offset=$2, synced_at=NOW() WHERE source=$1', [source, checkpoint]);
    await client.query('COMMIT');
    return { source, offset: String(checkpoint), ledgerEnd: String(end), caughtUp: checkpoint === end, updates: (page.updates || []).length };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}
module.exports = { syncPage };
