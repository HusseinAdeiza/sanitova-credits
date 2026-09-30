const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { getClient } = require('../src/db');

test('PostgreSQL projection resumes in another process without duplicating ledger events', async () => {
  const { syncPage } = require('../src/ledger/projection');
  const source = `projection-test-${randomUUID()}`;
  const parties = {};
  for (const role of ['issuer', 'inspector', 'regulator', 'holder']) {
    const response = await fetch('http://127.0.0.1:7575/v2/parties', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ partyIdHint: `${source}-${role}` }),
    });
    assert.equal(response.status, 200);
    parties[role] = (await response.json()).partyDetails.party;
  }
  async function command(party, value) {
    const response = await fetch('http://127.0.0.1:7575/v2/commands/submit-and-wait-for-transaction', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commands: { userId: 'sanitova-local', commandId: randomUUID(), actAs: [party], commands: [value] } }),
    });
    assert.equal(response.status, 200, await response.clone().text());
    const tx = (await response.json()).transaction;
    return tx.events.find(event => event.CreatedEvent).CreatedEvent;
  }
  const asset = { issuer: parties.issuer, holder: parties.issuer, inspector: parties.inspector, regulator: parties.regulator, assetId: randomUUID(), title: 'Durable ledger projection', status: 'Created' };
  const first = await command(parties.issuer, { CreateCommand: { templateId: '#canton-main:Main:ComplianceAsset', createArguments: asset } });
  const options = { source, parties: [parties.issuer], pageSize: 1 };
  const client = await getClient();
  try {
    const initial = await syncPage(options);
    assert.ok(Number(initial.offset) >= Number(first.offset));
    const row = await client.query('SELECT * FROM canton_contracts WHERE source=$1 AND contract_id=$2', [source, first.contractId]);
    assert.deepEqual(row.rows[0].payload, asset);
    assert.equal(row.rows[0].archived_offset, null);
    const proposal = await command(parties.issuer, { ExerciseCommand: { templateId: '#canton-main:Main:ComplianceAsset', contractId: first.contractId, choice: 'ProposeTransfer', choiceArgument: { newHolder: parties.holder } } });
    const accepted = await command(parties.holder, { ExerciseCommand: { templateId: '#canton-main:Main:TransferProposal', contractId: proposal.contractId, choice: 'AcceptTransfer', choiceArgument: {} } });
    // Fail after the archive write but before proposal creation; no partial page may survive.
    const constraint = `projection_failure_${randomUUID().replaceAll('-', '')}`;
    await client.query(`ALTER TABLE canton_events ADD CONSTRAINT ${constraint} CHECK (source <> '${source}' OR event_type <> 'created' OR ledger_offset <= ${Number(first.offset)}) NOT VALID`);
    try {
      await assert.rejects(syncPage(options), /check constraint/);
      const checkpoint = await client.query('SELECT last_offset FROM canton_projection_sources WHERE source=$1', [source]);
      assert.equal(checkpoint.rows[0].last_offset, initial.offset);
      const unchanged = await client.query('SELECT archived_offset FROM canton_contracts WHERE source=$1 AND contract_id=$2', [source, first.contractId]);
      assert.equal(unchanged.rows[0].archived_offset, null);
      const unchangedEvents = await client.query('SELECT count(*)::int AS count FROM canton_events WHERE source=$1', [source]);
      assert.equal(unchangedEvents.rows[0].count, 1);
    } finally {
      await client.query(`ALTER TABLE canton_events DROP CONSTRAINT ${constraint}`);
    }
    // Fresh OS process has no cached in-memory receipt or checkpoint.
    const child = spawnSync(process.execPath, ['backend/scripts/sync-canton.js', '--once'], {
      cwd: require('node:path').resolve(__dirname, '../..'), encoding: 'utf8', timeout: 30000,
      env: { ...process.env, CANTON_PROJECTION_SOURCE: source, CANTON_PROJECTION_PARTIES: JSON.stringify(options.parties) },
    });
    assert.equal(child.status, 0, child.stderr);
    const resumed = JSON.parse(child.stdout.trim());
    assert.ok(Number(resumed.offset) > Number(initial.offset));
    await syncPage(options);
    const active = await client.query('SELECT * FROM canton_contracts WHERE source=$1 AND archived_offset IS NULL', [source]);
    assert.equal(active.rows.length, 1);
    assert.equal(active.rows[0].contract_id, accepted.contractId);
    assert.equal(active.rows[0].payload.holder, parties.holder);
    const before = await client.query('SELECT count(*)::int AS count FROM canton_events WHERE source=$1', [source]);
    assert.equal(before.rows[0].count, 5, 'one create, proposal archive/create, acceptance archive/create');
    // Deliberate checkpoint rewind in this test namespace proves idempotent replay.
    await client.query('UPDATE canton_projection_sources SET last_offset=0 WHERE source=$1', [source]);
    await syncPage({ ...options, pageSize: 50 });
    const after = await client.query('SELECT count(*)::int AS count FROM canton_events WHERE source=$1', [source]);
    assert.equal(after.rows[0].count, before.rows[0].count);
    const stillActive = await client.query('SELECT contract_id FROM canton_contracts WHERE source=$1 AND archived_offset IS NULL', [source]);
    assert.deepEqual(stillActive.rows.map(row => row.contract_id), [accepted.contractId]);
    await assert.rejects(syncPage({ ...options, parties: [parties.holder] }), /identity|scope/i);
  } finally {
    // Remove only this test's PostgreSQL projection, never ledger or app records.
    await client.query('DELETE FROM canton_projection_sources WHERE source=$1', [source]);
    client.release();
    await require('../src/db').closePool();
  }
});
