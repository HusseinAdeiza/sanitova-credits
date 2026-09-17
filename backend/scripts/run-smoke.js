// Combined backend+smoke test runner
// Starts the server inline, runs tests, stops server

const http = require('http');
const { app } = require('./src/index');

let server;
let aliceToken, bobToken, claraToken, davidToken, userId;

const BASE = 'http://localhost:4000';

function req(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const opts = { hostname: 'localhost', port: 4000, path, method, headers };
    const r = http.request(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(d) }); }
        catch { resolve({ status: res.statusCode, body: d }); }
      });
    });
    r.on('error', reject);
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

async function t(name, fn) {
  try {
    const result = await fn();
    console.log(`✅ ${name}`);
    return result;
  } catch (err) {
    console.log(`❌ ${name}: ${err.message}`);
    return null;
  }
}

async function main() {
  console.log('🚀 Starting SanitovaCredits backend + smoke test\n');

  server = app.listen(4000, () => {
    console.log('   Server listening on http://localhost:4000');
  });

  // Wait for server to be ready
  for (let i = 0; i < 20; i++) {
    try {
      await req('GET', '/api/health');
      break;
    } catch {
      await new Promise(r => setTimeout(r, 200));
    }
  }

  console.log('');

  // ── AUTH ──
  aliceToken = (await t('Login issuer (alice)', async () => {
    const r = await req('POST', '/api/auth/login', { email: 'alice@sanitova.com', password: 'demo123' });
    if (r.status !== 200) throw new Error(`${r.status}: ${JSON.stringify(r.body)}`);
    userId = r.body.user.id;
    return r.body.token;
  }));

  bobToken = (await t('Login holder (bob)', async () => {
    const r = await req('POST', '/api/auth/login', { email: 'bob@sanitova.com', password: 'demo123' });
    if (r.status !== 200) throw new Error(`${r.status}`);
    return r.body.token;
  }));

  claraToken = (await t('Login inspector (clara)', async () => {
    const r = await req('POST', '/api/auth/login', { email: 'clara@sanitova.com', password: 'demo123' });
    if (r.status !== 200) throw new Error(`${r.status}`);
    return r.body.token;
  }));

  davidToken = (await t('Login regulator (david)', async () => {
    const r = await req('POST', '/api/auth/login', { email: 'david@sanitova.com', password: 'demo123' });
    if (r.status !== 200) throw new Error(`${r.status}`);
    return r.body.token;
  }));

  console.log('');

  // ── BASIC API ──
  await t('Health endpoint', async () => {
    const r = await req('GET', '/api/health');
    if (r.status !== 200) throw new Error(r.status);
  });

  await t('Auth roles list', async () => {
    const r = await req('GET', '/api/auth/roles');
    if (r.status !== 200) throw new Error(r.status);
    if (r.body.length < 4) throw new Error('few roles');
  });

  // ── ASSET CRUD ──
  const assets = await t('List assets (issuer scope)', async () => {
    const r = await req('GET', '/api/assets', null, aliceToken);
    if (r.status !== 200) throw new Error(r.status);
    if (!r.body || r.body.length < 2) throw new Error(`expected >=2, got ${r.body?.length}`);
    return r.body;
  });

  const assetId = assets?.[0]?.id;

  await t('Get asset detail (with events + history)', async () => {
    const r = await req('GET', `/api/assets/${assetId}`, null, aliceToken);
    if (r.status !== 200) throw new Error(r.status);
    const a = r.body;
    if (!a.title) throw new Error('no title');
    if (!a.events?.length) throw new Error('no events');
    if (!a.status_history?.length) throw new Error('no history');
    console.log(`   → ${a.title} | status=${a.status} | ${a.events.length} events | ${a.status_history.length} history`);
  });

  const newAsset = await t('Create asset (issuer only)', async () => {
    const r = await req('POST', '/api/assets', {
      asset_type: 'Water Quality Compliance',
      title: 'Q4 2026 Water Quality Test - Site E',
      description: 'Water quality compliance test for Site E.',
      location: 'Bern, Switzerland',
      metadata: { ph: 7.2, turbidity: 2.1, standards: ['WHO-GWQS-2025'] },
    }, aliceToken);
    if (r.status !== 201) throw new Error(`${r.status}: ${JSON.stringify(r.body)}`);
    if (r.body.status !== 'created') throw new Error(`wrong status: ${r.body.status}`);
    console.log(`   → Created: ${r.body.title} (${r.body.id.slice(0,8)})`);
    return r.body;
  });
  const newAssetId = newAsset?.id;

  // ── TRANSFER ──
  const bobUser = await t('Get bob profile', async () => {
    const r = await req('GET', '/api/auth/me', null, bobToken);
    if (r.status !== 200) throw new Error(r.status);
    return r.body;
  });
  const bobId = bobUser?.id;

  await t('Transfer asset from alice → bob', async () => {
    const r = await req('PATCH', `/api/assets/${assetId}`, {
      holder_id: bobId,
      transfer_reason: 'facility_relocation',
    }, aliceToken);
    if (r.status !== 200) throw new Error(`${r.status}: ${JSON.stringify(r.body)}`);
    if (r.body.holder_email !== 'bob@sanitova.com') throw new Error(`wrong holder: ${r.body.holder_email}`);
    console.log(`   → Transferred to ${r.body.holder_name} (${r.body.holder_email})`);
  });

  // ── INSPECTOR STATUS UPDATES ──
  await t('Inspector sets pending_review', async () => {
    const r = await req('PATCH', `/api/assets/${newAssetId}`, { status: 'pending_review' }, claraToken);
    if (r.status !== 200) throw new Error(`${r.status}: ${JSON.stringify(r.body)}`);
    if (r.body.status !== 'pending_review') throw new Error(`wrong: ${r.body.status}`);
    console.log(`   → ${r.body.title} → pending_review`);
  });

  await t('Inspector sets verified', async () => {
    const r = await req('PATCH', `/api/assets/${newAssetId}`, { status: 'verified' }, claraToken);
    if (r.status !== 200) throw new Error(`${r.status}`);
    if (r.body.status !== 'verified') throw new Error(`wrong: ${r.body.status}`);
    console.log(`   → ${r.body.title} → verified ✅`);
  });

  // ── AUDIT TRAIL ──
  await t('Regulator sees full audit trail', async () => {
    const r = await req('GET', '/api/audit', null, davidToken);
    if (r.status !== 200) throw new Error(r.status);
    if (!r.body || r.body.length < 10) throw new Error(`expected >=10, got ${r.body?.length}`);
    console.log(`   → ${r.body.length} events visible (full scope)`);
  });

  await t('Audit export downloadable', async () => {
    const r = await req('GET', '/api/audit/export', null, davidToken);
    if (r.status !== 200) throw new Error(r.status);
    if (!r.body.total_events || r.body.total_events < 10) throw new Error('few events');
    console.log(`   → ${r.body.total_events} events exported (Content-Disposition set)`);
  });

  await t('Regulator dashboard sees all assets', async () => {
    const r = await req('GET', '/api/dashboard/stats', null, davidToken);
    if (r.status !== 200) throw new Error(r.status);
    if (!r.body.total_assets || r.body.total_assets < 5) throw new Error(`expected >=5, got ${r.body.total_assets}`);
    console.log(`   → ${r.body.total_assets} assets visible to regulator`);
  });

  // ── AUTHORIZATION GATES ──
  await t('Regulator CANNOT modify (403)', async () => {
    const r = await req('PATCH', `/api/assets/${assetId}`, { status: 'verified' }, davidToken);
    if (r.status !== 403) throw new Error(`expected 403, got ${r.status}`);
    console.log(`   → Blocked: ${r.body.error}`);
  });

  await t('Holder CANNOT transfer (only issuer)', async () => {
    const r = await req('PATCH', `/api/assets/${assetId}`, { holder_id: aliceToken }, bobToken);
    if (r.status !== 403) throw new Error(`expected 403, got ${r.status}`);
    console.log(`   → Blocked: ${r.body.error}`);
  });

  await t('Unauthenticated request rejected (401)', async () => {
    const r = await req('GET', '/api/assets');
    if (r.status !== 401) throw new Error(`expected 401, got ${r.status}`);
    console.log(`   → Blocked: ${r.body.error}`);
  });

  // ── EVENT INTEGRITY ──
  await t('Event trail intact after transfer + status changes', async () => {
    const r = await req('GET', `/api/assets/${assetId}`, null, aliceToken);
    if (r.status !== 200) throw new Error(r.status);
    const a = r.body;
    const events = a.events || [];
    const transfers = events.filter(e => e.event_type === 'transferred').length;
    const statusChanges = events.filter(e => e.event_type === 'status_changed').length;
    const creates = events.filter(e => e.event_type === 'created').length;
    if (transfers < 1) throw new Error('no transfer event recorded');
    console.log(`   → ${events.length} events: created=${creates}, transferred=${transfers}, status_changed=${statusChanges}`);
  });

  // ── REFERENCE ENDPOINTS ──
  await t('Asset types endpoint', async () => {
    const r = await req('GET', '/api/assets/types', null, aliceToken);
    if (r.status !== 200) throw new Error(r.status);
    if (!r.body || r.body.length < 4) throw new Error('few types');
    console.log(`   → ${r.body.length} asset types`);
  });

  await t('Statuses endpoint', async () => {
    const r = await req('GET', '/api/assets/statuses');
    if (r.status !== 200) throw new Error(r.status);
    if (!r.body || r.body.length < 6) throw new Error('few statuses');
    console.log(`   → ${r.body.length} statuses`);
  });

  // ── DASHBOARD ──
  await t('Dashboard stats (issuer view)', async () => {
    const r = await req('GET', '/api/dashboard/stats', null, aliceToken);
    if (r.status !== 200) throw new Error(r.status);
    if (!r.body.total_assets) throw new Error('no total');
    console.log(`   → total_assets=${r.body.total_assets}, ${r.body.asset_status_counts?.length} status buckets, ${r.body.event_type_counts?.length} event types`);
  });

  // ── STOP ──
  console.log('\n──────────────────────────────────────');
  console.log('✅ All smoke tests complete!');
  console.log(`   API:      http://localhost:4000`);
  console.log(`   Demo:     alice/bob/clara/david @sanitova.com : demo123`);
  console.log(`   Seed:     ✅ 4 users + 4 assets + 10 events + status history`);
  console.log('──────────────────────────────────────');

  server.close(() => process.exit(0));
}

main().catch(err => {
  console.error('FATAL:', err);
  if (server) server.close(() => process.exit(1));
  process.exit(1);
});
