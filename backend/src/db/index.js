const fs = require('fs');
const path = require('path');

const poolConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'sanitova',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
};

const Pool = require('pg').Pool;
let pool;

function getPool() {
  if (!pool) {
    pool = new Pool(poolConfig);
    pool.on('error', (err) => console.error('[DB] Unexpected error on idle client:', err));
  }
  return pool;
}

async function query(text, params) {
  const start = Date.now();
  const result = await getPool().query(text, params);
  const duration = Date.now() - start;
  if (duration > 1000) console.log(`[Slow Query] ${duration}ms: ${text.substring(0, 100)}`);
  return result;
}

async function getClient() {
  return getPool().connect();
}

async function initDatabase() {
  const scriptsDir = path.join(__dirname, '..', 'scripts');
  const files = fs.readdirSync(scriptsDir).sort();
  for (const file of files) {
    if (file.endsWith('.sql')) {
      const sql = fs.readFileSync(path.join(scriptsDir, file), 'utf8');
      console.log(`[DB] Running migration: ${file}`);
      await query(sql);
    }
  }
  console.log('[DB] All migrations applied');
}

function seedDemoData(seedFn) {
  return async () => {
    try {
      await initDatabase();
      await seedFn();
      console.log('[DB] Demo data seeded');
    } catch (err) {
      console.error('[DB Seed] Error:', err.message);
      throw err;
    }
  };
}

// Dedicated CLI/test shutdown only; callers must release checked-out clients first.
async function closePool() {
  if (!pool) return;
  const closing = pool;
  pool = undefined;
  await closing.end();
}

module.exports = { query, getClient, initDatabase, seedDemoData, closePool };
