const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { once } = require('node:events');

test('ledger transfer requires recipient consent and scopes the inbox', async () => {
  const parties = {};
  for (const role of ['issuer', 'inspector', 'regulator', 'holder', 'outsider']) {
    const response = await fetch('http://127.0.0.1:7575/v2/parties', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ partyIdHint: `transfer-${role}-${randomUUID()}` }),
    });
    assert.equal(response.status, 200);
    parties[role] = (await response.json()).partyDetails.party;
  }
  const ids = Object.fromEntries(Object.keys(parties).map(role => [role, randomUUID()]));
  process.env.PORT = '0';
  process.env.CANTON_LOCAL_ENABLED = 'true';
  process.env.CANTON_ISSUANCE_ASSIGNMENTS = JSON.stringify({ [ids.issuer]: parties });
  process.env.CANTON_HOLDER_ASSIGNMENTS = JSON.stringify({
    [ids.holder]: { party: parties.holder, label: 'Approved recipient' },
    [ids.outsider]: { party: parties.outsider, label: 'Other holder' },
  });
  const { server } = require('../src/index');
  const { generateToken } = require('../src/middleware/auth');
  if (!server.listening) await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/api/ledger`;
  const tokens = Object.fromEntries(Object.keys(ids).map(role => [role, generateToken({ id: ids[role], role: role === 'outsider' ? 'holder' : role, email: `${role}@example.invalid` })]));
  async function call(path, role, body, method = body ? 'POST' : 'GET') {
    const response = await fetch(base + path, { method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens[role]}` },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, data: await response.json() };
  }
  try {
    const recipients = await call('/transfer-recipients', 'issuer');
    assert.equal(recipients.status, 200);
    assert.ok(recipients.data.recipients.some(item => item.userId === ids.holder && item.label === 'Approved recipient'));
    assert.equal((await call('/transfer-recipients', 'holder')).status, 403);
    const issued = await call('/assets', 'issuer', { assetId: randomUUID(), title: 'Transfer consent test' });
    assert.equal(issued.status, 201);
    const path = `/assets/${issued.data.contractId}/transfers`;
    const proposed = await call(path, 'issuer', { recipientUserId: ids.holder });
    assert.equal(proposed.status, 201, JSON.stringify(proposed.data));
    assert.equal(proposed.data.asset.holder, parties.issuer, 'proposal does not transfer custody');
    assert.equal(proposed.data.recipient, parties.holder);
    const proposalId = proposed.data.contractId;
    assert.ok(proposed.data.updateId);
    const inbox = await call('/transfers', 'holder');
    assert.equal(inbox.status, 200, JSON.stringify(inbox.data));
    assert.ok(inbox.data.transfers.some(item => item.contractId === proposalId));
    const other = await call('/transfers', 'outsider');
    assert.equal(other.status, 200);
    assert.ok(!other.data.transfers.some(item => item.contractId === proposalId));
    assert.equal((await call(`/transfers/${proposalId}/accept`, 'issuer', {})).status, 403);
    assert.equal((await call(`/transfers/${proposalId}/accept`, 'outsider', {})).status, 409);
    assert.equal((await call(`/transfers/${proposalId}/accept`, 'holder', { actAs: [parties.issuer] })).status, 400);
    const accepted = await call(`/transfers/${proposalId}/accept`, 'holder', {});
    assert.equal(accepted.status, 200, JSON.stringify(accepted.data));
    assert.equal(accepted.data.asset.holder, parties.holder);
    assert.equal(accepted.data.asset.assetId, issued.data.asset.assetId);
    assert.notEqual(accepted.data.contractId, issued.data.contractId);
    assert.ok(accepted.data.updateId);
    assert.equal((await call(`/transfers/${proposalId}/accept`, 'holder', {})).status, 409);
    const onward = await call(`/assets/${accepted.data.contractId}/transfers`, 'issuer', { recipientUserId: ids.outsider });
    assert.equal(onward.status, 201);
    const cancelPath = `/transfers/${onward.data.contractId}/cancel`;
    assert.equal((await call(cancelPath, 'holder', {})).status, 403);
    assert.equal((await call(cancelPath, 'issuer', { issuer: parties.issuer })).status, 400);
    const cancelled = await call(cancelPath, 'issuer', {});
    assert.equal(cancelled.status, 200, JSON.stringify(cancelled.data));
    assert.deepEqual(cancelled.data.asset, accepted.data.asset, 'cancellation preserves the previous holder and all asset data');
    assert.notEqual(cancelled.data.contractId, accepted.data.contractId);
    assert.ok(cancelled.data.updateId);
    assert.equal((await call(cancelPath, 'issuer', {})).status, 409);
    assert.equal((await call(`/transfers/${onward.data.contractId}/accept`, 'outsider', {})).status, 409);
    assert.equal((await call(`/transfers/${proposalId}/cancel`, 'issuer', {})).status, 409, 'accepted transfer cannot be cancelled');
    const after = await call('/transfers', 'holder');
    assert.ok(!after.data.transfers.some(item => item.contractId === proposalId));
    assert.equal((await call(path, 'holder', { recipientUserId: ids.holder })).status, 403);
    assert.equal((await call(path, 'issuer', { recipientUserId: randomUUID() })).status, 400);
    assert.equal((await call(path, 'issuer', { recipientUserId: ids.holder, newHolder: parties.outsider })).status, 400);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
