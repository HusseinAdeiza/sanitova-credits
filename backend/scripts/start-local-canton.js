// Explicit local-only launcher. Never use seeded account mapping in production.
const fs = require('node:fs');
const path = require('node:path');
const { query } = require('../src/db');
const configPath = path.resolve(__dirname, '../../canton/local-app-parties.json');
async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('Local launcher is disabled in production');
  const ready = await fetch('http://127.0.0.1:7575/readyz', { signal: AbortSignal.timeout(5000) });
  if (!ready.ok) throw new Error('Local Canton is not ready');
  const result = await query(`SELECT u.id, u.email, r.name AS role FROM users u JOIN roles r ON r.id=u.role_id WHERE u.is_active=true AND u.email = ANY($1)`, [['alice@sanitova.com', 'clara@sanitova.com', 'david@sanitova.com', 'bob@sanitova.com']]);
  const expected = { issuer: 'alice@sanitova.com', inspector: 'clara@sanitova.com', regulator: 'david@sanitova.com', holder: 'bob@sanitova.com' };
  const users = {};
  for (const [role, email] of Object.entries(expected)) {
    users[role] = result.rows.find(row => row.email === email && row.role === role);
    if (!users[role]) throw new Error(`Expected active local ${role} account is missing`);
  }
  let saved = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, 'utf8')) : { parties: {}, users: {} };
  for (const role of Object.keys(expected)) {
    if (saved.users[role] && saved.users[role] !== users[role].id) throw new Error('Local account IDs changed; review party mappings manually');
    if (!saved.parties[role]) {
      const response = await fetch('http://127.0.0.1:7575/v2/parties', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partyIdHint: `sanitova-app-${role}-${users[role].id}` }),
      });
      if (!response.ok) throw new Error(`Could not allocate ${role}; review existing party allocation before retrying`);
      const data = await response.json();
      if (!data.partyDetails?.party) throw new Error('Missing party allocation');
      saved.parties[role] = data.partyDetails.party;
      saved.users[role] = users[role].id;
      fs.writeFileSync(configPath, JSON.stringify(saved, null, 2));
    }
  }
  process.env.CANTON_LOCAL_ENABLED = 'true';
  process.env.CANTON_ISSUANCE_ASSIGNMENTS = JSON.stringify({ [users.issuer.id]: saved.parties });
  process.env.CANTON_INSPECTOR_ASSIGNMENTS = JSON.stringify({ [users.inspector.id]: saved.parties.inspector });
  process.env.CANTON_HOLDER_ASSIGNMENTS = JSON.stringify({ [users.holder.id]: { party: saved.parties.holder, label: 'Bob — approved local holder' } });
  process.env.CANTON_RECORD_ASSIGNMENTS = JSON.stringify(Object.fromEntries(Object.entries({
    [users.issuer.id]: { party: saved.parties.issuer, role: 'issuer' },
    [users.inspector.id]: { party: saved.parties.inspector, role: 'inspector' },
    [users.regulator.id]: { party: saved.parties.regulator, role: 'regulator' },
    [users.holder.id]: { party: saved.parties.holder, role: 'holder' },
  })));
  console.log('Local Canton enabled: Alice issuance/proposals, Clara inspection, Bob acceptance. Party mappings retained in canton/local-app-parties.json.');
  require('../src/index');
}
main().catch(error => { console.error(error.message); process.exit(1); });
