const assert = require('node:assert/strict');
const { test } = require('node:test');
const base = 'http://localhost:4000/api';

async function session(email) {
  const res = await fetch(`${base}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'demo123' }),
  });
  assert.equal(res.status, 200);
  const { token } = await res.json();
  return { Authorization: `Bearer ${token}` };
}

test('dashboard totals are numeric and match visible assets', async () => {
  const headers = await session('alice@sanitova.com');
  const stats = await (await fetch(`${base}/dashboard/stats`, { headers })).json();
  const assets = await (await fetch(`${base}/assets`, { headers })).json();
  assert.equal(stats.total_assets, assets.length);
  for (const key of ['asset_status_counts', 'event_type_counts', 'asset_type_counts']) {
    assert.ok(stats[key].every(row => Number.isInteger(row.count)));
  }
});

test('issuer gets real transfer recipients without sensitive fields', async () => {
  const headers = await session('alice@sanitova.com');
  const res = await fetch(`${base}/assets/holders`, { headers });
  assert.equal(res.status, 200);
  const holders = await res.json();
  assert.ok(holders.some(holder => holder.full_name === 'Bob Builder'));
  for (const holder of holders) {
    assert.match(holder.id, /^[0-9a-f-]{36}$/i);
    assert.deepEqual(Object.keys(holder).sort(), ['full_name', 'id', 'organization']);
  }
});

test('recipient directory is restricted to authenticated issuers', async () => {
  assert.equal((await fetch(`${base}/assets/holders`)).status, 401);
  const headers = await session('bob@sanitova.com');
  assert.equal((await fetch(`${base}/assets/holders`, { headers })).status, 403);
});
