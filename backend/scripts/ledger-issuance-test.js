const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { once } = require('node:events');

test('authenticated issuer creates a real Canton compliance contract', async () => {
  const ledger = 'http://localhost:7575';
  const parties = {};
  for (const role of ['issuer', 'inspector', 'regulator']) {
    const response = await fetch(`${ledger}/v2/parties`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ partyIdHint: `issuance-${role}-${randomUUID()}` }),
    });
    assert.equal(response.status, 200, await response.clone().text());
    const data = await response.json();
    assert.ok(data.partyDetails?.party, 'allocation returns a real ledger party');
    parties[role] = data.partyDetails.party;
  }
  // Dedicated test process: no changes to the running application configuration.
  const issuerId = randomUUID();
  process.env.PORT = '0';
  process.env.CANTON_LOCAL_ENABLED = 'true';
  process.env.CANTON_ISSUANCE_ASSIGNMENTS = JSON.stringify({ [issuerId]: parties });
  const { server } = require('../src/index');
  const { generateToken } = require('../src/middleware/auth');
  if (!server.listening) await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const token = generateToken({ id: issuerId, role: 'issuer', email: 'fixture@example.invalid' });
  const assetId = randomUUID();
  const send = (body, bearer = token) => fetch(`${base}/api/ledger/assets`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) },
    body: JSON.stringify(body),
  });
  try {
    const body = { assetId, title: 'Ledger issuance integration test' };
    const response = await send(body);
    const data = await response.json();
    assert.equal(response.status, 201, JSON.stringify(data));
    assert.ok(data.contractId, 'real contract id');
    assert.ok(data.updateId, 'real ledger update id');
    assert.equal(data.asset.assetId, assetId);
    assert.equal(data.asset.issuer, parties.issuer);
    assert.equal(data.asset.holder, parties.issuer);
    assert.equal(data.asset.status, 'Created');
    const inspectorId = randomUUID();
    process.env.CANTON_INSPECTOR_ASSIGNMENTS = JSON.stringify({ [inspectorId]: parties.inspector });
    const inspectorToken = generateToken({ id: inspectorId, role: 'inspector', email: 'inspector@example.invalid' });
    const inspect = (bearer, body = { status: 'Verified' }, contractId = data.contractId) => fetch(`${base}/api/ledger/assets/${contractId}/status`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bearer}` }, body: JSON.stringify(body),
    });
    assert.equal((await inspect(token)).status, 403);
    assert.equal((await inspect(inspectorToken, { status: 'Verified', actAs: [parties.issuer] })).status, 400);
    const inspection = await inspect(inspectorToken);
    const updated = await inspection.json();
    assert.equal(inspection.status, 200, JSON.stringify(updated));
    assert.equal(updated.asset.status, 'Verified');
    assert.equal(updated.asset.assetId, assetId);
    assert.notEqual(updated.contractId, data.contractId);
    assert.ok(updated.updateId);
    assert.equal((await inspect(inspectorToken)).status, 409, 'stale contract cannot be updated');
    assert.equal((await send(body, '')).status, 401);
    const regulator = generateToken({ id: issuerId, role: 'regulator', email: 'fixture@example.invalid' });
    assert.equal((await send(body, regulator)).status, 403);
    const unmapped = generateToken({ id: randomUUID(), role: 'issuer', email: 'fixture@example.invalid' });
    assert.equal((await send(body, unmapped)).status, 403);
    assert.equal((await send({ ...body, issuer: parties.regulator })).status, 400);
    assert.equal((await send({ ...body, title: ' ' })).status, 400);
    process.env.CANTON_LOCAL_ENABLED = 'false';
    assert.equal((await send(body)).status, 503);
    process.env.CANTON_LOCAL_ENABLED = 'true';
    process.env.NODE_ENV = 'production';
    assert.equal((await send(body)).status, 503);
    delete process.env.NODE_ENV;
    console.log('Verified ledger update:', data.updateId, 'contract:', data.contractId);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
