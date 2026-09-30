const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');

const config = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'sanitova',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
};

async function runMigrations() {
  const pool = new Pool(config);
  const client = await pool.connect();
  try {
    // Read and run all migration files in order
    const scriptsDir = path.join(__dirname, '..', '..', 'scripts');
    const files = fs.readdirSync(scriptsDir).sort();
    
    for (const file of files) {
      if (file.endsWith('.sql')) {
        console.log(`Running migration: ${file}`);
        const sql = fs.readFileSync(path.join(scriptsDir, file), 'utf8');
        await client.query(sql);
      }
    }
    console.log('✅ All migrations applied successfully');
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
