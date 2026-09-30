// SanitovaCredits Backend Smoke Test
// Runs against localhost:4000

const http = require('http');

function request(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const opts = {
      hostname: 'localhost',
      port: 4000,
      path,
      method,
      headers,
    };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    const result = await fn();
    passed++;
    console.log(`✅ ${name}`);
    return result;
  } catch (err) {
    failed++;
    console.log(`❌ ${name}: ${err.message}`);
    return null;
  }
}

async function main() {
  console.log('🔍 SanitovaCredits Backend Smoke Test\n');

  // 1. Health
  await test('Health endpoint', async () => {
    const r = await request('GET', '/api/health');
    if (r.status !== 200) throw new Error(`status ${r.status}`);
    if (r.body.status !== 'ok') throw new Error('not ok');
    return r.body;
  });

  // 2. Login issuer
  const alice = await test('Login as issuer (alice)', async () => {
    const r = await request('POST', '/api/auth/login', { email: 'alice@sanitova.com', password: 'demo123' });
    if (r.status !== 200) throw new Error(`status ${r.status}: ${JSON.stringify(r.body)}`);
    const user = r.body.user;
    if (user.role !== 'issuer') throw new Error(`role ${user.role}`);
    return { ...r.body, userId: user.id, token: r.body.token };
  });
  const aliceToken = alice?.token;

  // 3. Get issuer profile
  await test('Get issuer profile (/api/auth/me)', async () => {
    const r = await request('GET', '/api/auth/me', null, aliceToken);
    if (r.status !== 200) throw new Error(`status ${r.status}`);
    if (r.body.role !== 'issuer') throw new Error(`wrong role ${r.body.role}`);
    return r.body;
  });

  // 4. List assets as issuer
  const issuerAssets = await test('List assets (issuer scope)', async () => {
    const r = await request('GET', '/api/assets', null, aliceToken);
    if (r.status !== 200) throw new Error(`status ${r.status}`);
    const assets = r.body;
    if (!Array.isArray(assets) || assets.length < 2) throw new Error(`expected >= 2, got ${assets.length}`);
    return assets;
  });

  // 5. Asset detail
  const firstAssetId = issuerAssets?.[0]?.id;
  await test('Asset detail with events + history', async () => {
    const r = await request('GET', `/api/assets/${firstAssetId}`, null, aliceToken);
    if (r.status !== 200) throw new Error(`status ${r.status}`);
    const a = r.body;
    if (!a.title) throw new Error('no title');
    if (!Array.isArray(a.events) || a.events.length === 0) throw new Error('events must be a non-empty array');
    if (!a.status_history || a.status_history.length === 0) throw new Error('no history');
    console.log(`   → ${a.title} | ${a.status} | ${a.events.length} events | ${a.status_history.length} history entries`);
    return a;
  });

  // 6. Create new asset
  const newAsset = await test('Create new asset', async () => {
    const r = await request('POST', '/api/assets', {
      asset_type: 'Water Quality Compliance',
      title: 'Q4 2026 Water Quality Test - Site E',
      description: 'Water quality compliance test measuring pH, turbidity, and contaminants.',
      location: 'Bern, Switzerland',
      metadata: { ph: 7.2, turbidity: 2.1, standards_applied: ['WHO-GWQS-2025'] },
    }, aliceToken);
    if (r.status !== 201) throw new Error(`status ${r.status}: ${JSON.stringify(r.body)}`);
    if (r.body.status !== 'created') throw new Error(`wrong status ${r.body.status}`);
    console.log(`   → ${r.body.title} (${r.body.id.slice(0, 8)}...) status=${r.body.status}`);
    return r.body;
  });
  const newAssetId = newAsset?.id;

  // 7. Transfer asset to bob
  const bob = await test('Login as holder (bob)', async () => {
    const r = await request('POST', '/api/auth/login', { email: 'bob@sanitova.com', password: 'demo123' });
    if (r.status !== 200) throw new Error(`status ${r.status}`);
    return r.body;
  });
  const bobToken = bob?.token;

  await test('Transfer asset to holder (bob)', async () => {
    const r = await request('PATCH', `/api/assets/${firstAssetId}`, {
      holder_id: bob.user.id,
      transfer_reason: 'facility_relocation',
    }, aliceToken);
    if (r.status !== 200) throw new Error(`status ${r.status}: ${JSON.stringify(r.body)}`);
    const a = r.body;
    if (a.holder_email !== 'bob@sanitova.com') throw new Error(`wrong holder ${a.holder_email}`);
    console.log(`   → Transferred to ${a.holder_name} (${a.holder_email})`);
    return a;
  });

  // 8. Inspector statuses
  const clara = await test('Login as inspector (clara)', async () => {
    const r = await request('POST', '/api/auth/login', { email: 'clara@sanitova.com', password: 'demo123' });
    if (r.status !== 200) throw new Error(`status ${r.status}`);
    return r.body;
  });
  const claraToken = clara?.token;

  await test('Inspector sets pending_review', async () => {
    const r = await request('PATCH', `/api/assets/${newAssetId}`, { status: 'pending_review' }, claraToken);
    if (r.status !== 200) throw new Error(`status ${r.status}: ${JSON.stringify(r.body)}`);
    if (r.body.status !== 'pending_review') throw new Error(`wrong status ${r.body.status}`);
    console.log(`   → ${r.body.title} → ${r.body.status}`);
    return r.body;
  });

  await test('Inspector verifies asset', async () => {
    const r = await request('PATCH', `/api/assets/${newAssetId}`, { status: 'verified' }, claraToken);
    if (r.status !== 200) throw new Error(`status ${r.status}`);
    if (r.body.status !== 'verified') throw new Error(`wrong status ${r.body.status}`);
    console.log(`   → ${r.body.title} → ${r.body.status} ✅`);
    return r.body;
  });

  // 9. Regulator audit trail
  const david = await test('Login as regulator (david)', async () => {
    const r = await request('POST', '/api/auth/login', { email: 'david@sanitova.com', password: 'demo123' });
    if (r.status !== 200) throw new Error(`status ${r.status}`);
    return r.body;
  });
  const davidToken = david?.token;

  await test('Regulator views full audit trail', async () => {
    const r = await request('GET', '/api/audit', null, davidToken);
    if (r.status !== 200) throw new Error(`status ${r.status}`);
    const events = r.body;
    if (!Array.isArray(events) || events.length < 10) throw new Error(`expected >= 10 events, got ${events.length}`);
    console.log(`   → ${events.length} events visible (full scope)`);
    return events;
  });

  await test('Audit export downloadable', async () => {
    const r = await request('GET', '/api/audit/export', null, davidToken);
    if (r.status !== 200) throw new Error(`status ${r.status}`);
    const exportData = r.body;
    if (!exportData.total_events || exportData.total_events < 10) throw new Error('not enough events');
    console.log(`   → ${exportData.total_events} events exported`);
    return exportData;
  });

  await test('Regulator dashboard sees all assets', async () => {
    const r = await request('GET', '/api/dashboard/stats', null, davidToken);
    if (r.status !== 200) throw new Error(`status ${r.status}`);
    const stats = r.body;
    if (!stats.total_assets || stats.total_assets < 5) throw new Error(`expected >= 5, got ${stats.total_assets}`);
    console.log(`   → ${stats.total_assets} assets visible to regulator`);
    return stats;
  });

  // 10. Authorization checks
  await test('Regulator CANNOT modify asset (403)', async () => {
    const r = await request('PATCH', `/api/assets/${firstAssetId}`, { status: 'verified' }, davidToken);
    if (r.status !== 403) throw new Error(`expected 403, got ${r.status}`);
    console.log(`   → Blocked: ${r.body.error}`);
    return r.body;
  });

  await test('Holder cannot transfer (only issuer)', async () => {
    const r = await request('PATCH', `/api/assets/${firstAssetId}`, {
      holder_id: alice.userId,
    }, bobToken);
    if (r.status !== 403) throw new Error(`expected 403, got ${r.status}`);
    console.log(`   → Blocked: ${r.body.error}`);
    return r.body;
  });

  await test('Unauthenticated request rejected', async () => {
    const r = await request('GET', '/api/assets');
    if (r.status !== 401) throw new Error(`expected 401, got ${r.status}`);
    console.log(`   → Blocked: ${r.body.error}`);
    return r.body;
  });

  // 11. Verify event trail after transfer
  await test('Event trail intact after transfer + status changes', async () => {
    const r = await request('GET', `/api/assets/${firstAssetId}`, null, aliceToken);
    if (r.status !== 200) throw new Error(`status ${r.status}`);
    const a = r.body;
    const hasTransfer = a.events?.some(e => e.event_type === 'transferred');
    const hasStatusChange = a.events?.some(e => e.event_type === 'status_changed');
    if (!hasTransfer) throw new Error('no transfer event');
    if (!hasStatusChange) throw new Error('no status change event');
    console.log(`   → ${a.events.length} events: created=${a.events.filter(e=>e.event_type==='created').length}, transferred=${a.events.filter(e=>e.event_type==='transferred').length}, status_changed=${a.events.filter(e=>e.event_type==='status_changed').length}`);
    return a;
  });

  // 12. Asset types and statuses endpoints
  await test('Asset types endpoint', async () => {
    const r = await request('GET', '/api/assets/types', null, aliceToken);
    if (r.status !== 200) throw new Error(`status ${r.status}`);
    const types = r.body;
    if (!types || types.length < 4) throw new Error('not enough types');
    console.log(`   → ${types.length} asset types available`);
    return types;
  });

  await test('Statuses endpoint', async () => {
    const r = await request('GET', '/api/assets/statuses');
    if (r.status !== 200) throw new Error(`status ${r.status}`);
    const statuses = r.body;
    if (!statuses || statuses.length < 6) throw new Error('not enough statuses');
    console.log(`   → ${statuses.length} statuses available`);
    return statuses;
  });

  console.log('\n──────────────────────────────');
  console.log(`Smoke test: ${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
  console.log(`   API: http://localhost:4000`);
  console.log(`   Frontend: http://localhost:5173 (Vite dev server)`);
  console.log('   Demo accounts: alice/bob/clara/david @sanitova.com : demo123');
  console.log('──────────────────────────────');
}

main().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
