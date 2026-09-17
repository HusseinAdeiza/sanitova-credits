// Explicit local-only ledger projection worker; no browser-supplied parties.
const fs = require('node:fs');
const path = require('node:path');
const { syncPage } = require('../src/ledger/projection');
const { closePool } = require('../src/db');
const once = process.argv.includes('--once');
let stopping = false;
process.on('SIGINT', () => { stopping = true; });
process.on('SIGTERM', () => { stopping = true; });

async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('Local projection is disabled in production');
  if (process.argv.slice(2).some(arg => arg !== '--once')) throw new Error('Supported option: --once');
  const override = process.env.CANTON_PROJECTION_PARTIES;
  if (!!override !== !!process.env.CANTON_PROJECTION_SOURCE) throw new Error('Specify both projection source and parties, or neither');
  const parties = override ? JSON.parse(override) : Object.values(JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../canton/local-app-parties.json'), 'utf8')).parties);
  const source = process.env.CANTON_PROJECTION_SOURCE || 'local-app';
  do {
    const result = await syncPage({ source, parties });
    if (once || !result.caughtUp || result.updates) console.log(JSON.stringify(result));
    if (once) break;
    if (result.caughtUp && !stopping) await new Promise(resolve => setTimeout(resolve, 3000));
  } while (!stopping);
}
main().catch(error => {
  // Fail closed on pruning, identity/scope changes or invalid data. No silent checkpoint reset.
  console.error(error.message);
  process.exitCode = 1;
}).finally(closePool);
