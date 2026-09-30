const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { once } = require('node:events');
const { query, closePool } = require('../src/db');

test('projected contracts are party-scoped and report checkpoint freshness', async () => {
  const source = `records-test-${randomUUID()}`;
  const userId = randomUUID();
  // Explicit database fixtures: this tests read authorization, not ledger ingestion.
  const party = `fixture-reader-${randomUUID()}`;
  const other = `fixture-other-${randomUUID()}`;
  process.env.PORT = '0';
  process.env.CANTON_LOCAL_ENABLED = 'true';
  process.env.CANTON_PROJECTION_SOURCE = source;
  process.env.CANTON_RECORD_ASSIGNMENTS = JSON.stringify({ [userId]: { party, role: 'holder' } });
  const { server } = require('../src/index');
  const { generateToken } = require('../src/middleware/auth');
  if (!server.listening) await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/api/ledger/records`;
  async function get(suffix = '', id = userId, role = 'holder') {
    return fetch(base + suffix, { headers: { Authorization: `Bearer ${generateToken({ id, role, email: 'fixture@example.invalid' })}` } });
  }
  try {
    await query(`INSERT INTO canton_projection_sources(source, participant_id, parties, last_offset, synced_at) VALUES($1,'fixture-participant',$2,100,NOW())`, [source, [party, other]]);
    for (const [id, witnesses, archived] of [['visible', [party], null], ['private', [other], null], ['archived', [party], 90]]) {
      await query(`INSERT INTO canton_contracts(source,contract_id,template_id,payload,witnesses,created_offset,archived_offset,created_update_id) VALUES($1,$2,'fixture:Main:ComplianceAsset',$3,$4,80,$5,'fixture-update')`, [source, id, { title: id, status: 'Verified' }, witnesses, archived]);
    }
    const response = await get();
    assert.equal(response.status, 200, await response.clone().text());
    const result = await response.json();
    assert.deepEqual(result.contracts.map(row => row.contract_id), ['visible']);
    assert.equal(result.checkpoint.offset, '100');
    assert.equal(result.checkpoint.stale, false);
    assert.ok(result.checkpoint.syncedAt);
    assert.equal((await fetch(base)).status, 401);
    assert.equal((await get('', randomUUID())).status, 403);
    assert.equal((await get('', userId, 'regulator')).status, 403);
    assert.equal((await get(`?party=${encodeURIComponent(other)}`)).status, 400);
    assert.equal((await get('?source=another-source')).status, 400);
    assert.equal((await get('?page=-1')).status, 400);
    assert.deepEqual((await (await get('?page=1')).json()).contracts, []);
    await query(`INSERT INTO canton_events(source, update_id, node_id, ledger_offset, contract_id, event_type, witnesses, payload) VALUES
      ($1,'fixture-update',0,80,'visible','created',$2,$3),
      ($1,'fixture-update',1,80,'private','created',$4,$5),
      ($1,'fixture-update-2',0,95,'visible','archived',$2,$6)`,
    [source, [party], { createArgument: { title: 'visible', status: 'Verified' } }, [other], { createArgument: { title: 'private', status: 'Verified' } }, { contractId: 'visible' }]);
    const eventsResponse = await get('/events');
    assert.equal(eventsResponse.status, 200, await eventsResponse.clone().text());
    const eventsResult = await eventsResponse.json();
    assert.deepEqual(eventsResult.events.map(row => [String(row.ledgerOffset), row.eventType]), [['95', 'archived'], ['80', 'created']], 'newest event first');
    assert.equal(eventsResult.events[0].title, 'visible', 'archived events resolve the title from the contract record');
    assert.equal(eventsResult.events[1].title, 'visible');
    assert.ok(eventsResult.events.every(row => row.contractId && row.updateId && Number.isInteger(row.nodeId) && row.eventId));
    assert.ok(!eventsResult.events.some(row => row.contractId === 'private'), 'events of other parties stay hidden');
    assert.equal(eventsResult.checkpoint.offset, '100');
    assert.equal((await fetch(base + '/events')).status, 401);
    assert.equal((await get('/events', randomUUID())).status, 403);
    assert.equal((await get('/events?party=x')).status, 400);
    await query("UPDATE canton_projection_sources SET synced_at=NOW()-INTERVAL '2 minutes' WHERE source=$1", [source]);
    assert.equal((await (await get()).json()).checkpoint.stale, true);
    await query('DELETE FROM canton_projection_sources WHERE source=$1', [source]);
    assert.equal((await get()).status, 503, 'uninitialized projection is not an empty successful result');
    assert.equal((await get('/events')).status, 503);
  } finally {
    await query('DELETE FROM canton_projection_sources WHERE source=$1', [source]);
    await new Promise(resolve => server.close(resolve));
    await closePool();
  }
});
